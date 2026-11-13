#!/usr/bin/env bash
# HU-04 / RF-02 — Datos de demostración para probar el semáforo y la reasignación a mano, en el navegador.
#
#   bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh            # crea los datos
#   bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh --limpiar  # los borra
#
# Crea: una Secretaría (usuario demo.secretaria) y un Administrador (demo.admin), los dos con clave Demo-Clave-2026, cuatro RT de Calle con
# teléfono y email (rt.ana, rt.beto, rt.carla, rt.diego) y cinco edificios "DEMO …": dos de rt.beto (pendientes), uno de rt.ana (pendiente), uno de
# rt.carla con sus 2 máquinas inspeccionadas el 5/11/2026, y uno de rt.carla SIN ubicación. Con «Ver el semáforo al día»
# en 25/11/2026 los cuatro pendientes están en rojo.
#
# Requiere `npm run db:up` y `npm run dev` (o sólo la API: BASE_URL=http://127.0.0.1:3050) y docker. Son datos de
# desarrollo con una clave conocida: no se usan fuera de la máquina de quien prueba.

set -u
BASE_URL="${BASE_URL:-https://localhost:8050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
DB_NAME="${DB_NAME:-ascensores}"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

CURL=(curl -s --max-time 15)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem"); fi
if curl -V | grep -qi schannel; then CURL+=(--ssl-no-revoke); fi

sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d "$DB_NAME" -tAc "$1"; }

if [ "${1:-}" = "--limpiar" ]; then
  sql "delete from inspecciones_checklist where consorcio_id in (select id::text from consorcios where nombre like 'DEMO %')" >/dev/null
  sql "delete from consorcios where nombre like 'DEMO %'" >/dev/null   # borra también roles y reasignaciones
  sql "delete from usuarios where usuario in ('demo.secretaria','demo.admin','rt.ana','rt.beto','rt.carla','rt.diego')" >/dev/null
  sql "delete from intentos_login where usuario in ('demo.secretaria','demo.admin')" >/dev/null
  sql "select 'quedan → edificios DEMO: '||(select count(*) from consorcios where nombre like 'DEMO %')||' · reasignaciones: '||(select count(*) from reasignaciones_rt)||' · usuarios demo y rt: '||(select count(*) from usuarios where usuario like 'demo.%' or usuario like 'rt.%')"
  exit 0
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }

if [ "$(sql "select count(*) from consorcios where nombre like 'DEMO %'")" != "0" ]; then
  echo "Ya hay datos DEMO: corré primero con --limpiar."; exit 1
fi

HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.secretaria','Secretaria Demo','secretaria','$HASH')" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.admin','Administrador Demo','administrador','$HASH')" >/dev/null
# Desde HU-02 RF-05 la terna toma el teléfono y el email del RT nuevo: un RT sin contacto no puede recibir un edificio.
for rt in rt.ana rt.beto rt.carla rt.diego; do sql "insert into usuarios (usuario, nombre, rol, password_hash, telefono, email) values ('$rt','$rt','rt_calle','sin-login','11 4444-${rt#rt.}','$rt@demo.com')" >/dev/null; done

# Con el RLS estricto (HU-15 RNF-03) crear edificios y roles pide sesión: se ingresa como la Secretaría demo.
CLAVE="Demo-Clave-2026"
printf '{"usuario":"demo.secretaria","password":"%s"}' "$CLAVE" > "$TMP/login.json"
"${CURL[@]}" -o "$TMP/login-resp.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login.json" "$BASE_URL/api/auth/login"
TOKEN="$(json "$TMP/login-resp.json" 'b.accessToken')"
[ -n "$TOKEN" ] && [ "$TOKEN" != "undefined" ] || { echo "No se pudo ingresar como demo.secretaria (¿DATABASE_APP_PASSWORD y AUTH_JWT_SECRET definidas?)"; exit 1; }
CURL+=(-H "Authorization: Bearer $TOKEN")

edificio() { # edificio <nombre> <direccion> <lat> <lon|""> <rt> [inspeccionar]
  if [ -n "$4" ]; then UB="\"ubicacion\":{\"latitud\":$3,\"longitud\":$4},"; else UB=""; fi
  printf '{"nombre":"%s","direccion":"%s",%s"maquinas":[{"referenciaAgc":"M1"},{"referenciaAgc":"M2"}]}' "$1" "$2" "$UB" > "$TMP/a.json"
  "${CURL[@]}" -o "$TMP/r.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/a.json" "$BASE_URL/api/consorcios"
  ID="$(json "$TMP/r.json" 'b.id')"
  [ -n "$ID" ] && [ "$ID" != "undefined" ] || { echo "No se pudo crear $1 (¿están corriendo npm run db:up y npm run dev?)"; exit 1; }
  printf '{"rtCalle":{"nombre":"%s","telefono":"11 5555-0000"},"firmante":{"nombre":"Firmante Demo","email":"f@demo.com"},"eca":{"nombre":"ECA Demo","email":"e@demo.com"}}' "$5" > "$TMP/ro.json"
  "${CURL[@]}" -o /dev/null -X PUT -H 'Content-Type: application/json' -d @"$TMP/ro.json" "$BASE_URL/api/consorcios/$ID/roles"
  if [ "${6:-}" = "inspeccionar" ]; then
    for n in 0 1; do
      MAQ="$(json "$TMP/r.json" "b.maquinas[$n].id")"
      printf '{"consorcioId":"%s","maquinaId":"%s","referenciaAgc":"M%s","tipoMaquina":"traccion","estadoEquipo":"en_uso","datos":{}}' "$ID" "$MAQ" "$((n+1))" > "$TMP/i.json"
      "${CURL[@]}" -o "$TMP/ir.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/i.json" "$BASE_URL/api/checklist/inspecciones"
      sql "update inspecciones_checklist set created_at='2026-11-05T10:00:00-03:00' where id='$(json "$TMP/ir.json" 'b.id')'" >/dev/null
    done
  fi
  echo "  $1 → RT $5$([ "${6:-}" = "inspeccionar" ] && echo " (inspeccionado el 5/11)")"
}

echo "Creando datos de demostración…"
edificio "DEMO Rivadavia 1234" "Av. Rivadavia 1234, CABA" -34.6118 -58.3960 rt.ana
edificio "DEMO Cabildo 1540"   "Av. Cabildo 1540, CABA"   -34.5600 -58.4500 rt.beto
edificio "DEMO Corrientes 100" "Av. Corrientes 100, CABA" -34.6040 -58.3750 rt.beto
edificio "DEMO Santa Fe 3200"  "Av. Santa Fe 3200, CABA"  -34.5880 -58.4100 rt.carla inspeccionar
edificio "DEMO Sin ubicacion"  "Calle Sin Mapa 1, CABA"   0 "" rt.carla
echo "Listo. Ingresar como demo.secretaria / Demo-Clave-2026 y, en Secretaría › Semáforo, elegir el día 25/11/2026."
echo "Para borrar todo: bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh --limpiar"

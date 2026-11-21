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
# También crea un Firmante (demo.firmante) y un usuario de ECA (demo.eca), con la misma clave (HU-14 RF-03). Los tres primeros
# edificios tienen en su terna a demo.firmante y a «ECA Demo»; los dos de rt.carla, a firmante.otro y a «ECA Otra». El Portal Firmante
# reconoce al Firmante porque su usuario es el nombre que figura en la terna (igual que los RT): demo.firmante ve las máquinas de
# tres edificios y no las de los otros dos, y demo.eca ve sólo los edificios de «ECA Demo».
# Correrlo de nuevo no duplica nada: si los edificios DEMO ya existen, sólo completa las cuentas que falten.
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
  # Con la API levantada, los edificios se borran a través de ella: así la vista de firma (que vive en la API) saca sus máquinas
  # en el momento. Borrarlos sólo con SQL las deja visibles hasta reiniciar la API (HU-14 RF-03).
  printf '{"usuario":"demo.secretaria","password":"Demo-Clave-2026"}' > "${TMPDIR:-/tmp}/demo-limpiar-login.json"
  TOKEN_L="$("${CURL[@]}" -X POST -H 'Content-Type: application/json' -d @"${TMPDIR:-/tmp}/demo-limpiar-login.json" "$BASE_URL/api/auth/login" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).accessToken||"")}catch{console.log("")}})')"
  rm -f "${TMPDIR:-/tmp}/demo-limpiar-login.json"
  if [ -n "$TOKEN_L" ]; then
    for id in $(sql "select id from consorcios where nombre like 'DEMO %'"); do
      "${CURL[@]}" -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN_L" "$BASE_URL/api/consorcios/$id"
    done
  else
    echo "Aviso: la API no respondió; se borra sólo en la base y la vista de firma se corrige al reiniciar la API."
  fi
  sql "delete from firma_visitas where maquina_id in (select m.id::text from maquinas m join consorcios c on c.id = m.consorcio_id where c.nombre like 'DEMO %')" >/dev/null
  sql "delete from inspecciones_checklist where consorcio_id in (select id::text from consorcios where nombre like 'DEMO %')" >/dev/null
  sql "delete from consorcios where nombre like 'DEMO %'" >/dev/null   # borra también roles y reasignaciones
  sql "delete from usuarios where usuario in ('demo.secretaria','demo.admin','demo.firmante','demo.eca','rt.ana','rt.beto','rt.carla','rt.diego')" >/dev/null
  sql "delete from intentos_login where usuario in ('demo.secretaria','demo.admin','demo.firmante','demo.eca')" >/dev/null
  sql "select 'quedan → edificios DEMO: '||(select count(*) from consorcios where nombre like 'DEMO %')||' · reasignaciones: '||(select count(*) from reasignaciones_rt)||' · usuarios demo y rt: '||(select count(*) from usuarios where usuario like 'demo.%' or usuario like 'rt.%')"
  exit 0
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }

HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
# "on conflict do nothing": correr el script dos veces no duplica ni falla (HU-14 RF-03).
cuenta() { sql "insert into usuarios (usuario, nombre, rol, password_hash, telefono, email, eca) values ($1,'$HASH',$2) on conflict do nothing" >/dev/null; }
cuenta "'demo.secretaria','Secretaria Demo','secretaria'" "null, null, null"
cuenta "'demo.admin','Administrador Demo','administrador'" "null, null, null"
# El Firmante se reconoce porque su usuario es el nombre de la terna; la ECA, por el nombre de su empresa.
cuenta "'demo.firmante','Firmante Demo','firmante'" "null, 'f@demo.com', null"
cuenta "'demo.eca','ECA Demo','eca'" "null, null, 'ECA Demo'"
# Desde HU-02 RF-05 la terna toma el teléfono y el email del RT nuevo: un RT sin contacto no puede recibir un edificio.
# Los RT entran con la misma clave de demostración: el checklist es sólo del RT (HU-06 RF-06), así que la inspección del 5/11 la carga
# con su propia sesión el RT del edificio.
for rt in rt.ana rt.beto rt.carla rt.diego; do cuenta "'$rt','$rt','rt_calle'" "'11 4444-${rt#rt.}', '$rt@demo.com', null"; done

if [ "$(sql "select count(*) from consorcios where nombre like 'DEMO %'")" != "0" ]; then
  echo "Ya están los edificios DEMO: no se crea nada más (las cuentas que faltaban quedaron creadas)."
  echo "Para empezar de cero: bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh --limpiar"
  exit 0
fi

# Con el RLS estricto (HU-15 RNF-03) crear edificios y roles pide sesión: se ingresa como la Secretaría demo.
CLAVE="Demo-Clave-2026"
printf '{"usuario":"demo.secretaria","password":"%s"}' "$CLAVE" > "$TMP/login.json"
"${CURL[@]}" -o "$TMP/login-resp.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login.json" "$BASE_URL/api/auth/login"
TOKEN="$(json "$TMP/login-resp.json" 'b.accessToken')"
[ -n "$TOKEN" ] && [ "$TOKEN" != "undefined" ] || { echo "No se pudo ingresar como demo.secretaria (¿DATABASE_APP_PASSWORD y AUTH_JWT_SECRET definidas?)"; exit 1; }
CURL_BASE=("${CURL[@]}")
CURL+=(-H "Authorization: Bearer $TOKEN")

edificio() { # edificio <nombre> <direccion> <lat> <lon|""> <rt> [inspeccionar]
  if [ -n "$4" ]; then UB="\"ubicacion\":{\"latitud\":$3,\"longitud\":$4},"; else UB=""; fi
  printf '{"nombre":"%s","direccion":"%s",%s"maquinas":[{"referenciaAgc":"M1"},{"referenciaAgc":"M2"}]}' "$1" "$2" "$UB" > "$TMP/a.json"
  "${CURL[@]}" -o "$TMP/r.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/a.json" "$BASE_URL/api/consorcios"
  ID="$(json "$TMP/r.json" 'b.id')"
  [ -n "$ID" ] && [ "$ID" != "undefined" ] || { echo "No se pudo crear $1 (¿están corriendo npm run db:up y npm run dev?)"; exit 1; }
  printf '{"rtCalle":{"nombre":"%s","telefono":"11 5555-0000"},"firmante":{"nombre":"%s","email":"%s"},"eca":{"nombre":"%s","email":"%s"}}' \
    "$5" "$FIRMANTE" "$FIRMANTE_EMAIL" "$ECA" "$ECA_EMAIL" > "$TMP/ro.json"
  "${CURL[@]}" -o /dev/null -X PUT -H 'Content-Type: application/json' -d @"$TMP/ro.json" "$BASE_URL/api/consorcios/$ID/roles"
  if [ "${6:-}" = "inspeccionar" ]; then
    printf '{"usuario":"%s","password":"%s"}' "$5" "$CLAVE" > "$TMP/login-rt.json"
    "${CURL_BASE[@]}" -o "$TMP/login-rt-resp.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login-rt.json" "$BASE_URL/api/auth/login"
    TOKEN_RT="$(json "$TMP/login-rt-resp.json" 'b.accessToken')"
    [ -n "$TOKEN_RT" ] && [ "$TOKEN_RT" != "undefined" ] || { echo "No se pudo ingresar como $5 para cargar la inspección de $1"; exit 1; }
    for n in 0 1; do
      MAQ="$(json "$TMP/r.json" "b.maquinas[$n].id")"
      printf '{"consorcioId":"%s","maquinaId":"%s","referenciaAgc":"M%s","tipoMaquina":"traccion","estadoEquipo":"en_uso","datos":{}}' "$ID" "$MAQ" "$((n+1))" > "$TMP/i.json"
      "${CURL_BASE[@]}" -H "Authorization: Bearer $TOKEN_RT" -o "$TMP/ir.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/i.json" "$BASE_URL/api/checklist/inspecciones"
      INSP="$(json "$TMP/ir.json" 'b.id')"
      [ -n "$INSP" ] && [ "$INSP" != "undefined" ] || { echo "No se pudo cargar la inspección de $1: $(head -c 300 "$TMP/ir.json")"; exit 1; }
      sql "update inspecciones_checklist set created_at='2026-11-05T10:00:00-03:00' where id='$INSP'" >/dev/null
    done
  fi
  echo "  $1 → RT $5$([ "${6:-}" = "inspeccionar" ] && echo " (inspeccionado el 5/11)")"
}

echo "Creando datos de demostración…"
FIRMANTE="demo.firmante"; FIRMANTE_EMAIL="f@demo.com"; ECA="ECA Demo"; ECA_EMAIL="e@demo.com"
edificio "DEMO Rivadavia 1234" "Av. Rivadavia 1234, CABA" -34.6118 -58.3960 rt.ana
edificio "DEMO Cabildo 1540"   "Av. Cabildo 1540, CABA"   -34.5600 -58.4500 rt.beto
edificio "DEMO Corrientes 100" "Av. Corrientes 100, CABA" -34.6040 -58.3750 rt.beto
# Otro Firmante y otra ECA: lo que demo.firmante y demo.eca no tienen que ver.
FIRMANTE="firmante.otro"; FIRMANTE_EMAIL="otro@demo.com"; ECA="ECA Otra"; ECA_EMAIL="otra@demo.com"
edificio "DEMO Santa Fe 3200"  "Av. Santa Fe 3200, CABA"  -34.5880 -58.4100 rt.carla inspeccionar
edificio "DEMO Sin ubicacion"  "Calle Sin Mapa 1, CABA"   0 "" rt.carla
echo "Listo. Ingresar como demo.secretaria / Demo-Clave-2026 y, en Secretaría › Semáforo, elegir el día 25/11/2026."
echo "Portal Firmante: demo.firmante · Portal ECA: demo.eca (misma clave)."
echo "Para borrar todo: bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh --limpiar"

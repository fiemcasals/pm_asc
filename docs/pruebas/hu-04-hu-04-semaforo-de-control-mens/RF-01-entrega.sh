#!/usr/bin/env bash
# HU-04 / RF-01 (REQ-1791910395389) — Motor de control semafórico por antigüedad de visita.
#
# Recorre las 4 condiciones de aprobación contra el entorno levantado:
#   bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-01-entrega.sh
#   bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-01-entrega.sh --carga 200
#
# Requiere, desde la raíz del repo: `npm run db:up` y `npm run dev` corriendo (o sólo la API:
# BASE_URL=http://127.0.0.1:3050 si no levantaste la web), y docker para fijar las fechas de las
# inspecciones de prueba (la API siempre registra una inspección con la hora de "ahora"; el script
# la mueve en la base para poder probar cada tramo del mes sin esperar al calendario).
#
# Datos que deja: ninguno. Crea 3 edificios "RF01-entrega-<pid> S1..S3" con sus máquinas, un RT de Calle
# y 3 inspecciones, y los borra al terminar, también si algo falla.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
DB_NAME="${DB_NAME:-ascensores}"
PREFIJO="RF01-entrega-$$"
ZONA="-03:00" # Buenos Aires

CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-100}"
fi

# --- TLS: confiar en el CA local de mkcert (y en Windows/Schannel, no consultar revocación)
CURL=(curl -s --max-time 15)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
fi
if curl -V | grep -qi schannel; then
  CURL+=(--ssl-no-revoke)
fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

TMP="$(mktemp -d)"
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d "$DB_NAME" -tAc "$1" 2>/dev/null; }
CONSORCIOS=()
limpiar() {
  for id in "${CONSORCIOS[@]:-}"; do
    [ -n "$id" ] && sql "delete from inspecciones_checklist where consorcio_id = '$id'" >/dev/null
    [ -n "$id" ] && "${CURL[@]}" -o /dev/null -X DELETE "$BASE_URL/api/consorcios/$id"
  done
  sql "delete from usuarios where usuario = '$PREFIJO-sec'" >/dev/null
  sql "delete from intentos_login where usuario = '$PREFIJO-sec'" >/dev/null
  rm -rf "$TMP"
}
trap limpiar EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }
get() { "${CURL[@]}" -o "$TMP/sem.json" -w '%{http_code}' "$BASE_URL/api/semaforo$1"; }
# edificio <clave S1..S3> <expresión sobre "e"> → valor, sobre la última respuesta de get
edificio() { json "$TMP/sem.json" "(b.edificios.find(e=>e.nombre.endsWith(' $1'))||{}) && (e=>$2)(b.edificios.find(e=>e.nombre.endsWith(' $1'))||{})"; }

crear_edificio() { # crear_edificio <clave> <maquinas JSON> → deja el id en $TMP/<clave>.id y los de las máquinas en $TMP/<clave>.maq
  printf '{"nombre":"%s %s","direccion":"Calle %s 100, CABA","maquinas":%s}' "$PREFIJO" "$1" "$1" "$2" > "$TMP/alta.json"
  code="$("${CURL[@]}" -o "$TMP/alta-resp.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$TMP/alta.json" "$BASE_URL/api/consorcios")"
  id="$(json "$TMP/alta-resp.json" 'b.id')"
  [ "$code" = "201" ] && [ -n "$id" ] || { echo "  ❌ no se pudo crear el edificio $1 (HTTP $code). ¿Están corriendo npm run db:up y npm run dev?"; exit 1; }
  CONSORCIOS+=("$id"); echo "$id" > "$TMP/$1.id"; json "$TMP/alta-resp.json" 'b.maquinas.map(m=>m.id).join(" ")' > "$TMP/$1.maq"
}
inspeccionar() { # inspeccionar <clave> <n.º de máquina 1..> <instante ISO con zona>
  id="$(cat "$TMP/$1.id")"; maq="$(cut -d' ' -f"$2" "$TMP/$1.maq")"
  printf '{"consorcioId":"%s","maquinaId":"%s","referenciaAgc":"M%s","tipoMaquina":"traccion","estadoEquipo":"en_uso","datos":{}}' "$id" "$maq" "$2" > "$TMP/insp.json"
  code="$("${CURL[@]}" -o "$TMP/insp-resp.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$TMP/insp.json" "$BASE_URL/api/checklist/inspecciones")"
  [ "$code" = "201" ] || { echo "  ❌ no se pudo registrar la inspección de $1 (HTTP $code)"; exit 1; }
  [ -n "${3:-}" ] && sql "update inspecciones_checklist set created_at = '$3'::timestamptz where id = '$(json "$TMP/insp-resp.json" 'b.id')'" >/dev/null
}

# Con el RLS estricto (HU-15 RNF-03) las rutas con datos piden sesión: se crea una Secretaría de prueba y se ingresa.
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
if [ -z "$(sql 'select 1')" ]; then echo "  ❌ no hay acceso a la base por docker ($DB_CONTAINER)"; exit 1; fi
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Clave-Segura-2026",4))')"
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('$PREFIJO-sec','$PREFIJO-sec','secretaria','$HASH')" >/dev/null
printf '{"usuario":"%s-sec","password":"Clave-Segura-2026"}' "$PREFIJO" > "$TMP/login.json"
"${CURL[@]}" -o "$TMP/login-resp.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login.json" "$BASE_URL/api/auth/login"
TOKEN="$(json "$TMP/login-resp.json" 'b.accessToken')"
[ -n "$TOKEN" ] && [ "$TOKEN" != "undefined" ] || { echo "  ❌ no se pudo ingresar como Secretaría (¿DATABASE_APP_PASSWORD y AUTH_JWT_SECRET definidas?)"; exit 1; }
CURL+=(-H "Authorization: Bearer $TOKEN")

if [ "$CARGA" -gt 0 ]; then
  EDIFICIOS_CARGA=30
  echo "== Modo carga: sembrando $EDIFICIOS_CARGA edificios (2 máquinas, 1 inspección cada uno) y $CARGA consultas de GET $BASE_URL/api/semaforo"
  for n in $(seq 1 $EDIFICIOS_CARGA); do
    crear_edificio "L$n" '[{"referenciaAgc":"M1"},{"referenciaAgc":"M2"}]'
    inspeccionar "L$n" 1 ""
  done
  fallidas=0
  : > "$TMP/tiempos"
  for _ in $(seq 1 "$CARGA"); do
    out="$("${CURL[@]}" -o /dev/null -w '%{http_code} %{time_total}' "$BASE_URL/api/semaforo")"
    [ "${out%% *}" = "200" ] || fallidas=$((fallidas + 1))
    echo "${out##* }" >> "$TMP/tiempos"
  done
  total="$("${CURL[@]}" "$BASE_URL/api/semaforo" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).edificios.length)')"
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v f="$fallidas" -v e="$total" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  consultas: %d · fallidas: %d · edificios de la respuesta (con los demás de la base): %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, f, e, s / NR * 1000, p95 * 1000, t[NR] * 1000
    }'
  [ "$fallidas" -eq 0 ]
  exit $?
fi

echo "== HU-04 / RF-01 contra $BASE_URL"
if [ -z "$(sql 'select 1')" ]; then
  echo "  ❌ no hay acceso a la base por docker ($DB_CONTAINER): hace falta para fijar las fechas de las inspecciones de prueba"
  exit 1
fi

echo "Preparando 3 edificios de prueba…"
crear_edificio S1 '[{"referenciaAgc":"M1"}]'                              # inspeccionado el 5/11
crear_edificio S2 '[{"referenciaAgc":"M1"},{"referenciaAgc":"M2"}]'       # una de dos inspeccionada el 8/11
crear_edificio S3 '[{"referenciaAgc":"M1"}]'                              # sin inspecciones
printf '{"rtCalle":{"nombre":"Ana Pérez","telefono":"11 5555-0000"},"firmante":{"nombre":"Firmante Prueba","email":"f@prueba.com"},"eca":{"nombre":"ECA Prueba","email":"e@prueba.com"}}' > "$TMP/roles.json"
"${CURL[@]}" -o /dev/null -X PUT -H 'Content-Type: application/json' -d @"$TMP/roles.json" "$BASE_URL/api/consorcios/$(cat "$TMP/S2.id")/roles"
inspeccionar S1 1 "2026-11-05T10:00:00$ZONA"
inspeccionar S2 1 "2026-11-08T09:30:00$ZONA"

echo "1. Un edificio inspeccionado en el mes está en verde, cualquiera sea el día"
for fecha in 2026-11-05 2026-11-15 2026-11-25 2026-11-30; do
  get "?fecha=$fecha" >/dev/null
  c="$(edificio S1 'e.color+"/"+e.estado')"
  [ "$c" = "verde/inspeccionado" ] && pass "$fecha → S1: $c" || fail "$fecha → S1: '$c' (se esperaba verde/inspeccionado)"
done

echo "2. Un pendiente es verde del 1 al 10, amarillo del 11 al 20 y rojo del 21 al último día, incluido el 31"
for par in 2026-11-01:verde 2026-11-10:verde 2026-11-11:amarillo 2026-11-20:amarillo 2026-11-21:rojo 2026-11-30:rojo 2026-12-31:rojo; do
  fecha="${par%%:*}"; esperado="${par##*:}"
  get "?fecha=$fecha" >/dev/null
  c="$(edificio S3 'e.color+"/"+e.estado')"
  [ "$c" = "$esperado/pendiente" ] && pass "$fecha → S3 pendiente: $esperado" || fail "$fecha → S3: '$c' (se esperaba $esperado/pendiente)"
done

echo "3. El 1.º del mes todos vuelven a pendiente"
get "?fecha=2026-12-01" >/dev/null
todos="$(json "$TMP/sem.json" 'b.edificios.filter(e=>e.nombre.startsWith("'"$PREFIJO"'")).map(e=>e.estado+":"+e.maquinasInspeccionadas).join(",")')"
[ "$todos" = "pendiente:0,pendiente:0,pendiente:0" ] && pass "2026-12-01 → S1, S2 y S3: $todos (las inspecciones de noviembre ya no cuentan)" || fail "2026-12-01 → '$todos'"
get "?fecha=2026-11-30" >/dev/null
[ "$(edificio S1 'e.estado')" = "inspeccionado" ] && pass "2026-11-30 → S1 sigue inspeccionado (el reinicio es del mes siguiente)" || fail "2026-11-30 → S1 ya no figura inspeccionado"

echo "4. Por edificio devuelve color, día de la última inspección del mes y RT de Calle asignado"
get "?fecha=2026-11-12" >/dev/null
s2="$(edificio S2 'JSON.stringify({color:e.color,estado:e.estado,dia:e.diaUltimaInspeccion,rt:e.rtCalle&&e.rtCalle.nombre,insp:e.maquinasInspeccionadas+"/"+e.maquinas})')"
[ "$s2" = '{"color":"amarillo","estado":"pendiente","dia":8,"rt":"Ana Pérez","insp":"1/2"}' ] && pass "S2 → $s2" || fail "S2 → $s2"
s1="$(edificio S1 'JSON.stringify({dia:e.diaUltimaInspeccion,rt:e.rtCalle})')"
[ "$s1" = '{"dia":5,"rt":null}' ] && pass "S1 (sin RT asignado) → $s1" || fail "S1 → $s1"
s3="$(edificio S3 'JSON.stringify({dia:e.diaUltimaInspeccion,rt:e.rtCalle})')"
[ "$s3" = '{"dia":null,"rt":null}' ] && pass "S3 (sin inspecciones ni RT) → $s3" || fail "S3 → $s3"

echo "   y una fecha inválida responde 400"
code="$(get "?fecha=2026-02-30")"
[ "$code" = "400" ] && pass "?fecha=2026-02-30 → HTTP $code" || fail "?fecha=2026-02-30 → HTTP $code (se esperaba 400)"

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

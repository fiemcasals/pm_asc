#!/usr/bin/env bash
# HU-15 / RNF-01 (REQ-1794493999440) — Row Level Security por ECA.
#
# Verifica rol runtime sin BYPASSRLS ni propiedad, RLS activo en las tablas con datos de ECA,
# 0 filas para una ECA sin edificios y aislamiento estricto entre 2 ECAs, ingresando con una sesión
# real (desde HU-15 RNF-03 el contexto de ECA sale de la sesión y ya no de un header).
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-01-entrega.sh
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-01-entrega.sh --carga 20
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y, para la corrida
# normal, los datos de demostración: bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea usuarios temporales `h15r1-*` (tres ECA y un RT) y dos edificios de prueba, y los borra al terminar.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-20}"
fi

CURL=(curl -s --max-time 10)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
elif echo "$BASE_URL" | grep -qE '^https://(localhost|127\.0\.0\.1)(:|/)'; then
  CURL+=(-k)
fi
if curl -V | grep -qi schannel; then
  CURL+=(--ssl-no-revoke)
fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
TMP="$(mktemp -d)"
SEC=""
ID_A=""
ID_B=""
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
cleanup() {
  for id in "$ID_A" "$ID_B"; do
    [ -n "$id" ] && [ -n "$SEC" ] && "${CURL[@]}" -X DELETE -H "Authorization: Bearer $SEC" "$BASE_URL/api/consorcios/$id" >/dev/null 2>&1
  done
  sql "delete from usuarios where usuario like 'h15r1-%'" >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined||v===null?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; "${CURL[@]}" -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }

ECA_A="ECA-A-ENTREGA"
ECA_B="ECA-B-ENTREGA"
ECA_C="ECA-C-SIN-EDIFICIOS"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h15r1-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('h15r1-eca-a','ECA A','eca','$ECA_A','$HASH'),
  ('h15r1-eca-b','ECA B','eca','$ECA_B','$HASH'),
  ('h15r1-eca-c','ECA C','eca','$ECA_C','$HASH')" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash, telefono, email) values ('h15r1-rt','h15r1-rt','rt_calle','sin-login','11 4444-0001','h15r1-rt@demo.com')" >/dev/null

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA consultas consecutivas de una ECA con sesión bajo RLS contra $BASE_URL"
  TOKEN_CARGA="$(login h15r1-eca-a)"
  [ -n "$TOKEN_CARGA" ] || { echo "  ❌ no pude ingresar como h15r1-eca-a"; exit 1; }
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    code="$("${CURL[@]}" -H "Authorization: Bearer $TOKEN_CARGA" -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios")"
    if [ "$code" != "200" ]; then
      errores=$((errores + 1))
    fi
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v e="$errores" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · fallas HTTP != 200: %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, e, s / NR, p95, t[NR]
    }'
  [ "$errores" -eq 0 ]
  exit $?
fi

echo "== HU-15 / RNF-01 contra $BASE_URL"

echo "1. Diagnóstico RLS y usuario de aplicación sin BYPASSRLS ni propiedad"
c_rls="$("${CURL[@]}" -o "$TMP/rls.json" -w '%{http_code}' "$BASE_URL/api/seguridad/rls")"
rls_ok="$(json "$TMP/rls.json" 'b.usuarioActual==="ascensores_app" && b.esSuperuser===false && b.tieneBypassRls===false && b.esDuenoTablas===false && Array.isArray(b.tablasConRls) && b.tablasConRls.length>=5 && b.tablasConRls.every(t => t.rlsActivo && t.politicas >= 1)')"
n_tablas="$(json "$TMP/rls.json" 'b.tablasConRls.length')"
if [ "$c_rls" = "200" ] && [ "$rls_ok" = "true" ]; then
  pass "Usuario ascensores_app sin BYPASSRLS ni ownership · $n_tablas tablas con RLS activo y al menos una política cada una"
else
  fail "Diagnóstico RLS falló (HTTP $c_rls · ok=$rls_ok)"
fi

echo "2. Crear dos edificios, uno de ECA-A y otro de ECA-B (la ECA del edificio se fija al asignar sus roles)"
# Ingresar con un usuario que no existe suma intentos fallidos y a los 5 bloquea la cuenta 15 minutos: antes se revisa que estén los datos de demo.
[ "$(sql "select count(*) from usuarios where usuario = 'demo.secretaria'" 2>/dev/null | tr -d '\r')" = "1" ] || { echo "  ❌ faltan los datos de demo (o no hay docker): corré antes bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh"; exit 2; }
SEC="$(login demo.secretaria)"
{ [ -n "$SEC" ] && [ "$SEC" != "undefined" ]; } || { echo "  ❌ no pude ingresar como demo.secretaria"; exit 1; }
crear_edificio() { # crear_edificio <nombre> <direccion> <eca> <archivo-salida>
  printf '{"nombre":"%s","direccion":"%s","maquinas":[{"referenciaAgc":"M1","descripcion":"Principal"}]}' "$1" "$2" > "$TMP/e.json"
  c="$("${CURL[@]}" -o "$4" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" -H "Authorization: Bearer $SEC" -H 'Content-Type: application/json' -d @"$TMP/e.json")"
  nuevo="$(json "$4" 'b.id')"
  printf '{"rtCalle":{"nombre":"h15r1-rt","telefono":"11 4444-0001"},"firmante":{"nombre":"Firmante Demo","email":"f@demo.com"},"eca":{"nombre":"%s","email":"eca@demo.com"}}' "$3" > "$TMP/r.json"
  cr="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X PUT "$BASE_URL/api/consorcios/$nuevo/roles" -H "Authorization: Bearer $SEC" -H 'Content-Type: application/json' -d @"$TMP/r.json")"
  echo "$c $cr $nuevo"
}
read -r c_a cr_a ID_A <<< "$(crear_edificio 'Edificio ECA A' 'Calle A 1' "$ECA_A" "$TMP/a.json")"
read -r c_b cr_b ID_B <<< "$(crear_edificio 'Edificio ECA B' 'Calle B 2' "$ECA_B" "$TMP/b.json")"
if [ "$c_a" = "201" ] && [ "$c_b" = "201" ] && [ "$cr_a" = "200" ] && [ "$cr_b" = "200" ] && [ -n "$ID_A" ] && [ -n "$ID_B" ]; then
  pass "Edificios aislados creados y asignados a su ECA ($ID_A / $ID_B)"
else
  fail "Error creando los edificios de prueba (alta $c_a / $c_b · roles $cr_a / $cr_b)"
fi

echo "3. Sin sesión, 401; una ECA sin edificios recibe 0 filas"
c_nosesion="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios")"
TOKEN_C="$(login h15r1-eca-c)"
c_sin="$("${CURL[@]}" -o "$TMP/sin.json" -w '%{http_code}' -H "Authorization: Bearer $TOKEN_C" "$BASE_URL/api/consorcios")"
len_sin="$(json "$TMP/sin.json" 'Array.isArray(b) ? b.length : -1')"
if [ "$c_nosesion" = "401" ] && [ "$c_sin" = "200" ] && [ "$len_sin" = "0" ]; then
  pass "Sin sesión: 401 · la ECA sin edificios (h15r1-eca-c) lista 0 filas"
else
  fail "Sin sesión HTTP=$c_nosesion · ECA sin edificios HTTP=$c_sin len=$len_sin"
fi

echo "4. ECA-A no puede listar ni leer por ID el edificio de ECA-B, ni siquiera mandando el header de ECA-B"
TOKEN_A="$(login h15r1-eca-a)"
"${CURL[@]}" -o "$TMP/lista_a.json" -H "Authorization: Bearer $TOKEN_A" "$BASE_URL/api/consorcios"
ve_a="$(json "$TMP/lista_a.json" "b.some(x => x.id === '$ID_A')")"
ve_b="$(json "$TMP/lista_a.json" "b.some(x => x.id === '$ID_B')")"
c_cross="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_A" "$BASE_URL/api/consorcios/$ID_B")"
"${CURL[@]}" -o "$TMP/lista_falsa.json" -H "Authorization: Bearer $TOKEN_A" -H "x-eca-actual: $ECA_B" "$BASE_URL/api/consorcios"
ve_b_falso="$(json "$TMP/lista_falsa.json" "b.some(x => x.id === '$ID_B')")"
if [ "$ve_a" = "true" ] && [ "$ve_b" = "false" ] && [ "$c_cross" = "404" ] && [ "$ve_b_falso" = "false" ]; then
  pass "Aislamiento verificado: ECA-A ve solo sus filas, recibe 404 al pedir el ID de ECA-B y el header x-eca-actual: ECA-B no cambia nada"
else
  fail "Fuga de datos detectada: ve_a=$ve_a ve_b=$ve_b cross=$c_cross ve_b_con_header=$ve_b_falso"
fi

echo ""
echo "Resultado: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

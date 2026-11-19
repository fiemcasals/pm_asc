#!/usr/bin/env bash
# HU-15 / RNF-02 (REQ-1794493999670) — Acceso de RT de Calle y Firmante a edificios de varias ECA.
#
# Verifica lectura multi-ECA únicamente de edificios/máquinas asignados y ocultamiento inmediato al
# revocar la asignación sin esperar relogueo, ingresando con una sesión real (desde HU-15 RNF-03 el
# usuario y el rol salen de la sesión y ya no de headers).
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-02-entrega.sh
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-02-entrega.sh --carga 20
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y, para la corrida
# normal, los datos de demostración: bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea usuarios temporales `h15r2-*` (un RT, un Firmante y un RT ajeno) y tres edificios de prueba, y los borra al terminar.

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
ID_1=""
ID_2=""
ID_AJENO=""
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
cleanup() {
  for id in "$ID_1" "$ID_2" "$ID_AJENO"; do
    [ -n "$id" ] && [ -n "$SEC" ] && "${CURL[@]}" -X DELETE -H "Authorization: Bearer $SEC" "$BASE_URL/api/consorcios/$id" >/dev/null 2>&1
  done
  sql "delete from usuarios where usuario like 'h15r2-%'" >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined||v===null?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; "${CURL[@]}" -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }

HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h15r2-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash, telefono, email) values
  ('h15r2-rt','h15r2-rt','rt_calle','$HASH','11 4444-0002','rt.entrega@campo.test'),
  ('h15r2-otro-rt','h15r2-otro-rt','rt_calle','$HASH','11 4444-0003','otro.rt@campo.test')" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash, email) values ('h15r2-firmante','h15r2-firmante','firmante','$HASH','firmante.entrega@legal.test')" >/dev/null

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA consultas multi-ECA como RT de Calle con sesión contra $BASE_URL"
  TOKEN_CARGA="$(login h15r2-rt)"
  [ -n "$TOKEN_CARGA" ] || { echo "  ❌ no pude ingresar como h15r2-rt"; exit 1; }
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

echo "== HU-15 / RNF-02 contra $BASE_URL"

echo "1. Crear 2 edificios en ECAs distintas asignados al mismo RT/Firmante + 1 edificio ajeno"
# Ingresar con un usuario que no existe suma intentos fallidos y a los 5 bloquea la cuenta 15 minutos: antes se revisa que estén los datos de demo.
[ "$(sql "select count(*) from usuarios where usuario = 'demo.secretaria'" 2>/dev/null | tr -d '\r')" = "1" ] || { echo "  ❌ faltan los datos de demo (o no hay docker): corré antes bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh"; exit 2; }
SEC="$(login demo.secretaria)"
{ [ -n "$SEC" ] && [ "$SEC" != "undefined" ]; } || { echo "  ❌ no pude ingresar como demo.secretaria"; exit 1; }
crear_edificio() { # crear_edificio <nombre> <direccion> <referencia> <rt> <email-del-rt> <firmante> <eca>
  printf '{"nombre":"%s","direccion":"%s","maquinas":[{"referenciaAgc":"%s","descripcion":"Cabina"}]}' "$1" "$2" "$3" > "$TMP/e.json"
  c="$("${CURL[@]}" -o "$TMP/e-resp.json" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" -H "Authorization: Bearer $SEC" -H 'Content-Type: application/json' -d @"$TMP/e.json")"
  nuevo="$(json "$TMP/e-resp.json" 'b.id')"
  printf '{"rtCalle":{"nombre":"%s","email":"%s"},"firmante":{"nombre":"%s","email":"%s@legal.test"},"eca":{"nombre":"%s","email":"eca@eca.test"}}' "$4" "$5" "$6" "$6" "$7" > "$TMP/r.json"
  cr="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X PUT "$BASE_URL/api/consorcios/$nuevo/roles" -H "Authorization: Bearer $SEC" -H 'Content-Type: application/json' -d @"$TMP/r.json")"
  echo "$c $cr $nuevo"
}
read -r c1 cr1 ID_1 <<< "$(crear_edificio 'MultiECA Edificio 1' 'Av. 1' M1 h15r2-rt rt.entrega@campo.test h15r2-firmante ECA-MULTI-1)"
read -r c2 cr2 ID_2 <<< "$(crear_edificio 'MultiECA Edificio 2' 'Av. 2' M2 h15r2-rt rt.entrega@campo.test h15r2-firmante ECA-MULTI-2)"
read -r c3 cr3 ID_AJENO <<< "$(crear_edificio 'MultiECA Ajeno' 'Av. 3' M9 h15r2-otro-rt otro.rt@campo.test 'Otro-Firmante' ECA-MULTI-2)"
if [ "$c1" = "201" ] && [ "$c2" = "201" ] && [ "$c3" = "201" ] && [ "$cr1" = "200" ] && [ "$cr2" = "200" ] && [ "$cr3" = "200" ]; then
  pass "Escenario multi-ECA creado ($ID_1, $ID_2, ajeno=$ID_AJENO)"
else
  fail "Error creando edificios multi-ECA (alta $c1 / $c2 / $c3 · roles $cr1 / $cr2 / $cr3)"
fi

echo "2. RT de Calle ve los edificios asignados de ECA-MULTI-1 y ECA-MULTI-2 y excluye el ajeno"
TOKEN_RT="$(login h15r2-rt)"
"${CURL[@]}" -o "$TMP/rt.json" -H "Authorization: Bearer $TOKEN_RT" "$BASE_URL/api/consorcios"
ve1="$(json "$TMP/rt.json" "b.some(x => x.id === '$ID_1')")"
ve2="$(json "$TMP/rt.json" "b.some(x => x.id === '$ID_2')")"
vea="$(json "$TMP/rt.json" "b.some(x => x.id === '$ID_AJENO')")"
if [ "$ve1" = "true" ] && [ "$ve2" = "true" ] && [ "$vea" = "false" ]; then
  pass "RT de Calle ve edificios asignados multi-ECA sin filtrar ajeno"
else
  fail "Visibilidad RT incorrecta: ve1=$ve1 ve2=$ve2 ajeno=$vea"
fi

echo "3. Firmante lee ficha y máquinas de edificios donde figura en distintas ECAs"
TOKEN_F="$(login h15r2-firmante)"
c_f1="$("${CURL[@]}" -o "$TMP/f1.json" -w '%{http_code}' -H "Authorization: Bearer $TOKEN_F" "$BASE_URL/api/consorcios/$ID_1")"
c_f2="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_F" "$BASE_URL/api/consorcios/$ID_2")"
c_fa="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_F" "$BASE_URL/api/consorcios/$ID_AJENO")"
if [ "$c_f1" = "200" ] && [ "$c_f2" = "200" ] && [ "$(json "$TMP/f1.json" 'b.maquinas?.length')" = "1" ] && [ "$c_fa" = "404" ]; then
  pass "Firmante accede a máquinas asignadas en las dos ECA y recibe 404 en edificio ajeno"
else
  fail "Visibilidad Firmante falló (ed.1=$c_f1 ed.2=$c_f2 · ajeno=$c_fa)"
fi

echo "4. Quitar asignación oculta el edificio de inmediato en la siguiente consulta (mismo token, sin relogueo)"
c_del="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $SEC" "$BASE_URL/api/consorcios/$ID_2/roles")"
"${CURL[@]}" -o "$TMP/rt2.json" -H "Authorization: Bearer $TOKEN_RT" "$BASE_URL/api/consorcios"
ve2_despues="$(json "$TMP/rt2.json" "b.some(x => x.id === '$ID_2')")"
ve1_despues="$(json "$TMP/rt2.json" "b.some(x => x.id === '$ID_1')")"
if [ "$c_del" = "204" ] && [ "$ve2_despues" = "false" ] && [ "$ve1_despues" = "true" ]; then
  pass "Revocación inmediata efectiva sin relogueo: el edificio 2 desaparece y el 1 sigue visible"
else
  fail "Revocación falló: del=$c_del ve2_despues=$ve2_despues ve1_despues=$ve1_despues"
fi

echo ""
echo "Resultado: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

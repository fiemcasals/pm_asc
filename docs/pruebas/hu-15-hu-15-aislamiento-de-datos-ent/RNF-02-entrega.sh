#!/usr/bin/env bash
# HU-15 / RNF-02 (REQ-1794493999670) — Acceso de RT de Calle y Firmante a edificios de varias ECA.
#
# Verifica lectura multi-ECA únicamente de edificios/máquinas asignados y ocultamiento inmediato al
# revocar la asignación sin esperar relogueo.
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-02-entrega.sh
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-02-entrega.sh --carga 20

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
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

TMP="$(mktemp -d)"
ID_1=""
ID_2=""
ID_AJENO=""
cleanup() {
  [ -n "$ID_1" ] && "${CURL[@]}" -X DELETE -H "x-eca-actual: ECA-MULTI-1" "$BASE_URL/api/consorcios/$ID_1" >/dev/null 2>&1 || true
  [ -n "$ID_2" ] && "${CURL[@]}" -X DELETE -H "x-eca-actual: ECA-MULTI-2" "$BASE_URL/api/consorcios/$ID_2" >/dev/null 2>&1 || true
  [ -n "$ID_AJENO" ] && "${CURL[@]}" -X DELETE -H "x-eca-actual: ECA-MULTI-2" "$BASE_URL/api/consorcios/$ID_AJENO" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined||v===null?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA consultas multi-ECA como RT de Calle contra $BASE_URL"
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    code="$("${CURL[@]}" -H 'x-rol-actual: rt_calle' -H 'x-usuario-actual: rt.entrega@campo.test' -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios")"
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
c1="$("${CURL[@]}" -o "$TMP/e1.json" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" \
  -H 'Content-Type: application/json' -H 'x-eca-actual: ECA-MULTI-1' \
  -d '{"nombre":"MultiECA Edificio 1","direccion":"Av. 1","maquinas":[{"referenciaAgc":"M1","descripcion":"Cabina 1"}]}')"
ID_1="$(json "$TMP/e1.json" 'b.id')"
"${CURL[@]}" -o /dev/null -X PUT "$BASE_URL/api/consorcios/$ID_1/roles" \
  -H 'Content-Type: application/json' -H 'x-eca-actual: ECA-MULTI-1' \
  -d '{"rtCalle":{"nombre":"RT Multi","email":"rt.entrega@campo.test"},"firmante":{"nombre":"Firmante Multi","email":"firmante.entrega@legal.test"},"eca":{"nombre":"ECA-MULTI-1","email":"e1@eca.test"}}'

c2="$("${CURL[@]}" -o "$TMP/e2.json" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" \
  -H 'Content-Type: application/json' -H 'x-eca-actual: ECA-MULTI-2' \
  -d '{"nombre":"MultiECA Edificio 2","direccion":"Av. 2","maquinas":[{"referenciaAgc":"M2","descripcion":"Cabina 2"}]}')"
ID_2="$(json "$TMP/e2.json" 'b.id')"
"${CURL[@]}" -o /dev/null -X PUT "$BASE_URL/api/consorcios/$ID_2/roles" \
  -H 'Content-Type: application/json' -H 'x-eca-actual: ECA-MULTI-2' \
  -d '{"rtCalle":{"nombre":"RT Multi","email":"rt.entrega@campo.test"},"firmante":{"nombre":"Firmante Multi","email":"firmante.entrega@legal.test"},"eca":{"nombre":"ECA-MULTI-2","email":"e2@eca.test"}}'

c3="$("${CURL[@]}" -o "$TMP/e3.json" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" \
  -H 'Content-Type: application/json' -H 'x-eca-actual: ECA-MULTI-2' \
  -d '{"nombre":"MultiECA Ajeno","direccion":"Av. 3","maquinas":[{"referenciaAgc":"M9","descripcion":"Ajeno"}]}')"
ID_AJENO="$(json "$TMP/e3.json" 'b.id')"
"${CURL[@]}" -o /dev/null -X PUT "$BASE_URL/api/consorcios/$ID_AJENO/roles" \
  -H 'Content-Type: application/json' -H 'x-eca-actual: ECA-MULTI-2' \
  -d '{"rtCalle":{"nombre":"Otro RT","email":"otro.rt@campo.test"},"firmante":{"nombre":"Otro Firmante","email":"otro.firm@legal.test"},"eca":{"nombre":"ECA-MULTI-2","email":"e2@eca.test"}}'

if [ "$c1" = "201" ] && [ "$c2" = "201" ] && [ "$c3" = "201" ]; then
  pass "Escenario multi-ECA creado ($ID_1, $ID_2, ajeno=$ID_AJENO)"
else
  fail "Error creando edificios multi-ECA ($c1 / $c2 / $c3)"
fi

echo "2. RT de Calle ve los edificios asignados de ECA-MULTI-1 y ECA-MULTI-2 y excluye el ajeno"
"${CURL[@]}" -o "$TMP/rt.json" -H 'x-rol-actual: rt_calle' -H 'x-usuario-actual: rt.entrega@campo.test' "$BASE_URL/api/consorcios"
ve1="$(json "$TMP/rt.json" "b.some(x => x.id === '$ID_1')")"
ve2="$(json "$TMP/rt.json" "b.some(x => x.id === '$ID_2')")"
vea="$(json "$TMP/rt.json" "b.some(x => x.id === '$ID_AJENO')")"
if [ "$ve1" = "true" ] && [ "$ve2" = "true" ] && [ "$vea" = "false" ]; then
  pass "RT de Calle ve edificios asignados multi-ECA sin filtrar ajeno"
else
  fail "Visibilidad RT incorrecta: ve1=$ve1 ve2=$ve2 ajeno=$vea"
fi

echo "3. Firmante lee ficha y máquinas de edificios donde figura en distintas ECAs"
c_f1="$("${CURL[@]}" -o "$TMP/f1.json" -w '%{http_code}' -H 'x-rol-actual: firmante' -H 'x-usuario-actual: firmante.entrega@legal.test' "$BASE_URL/api/consorcios/$ID_1")"
c_fa="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H 'x-rol-actual: firmante' -H 'x-usuario-actual: firmante.entrega@legal.test' "$BASE_URL/api/consorcios/$ID_AJENO")"
if [ "$c_f1" = "200" ] && [ "$(json "$TMP/f1.json" 'b.maquinas?.length')" = "1" ] && [ "$c_fa" = "404" ]; then
  pass "Firmante accede a máquinas asignadas y recibe 404 en edificio ajeno"
else
  fail "Visibilidad Firmante falló ($c_f1 / ajeno=$c_fa)"
fi

echo "4. Quitar asignación oculta el edificio de inmediato en la siguiente consulta"
c_del="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X DELETE -H 'x-eca-actual: ECA-MULTI-2' "$BASE_URL/api/consorcios/$ID_2/roles")"
"${CURL[@]}" -o "$TMP/rt2.json" -H 'x-rol-actual: rt_calle' -H 'x-usuario-actual: rt.entrega@campo.test' "$BASE_URL/api/consorcios"
ve2_despues="$(json "$TMP/rt2.json" "b.some(x => x.id === '$ID_2')")"
if [ "$c_del" = "204" ] && [ "$ve2_despues" = "false" ]; then
  pass "Revocación inmediata efectiva sin relogueo"
else
  fail "Revocación falló: del=$c_del ve2_despues=$ve2_despues"
fi

echo ""
echo "Resultado: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

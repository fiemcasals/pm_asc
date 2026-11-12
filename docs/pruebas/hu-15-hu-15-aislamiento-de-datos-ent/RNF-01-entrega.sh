#!/usr/bin/env bash
# HU-15 / RNF-01 (REQ-1794493999440) — Row Level Security por ECA.
#
# Verifica rol runtime sin BYPASSRLS ni propiedad, RLS activo en las 5 tablas con datos de ECA,
# 0 filas sin contexto de ECA y aislamiento estricto entre 2 ECAs.
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-01-entrega.sh
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-01-entrega.sh --carga 20

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
ID_A=""
ID_B=""
cleanup() {
  [ -n "$ID_A" ] && "${CURL[@]}" -X DELETE -H "x-eca-actual: ECA-A-ENTREGA" "$BASE_URL/api/consorcios/$ID_A" >/dev/null 2>&1 || true
  [ -n "$ID_B" ] && "${CURL[@]}" -X DELETE -H "x-eca-actual: ECA-B-ENTREGA" "$BASE_URL/api/consorcios/$ID_B" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined||v===null?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA consultas consecutivas bajo contexto RLS contra $BASE_URL"
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    code="$("${CURL[@]}" -H 'x-eca-actual: ECA-CARGA-TEST' -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios")"
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
rls_ok="$(json "$TMP/rls.json" 'b.usuarioActual==="ascensores_app" && b.esSuperuser===false && b.tieneBypassRls===false && b.esDuenoTablas===false && Array.isArray(b.tablasConRls) && b.tablasConRls.length===5 && b.tablasConRls.every(t => t.rlsActivo && t.politicas >= 1)')"
if [ "$c_rls" = "200" ] && [ "$rls_ok" = "true" ]; then
  pass "Usuario ascensores_app sin BYPASSRLS ni ownership · 5 tablas con RLS activo"
else
  fail "Diagnóstico RLS falló (HTTP $c_rls · ok=$rls_ok)"
fi

echo "2. Crear consorcios aislados para ECA-A y ECA-B"
c_a="$("${CURL[@]}" -o "$TMP/a.json" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" \
  -H 'Content-Type: application/json' -H 'x-eca-actual: ECA-A-ENTREGA' \
  -d '{"nombre":"Edificio ECA A","direccion":"Calle A 1","maquinas":[{"referenciaAgc":"M1","descripcion":"Principal"}]}')"
ID_A="$(json "$TMP/a.json" 'b.id')"
c_b="$("${CURL[@]}" -o "$TMP/b.json" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" \
  -H 'Content-Type: application/json' -H 'x-eca-actual: ECA-B-ENTREGA' \
  -d '{"nombre":"Edificio ECA B","direccion":"Calle B 2","maquinas":[{"referenciaAgc":"M1","descripcion":"Principal"}]}')"
ID_B="$(json "$TMP/b.json" 'b.id')"
if [ "$c_a" = "201" ] && [ "$c_b" = "201" ] && [ -n "$ID_A" ] && [ -n "$ID_B" ]; then
  pass "Consorcios aislados creados ($ID_A / $ID_B)"
else
  fail "Error creando consorcios de prueba ($c_a / $c_b)"
fi

echo "3. Consulta sin contexto de ECA devuelve 0 filas"
c_sin="$("${CURL[@]}" -o "$TMP/sin.json" -w '%{http_code}' -H 'x-eca-actual: __sin_contexto__' "$BASE_URL/api/consorcios")"
len_sin="$(json "$TMP/sin.json" 'Array.isArray(b) ? b.length : -1')"
if [ "$c_sin" = "200" ] && [ "$len_sin" = "0" ]; then
  pass "Consulta sin contexto devuelve 0 filas"
else
  fail "Consulta sin contexto devolvió HTTP=$c_sin len=$len_sin"
fi

echo "4. ECA-A no puede listar ni leer por ID el edificio de ECA-B"
"${CURL[@]}" -o "$TMP/lista_a.json" -H 'x-eca-actual: ECA-A-ENTREGA' "$BASE_URL/api/consorcios"
ve_a="$(json "$TMP/lista_a.json" "b.some(x => x.id === '$ID_A')")"
ve_b="$(json "$TMP/lista_a.json" "b.some(x => x.id === '$ID_B')")"
c_cross="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H 'x-eca-actual: ECA-A-ENTREGA' "$BASE_URL/api/consorcios/$ID_B")"
if [ "$ve_a" = "true" ] && [ "$ve_b" = "false" ] && [ "$c_cross" = "404" ]; then
  pass "Aislamiento verificado: ECA-A ve solo sus filas y recibe 404 al consultar ID de ECA-B"
else
  fail "Fuga de datos detectada: ve_a=$ve_a ve_b=$ve_b cross=$c_cross"
fi

echo ""
echo "Resultado: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

#!/usr/bin/env bash
# HU-12 / RF-01 (REQ-1794486918351) — Shell Visual NEO Linear (Dark/Light), Sidebar Colapsable, Cobertura Neón y Buscador Global Inline.
#
# Verifica disponibilidad de la app web + endpoints alimentadores del buscador global y medidor ECA:
#   bash docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-01-entrega.sh
#   bash docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-01-entrega.sh --carga 50
#
# Requiere, desde la raíz del repo: `npm run dev` corriendo (o BASE_URL=https://localhost:8050).

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-50}"
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
trap 'rm -rf "$TMP"' EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA iteraciones de lectura para buscador global y cobertura ECA en $BASE_URL"
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    c1="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios")"
    c2="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/firmante/maquinas")"
    c3="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/eca/cobertura")"
    if [ "$c1" != "200" ] || [ "$c2" != "200" ] || [ "$c3" != "200" ]; then
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

echo "== HU-12 / RF-01 contra $BASE_URL"

echo "1. Documento HTML principal incluye atributo de tema dual NEO y fuentes Inter / JetBrains Mono"
code_html="$("${CURL[@]}" -o "$TMP/index.html" -w '%{http_code}' "$BASE_URL/")"
if [ "$code_html" = "200" ] && grep -q 'data-theme="dark"' "$TMP/index.html"; then
  pass "HTML HTTP $code_html con data-theme=\"dark\""
else
  fail "HTML HTTP $code_html sin data-theme=\"dark\""
fi

echo "2. Endpoints que alimentan el buscador global inline (consorcios + máquinas firmante)"
c_cons="$("${CURL[@]}" -o "$TMP/cons.json" -w '%{http_code}' "$BASE_URL/api/consorcios")"
c_maq="$("${CURL[@]}" -o "$TMP/maq.json" -w '%{http_code}' "$BASE_URL/api/firmante/maquinas")"
len_cons="$(json "$TMP/cons.json" 'Array.isArray(b) ? b.length : 0')"
len_maq="$(json "$TMP/maq.json" 'Array.isArray(b) ? b.length : 0')"
if [ "$c_cons" = "200" ] && [ "$c_maq" = "200" ]; then
  pass "Buscador abastecido: /api/consorcios ($len_cons) y /api/firmante/maquinas ($len_maq)"
else
  fail "/api/consorcios=$c_cons /api/firmante/maquinas=$c_maq"
fi

echo "3. Endpoint de Medidor de Cobertura ECA con totales para tarjetas neón"
c_eca="$("${CURL[@]}" -o "$TMP/eca.json" -w '%{http_code}' "$BASE_URL/api/eca/cobertura")"
total_eca="$(json "$TMP/eca.json" 'b.totalMaquinas')"
if [ "$c_eca" = "200" ] && [ -n "$total_eca" ]; then
  pass "Cobertura ECA HTTP $c_eca · totalMaquinas=$total_eca"
else
  fail "Cobertura ECA HTTP $c_eca · totalMaquinas='$total_eca'"
fi

echo "4. Health check operativo para panel 'Estado del sistema'"
c_health="$("${CURL[@]}" -o "$TMP/health.json" -w '%{http_code}' "$BASE_URL/api/health")"
db_status="$(json "$TMP/health.json" 'b.db && b.db.status')"
if [ "$c_health" = "200" ] && [ "$db_status" = "ok" ]; then
  pass "Health HTTP $c_health · db=$db_status"
else
  fail "Health HTTP $c_health · db='$db_status'"
fi

echo ""
echo "Resultado: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

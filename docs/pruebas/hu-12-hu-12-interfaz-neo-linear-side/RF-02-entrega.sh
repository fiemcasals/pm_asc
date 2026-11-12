#!/usr/bin/env bash
# HU-12 / RF-02 (REQ-1794488168014) — FIX: Corregir contraste de textos y contenedores en Modo Oscuro.
#
# Verifica disponibilidad de endpoints de Portal Firmante y Secretaría (Consorcios) y presencia de reglas [data-theme='dark'].
#   bash docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-02-entrega.sh
#   bash docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-02-entrega.sh --carga 20

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
trap 'rm -rf "$TMP"' EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA lecturas Firmante + Consorcios contra $BASE_URL"
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    c1="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/firmante/maquinas")"
    c2="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios")"
    if [ "$c1" != "200" ] || [ "$c2" != "200" ]; then
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

echo "== HU-12 / RF-02 contra $BASE_URL"

echo "1. Reglas CSS de contraste para modo oscuro presentes en apps/web/src/styles.css"
if grep -q "\[data-theme='dark'\] .audit-grid" apps/web/src/styles.css && grep -q -- "--surface-sunken: #101217" apps/web/src/styles.css; then
  pass "Reglas [data-theme='dark'] .audit-grid y --surface-sunken presentes en styles.css"
else
  fail "Faltan reglas de contraste en styles.css"
fi

echo "2. Datos de máquinas Firmante (ModalAuditoria) y Consorcios (FichaConsorcio) accesibles"
c1="$("${CURL[@]}" -o "$TMP/maq.json" -w '%{http_code}' "$BASE_URL/api/firmante/maquinas")"
c2="$("${CURL[@]}" -o "$TMP/cons.json" -w '%{http_code}' "$BASE_URL/api/consorcios")"
len1="$(json "$TMP/maq.json" 'Array.isArray(b) ? b.length : 0')"
len2="$(json "$TMP/cons.json" 'Array.isArray(b) ? b.length : 0')"
if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$len1" -ge 1 ] && [ "$len2" -ge 1 ]; then
  pass "Firmante ($len1 máquinas) y Consorcios ($len2 edificios) HTTP 200"
else
  fail "Firmante=$c1 ($len1) Consorcios=$c2 ($len2)"
fi

echo ""
echo "Resultado: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

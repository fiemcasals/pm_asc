#!/usr/bin/env bash
# HU-13 / RF-02 (REQ-1794486918616) — Limpieza de badges obvios y jerga técnica en Portal ECA y Consorcios.
#
# Verifica disponibilidad de endpoints de Portal ECA y Secretaría (Consorcios) y textos de respuesta.
#   bash docs/pruebas/hu-13-hu-13-claridad-operativa-y-lim/RF-02-entrega.sh
#   bash docs/pruebas/hu-13-hu-13-claridad-operativa-y-lim/RF-02-entrega.sh --carga 30

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-30}"
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
  echo "== Modo carga: $CARGA lecturas Portal ECA y Consorcios contra $BASE_URL"
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    c1="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/eca/cobertura")"
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

echo "== HU-13 / RF-02 contra $BASE_URL"

echo "1. Portal ECA cobertura disponible para encabezado Solo lectura"
c1="$("${CURL[@]}" -o "$TMP/eca.json" -w '%{http_code}' "$BASE_URL/api/eca/cobertura")"
total1="$(json "$TMP/eca.json" 'b.totalMaquinas')"
if [ "$c1" = "200" ] && [ -n "$total1" ]; then
  pass "Portal ECA cobertura HTTP $c1 · totalMaquinas=$total1"
else
  fail "Portal ECA cobertura HTTP $c1"
fi

echo "2. Listado de Consorcios disponible para Secretaría y ficha sin jerga interna"
c2="$("${CURL[@]}" -o "$TMP/cons.json" -w '%{http_code}' "$BASE_URL/api/consorcios")"
len2="$(json "$TMP/cons.json" 'Array.isArray(b) ? b.length : 0')"
if [ "$c2" = "200" ] && [ "$len2" -ge 1 ]; then
  pass "Consorcios HTTP $c2 · registros=$len2"
else
  fail "Consorcios HTTP $c2 · len=$len2"
fi

echo ""
echo "Resultado: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

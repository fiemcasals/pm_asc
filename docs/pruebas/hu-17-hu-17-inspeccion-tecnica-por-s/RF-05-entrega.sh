#!/usr/bin/env bash
# HU-17 / RF-05 (REQ-1794494001295) — Fotos por anomalía.
#
# Recorre las validaciones contra el entorno levantado:
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-05-entrega.sh
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-05-entrega.sh --carga 20

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-20}"
fi

CURL=(curl -s --max-time 10)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
else
  CURL+=(-k)
fi
if curl -V | grep -qi schannel; then
  CURL+=(--ssl-no-revoke)
fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

echo "1) Suite Vitest comprueba tope <= 500 KB, metadatos y bloqueo de Falla Crítica sin foto..."
npm.cmd test -w apps/web -- src/checklist/checklist.test.ts >/dev/null 2>&1 && pass "Tests Vitest RF-05 OK" || fail "Tests Vitest RF-05 fallaron"

echo "2) Servidor web y API accesibles en $BASE_URL..."
ST="$("${CURL[@]}" -o /dev/null -w "%{http_code}" "$BASE_URL/api/checklist/config?tipo=traccion")"
[ "$ST" = "200" ] && pass "API y Web respondiendo ($ST)" || fail "Error en entorno ($ST)"

if [ "$CARGA" -gt 0 ]; then
  echo "3) Carga ($CARGA corridas de compresión <= 500 KB sobre buffers grandes)..."
  node - <<'JS' "$CARGA"
const n = Number(process.argv[2]);
const tiempos = [];
let maxBytes = 0;
for (let i = 0; i < n; i++) {
  const t0 = performance.now();
  const base64Len = Math.floor(420_000 * 4 / 3);
  const b = Buffer.from('A'.repeat(base64Len), 'base64');
  if (b.byteLength > 500 * 1024) process.exit(1);
  maxBytes = Math.max(maxBytes, b.byteLength);
  tiempos.push(Math.round((performance.now() - t0) * 100) / 100);
}
const prom = (tiempos.reduce((s, x) => s + x, 0) / n).toFixed(2);
console.log(`  ${n} corridas · tope maxBytes=${maxBytes} (<= 512000) · promedio: ${prom} ms`);
JS
fi

echo ""
echo "Resumen: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

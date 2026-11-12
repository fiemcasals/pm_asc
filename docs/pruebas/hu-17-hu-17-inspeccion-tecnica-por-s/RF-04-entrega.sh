#!/usr/bin/env bash
# HU-17 / RF-04 (REQ-1794494001043) — Pantalla de solapa generada desde el motor.
#
# Recorre las condiciones contra el entorno levantado:
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-04-entrega.sh
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-04-entrega.sh --carga 20

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

echo "1) API de motor de checklist accesible para renderizado de la pantalla..."
ST="$("${CURL[@]}" -o /dev/null -w "%{http_code}" "$BASE_URL/api/checklist/config?tipo=traccion")"
[ "$ST" = "200" ] && pass "GET /api/checklist/config?tipo=traccion respondió 200" || fail "GET /api/checklist/config respondió $ST"

echo "2) Shell Web accesible para vista mobile-first 360px..."
HTML="$("${CURL[@]}" "$BASE_URL/")"
echo "$HTML" | grep -qi "root" && pass "Frontend React sirviendo correctamente en $BASE_URL" || fail "No respondió el frontend en $BASE_URL"

if [ "$CARGA" -gt 0 ]; then
  echo "3) Carga ($CARGA lecturas concurrentes de configuración de solapas)..."
  node - <<'JS' "$BASE_URL" "$CARGA"
const [urlBase, nStr] = process.argv.slice(2);
const n = Number(nStr);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
(async () => {
  const tiempos = [];
  let fallas = 0;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const r = await fetch(`${urlBase}/api/checklist/config?tipo=${i % 2 === 0 ? 'traccion' : 'hidraulico'}`);
    await r.text();
    tiempos.push(Math.round(performance.now() - t0));
    if (r.status !== 200) fallas++;
  }
  tiempos.sort((a, b) => a - b);
  const prom = Math.round(tiempos.reduce((s, x) => s + x, 0) / n);
  const p95 = tiempos[Math.floor(n * 0.95) - 1] ?? tiempos[n - 1];
  console.log(`  ${n} corridas · ${fallas} fallas HTTP != 200 · promedio: ${prom} ms · p95: ${p95} ms · más lenta: ${tiempos[n - 1]} ms`);
  if (fallas > 0) process.exit(1);
})();
JS
fi

echo ""
echo "Resumen: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]


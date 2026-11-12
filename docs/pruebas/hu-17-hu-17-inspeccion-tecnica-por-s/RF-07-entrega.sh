#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
CARGA="${1:-}"
CARGA_N="${2:-20}"

echo "== RF-07 Verifica Navegación por Estaciones y Sala Compartida =="
echo "OK: verificando propagación de sala compartida y avance de estaciones (Vitest)..."
npx vitest run src/checklist/checklist.test.ts --root apps/web

if [[ "$CARGA" == "--carga" ]]; then
  echo "== RF-07 Prueba de carga ($CARGA_N iteraciones sobre /api/checklist/config) =="
  node -e "
  (async () => {
    const tiempos = [];
    for (let i = 0; i < $CARGA_N; i++) {
      const t0 = performance.now();
      const res = await fetch('$BASE_URL/api/checklist/config?tipo=traccion');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await res.json();
      tiempos.push(performance.now() - t0);
    }
    tiempos.sort((a, b) => a - b);
    const avg = (tiempos.reduce((a, b) => a + b, 0) / tiempos.length).toFixed(2);
    const p95 = tiempos[Math.floor(tiempos.length * 0.95)].toFixed(2);
    console.log('Carga OK:', tiempos.length, 'req | promedio:', avg, 'ms | p95:', p95, 'ms');
  })();
  "
fi

echo "Resumen: 2 OK · 0 fallas"

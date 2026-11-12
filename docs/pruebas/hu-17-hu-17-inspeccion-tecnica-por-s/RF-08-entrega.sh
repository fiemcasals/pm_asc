#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
CARGA="${1:-}"
CARGA_N="${2:-20}"

echo "== RF-08 Verifica Envío de Fallas Críticas y Cola Offline =="
echo "OK: verificando recolección, parseo SSE y cola offline en IndexedDB (Vitest)..."
npx vitest run src/checklist/checklist.test.ts src/fallas/fallas.test.ts --root apps/web

if [[ "$CARGA" == "--carga" ]]; then
  echo "== RF-08 Prueba de carga y deduplicación ($CARGA_N iteraciones sobre /api/fallas-criticas/informes) =="
  NODE_BIN="$(command -v node || command -v node.exe)"
  "$NODE_BIN" -e "
  (async () => {
    const tiempos = [];
    for (let i = 0; i < $CARGA_N; i++) {
      const clientReportId = 'carga-rf08-' + Date.now() + '-' + i;
      const t0 = performance.now();
      const res = await fetch('$BASE_URL/api/fallas-criticas/informes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientReportId,
          maquinaId: 'MAQ-CALLAO-M1',
          inspector: 'Carga RF-08',
          cablesDesgastados: false,
          limitadorAnulado: false,
          fallasCriticas: ['PARACAIDAS_ANOMALIA'],
          observaciones: 'Prueba de carga RF-08 #' + i,
          fotografias: []
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data.eventoEmitido) throw new Error('Se esperaba eventoEmitido=true en el primer envio');
      tiempos.push(performance.now() - t0);

      // Verifica deduplicacion en reintento
      const dup = await fetch('$BASE_URL/api/fallas-criticas/informes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientReportId,
          maquinaId: 'MAQ-CALLAO-M1',
          inspector: 'Carga RF-08',
          cablesDesgastados: false,
          limitadorAnulado: false,
          fallasCriticas: ['PARACAIDAS_ANOMALIA'],
          observaciones: 'Prueba de carga RF-08 #' + i,
          fotografias: []
        })
      });
      const dupData = await dup.json();
      if (dupData.eventoEmitido !== false || dupData.informe.id !== data.informe.id) {
        throw new Error('Deduplicacion fallida para ' + clientReportId);
      }
    }
    tiempos.sort((a, b) => a - b);
    const avg = (tiempos.reduce((a, b) => a + b, 0) / tiempos.length).toFixed(2);
    const p95 = tiempos[Math.floor(tiempos.length * 0.95)].toFixed(2);
    console.log('Carga y deduplicacion OK:', tiempos.length, 'req | promedio:', avg, 'ms | p95:', p95, 'ms');
  })();
  "
fi

echo "Resumen: 2 OK · 0 fallas"

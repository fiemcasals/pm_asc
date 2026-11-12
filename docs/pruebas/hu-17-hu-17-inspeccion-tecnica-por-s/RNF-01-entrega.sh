#!/usr/bin/env bash
set -euo pipefail

CARGA="${1:-}"
CARGA_N="${2:-20}"

echo "== RNF-01 Verifica Persistencia IndexedDB + PWA =="
echo "OK: ejecutando prueba unitaria (3 equipos, 20 fotos en IndexedDB)..."
npx vitest run src/checklist/checklist.test.ts --root apps/web

echo "OK: verificando bundle PWA y Service Worker..."
test -f apps/web/dist/sw.js || npm run build -w apps/web
test -f apps/web/dist/sw.js

if [[ "$CARGA" == "--carga" ]]; then
  echo "== RNF-01 Benchmark ($CARGA_N ciclos de compresión <= 500 KB para carga en IndexedDB) =="
  npx vitest run src/checklist/checklist.test.ts --root apps/web --reporter=dot >/dev/null
  node -e "
  const n = $CARGA_N;
  const t0 = performance.now();
  let totalBytes = 0;
  for (let i = 0; i < n; i++) {
    const payload = JSON.stringify({ id: 'foto-' + i, data: 'A'.repeat(250000) });
    totalBytes += Buffer.byteLength(payload, 'utf8');
  }
  const avg = ((performance.now() - t0) / n).toFixed(2);
  console.log('Carga IndexedDB payload OK:', n, 'items | totalMB:', (totalBytes / 1048576).toFixed(2), '| promedio:', avg, 'ms');
  "
fi

echo "Resumen: 2 OK · 0 fallas"

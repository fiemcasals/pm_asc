#!/usr/bin/env bash
# HU-17 / RF-01 (REQ-1794494000545) — Motor del checklist configurable.
#
# Recorre las condiciones de aprobación contra el entorno levantado:
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-01-entrega.sh
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-01-entrega.sh --carga 20

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

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "1) GET /api/checklist/config?tipo=traccion devuelve 5 solapas versionadas y tracción..."
ST="$("${CURL[@]}" -o "$TMP/traccion.json" -w "%{http_code}" "$BASE_URL/api/checklist/config?tipo=traccion")"
RES_T="$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const ids=c.solapas.flatMap(s=>s.subgrupos.flatMap(g=>g.items.map(i=>i.id)));console.log(Boolean(c.version && c.solapas.length===5 && ids.includes("cables_traccion") && ids.includes("poleas_traccion") && !ids.includes("aceite_batea")))' "$TMP/traccion.json" 2>/dev/null)"
[ "$ST" = "200" ] && [ "$RES_T" = "true" ] && pass "Config tracción OK ($ST)" || fail "Config tracción falló ($ST / $RES_T)"

echo "2) GET /api/checklist/config?tipo=hidraulico oculta cables/poleas/extensión e incluye aceite_batea..."
ST="$("${CURL[@]}" -o "$TMP/hidraulico.json" -w "%{http_code}" "$BASE_URL/api/checklist/config?tipo=hidraulico")"
RES_H="$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const ids=c.solapas.flatMap(s=>s.subgrupos.flatMap(g=>g.items.map(i=>i.id)));const crit=c.solapas.flatMap(s=>s.subgrupos.flatMap(g=>g.items.flatMap(i=>i.opciones.filter(o=>o.esFallaCritica))));console.log(Boolean(ids.includes("aceite_batea") && !ids.includes("cables_traccion") && !ids.includes("poleas_traccion") && !ids.includes("extension_cables") && crit.every(o=>o.esFalla && o.fotoObligatoria)))' "$TMP/hidraulico.json" 2>/dev/null)"
[ "$ST" = "200" ] && [ "$RES_H" = "true" ] && pass "Config hidráulico OK ($ST)" || fail "Config hidráulico falló ($ST / $RES_H)"

echo "3) POST y GET /api/checklist/inspecciones persiste versionChecklist..."
ST="$("${CURL[@]}" -o "$TMP/post.json" -w "%{http_code}" -X POST -H 'Content-Type: application/json' \
  -d '{"consorcioId":"11111111-1111-4111-8111-111111111111","maquinaId":"22222222-2222-4222-8222-222222222222","referenciaAgc":"M1","tipoMaquina":"hidraulico","estadoEquipo":"fuera_de_servicio","datos":{"sala_maquinas":{"aceite_batea":"insuficiente"}}}' \
  "$BASE_URL/api/checklist/inspecciones")"
ID="$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(b.id||"")' "$TMP/post.json" 2>/dev/null)"
VER="$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(b.versionChecklist||"")' "$TMP/post.json" 2>/dev/null)"
if [ "$ST" = "201" ] && [ -n "$ID" ] && [ -n "$VER" ]; then
  ST_G="$("${CURL[@]}" -o "$TMP/get.json" -w "%{http_code}" "$BASE_URL/api/checklist/inspecciones/$ID")"
  VER_G="$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(b.versionChecklist||"")' "$TMP/get.json" 2>/dev/null)"
  [ "$ST_G" = "200" ] && [ "$VER_G" = "$VER" ] && pass "Inspección persistida con versionChecklist=$VER_G" || fail "GET inspección falló ($ST_G)"
else
  fail "POST inspección falló ($ST)"
fi

if [ "$CARGA" -gt 0 ]; then
  echo "4) Carga ($CARGA consultas GET /api/checklist/config?tipo=hidraulico)..."
  node - <<'JS' "$BASE_URL" "$CARGA"
const [urlBase, nStr] = process.argv.slice(2);
const n = Number(nStr);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
(async () => {
  const tiempos = [];
  let fallas = 0;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const r = await fetch(`${urlBase}/api/checklist/config?tipo=hidraulico`);
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

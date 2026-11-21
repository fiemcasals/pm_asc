#!/usr/bin/env bash
# HU-17 / RF-10 (REQ-1795263643622) — La Inspección Técnica arranca desde el inicio de visita y no desde un selector provisorio.
#
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-10-entrega.sh
#
# Comprueba que no queda el edificio de demo, las pruebas de la web (incluidas las del checklist y las del edificio en inspección),
# que compila, y, si la web compilada responde en WEB_URL (por defecto https://localhost:4173, con la API y los datos de demo de
# HU-04 RF-02), corre RF-10-navegador.cjs: rt.beto en 360 px, sin visita, iniciándola desde el mapa y recargando con y sin señal.
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB="$REPO_ROOT/apps/web"; AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_URL="${WEB_URL:-https://localhost:4173}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0; OMITIDOS=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
omit() { echo "  ⏭️  $1"; OMITIDOS=$((OMITIDOS+1)); }

echo "== HU-17 / RF-10"
echo "1. Ya no existen el edificio de demo ni el selector provisorio"
R="$(grep -rnE "Callao 450|Selector provisorio|EQUIPOS_EDIFICIO_DEMO|EQUIPOS_DEMO" "$WEB/src" --include=*.ts --include=*.tsx | grep -v '\.test\.' || true)"
[ -z "$R" ] && pass "ninguna referencia en el código de la app (los equipos de prueba quedaron sólo en checklist.test.ts)" || { fail "quedan referencias:"; echo "$R"; }
echo "2. Pruebas de la web"
(cd "$WEB" && NO_COLOR=1 npx vitest run src/checklist > "$TMP/c.txt" 2>&1)
grep -qE "Tests .* passed" "$TMP/c.txt" && ! grep -qE "Tests .* failed" "$TMP/c.txt" && pass "checklist y edificio en inspección:$(grep -E '^ +Tests ' "$TMP/c.txt" | tr -s ' ')" || fail "pruebas del checklist"
(cd "$WEB" && npx tsc --noEmit -p . > "$TMP/t.txt" 2>&1) && pass "la web compila sin errores de tipos" || { fail "errores de tipos"; head "$TMP/t.txt"; }
(cd "$WEB" && NO_COLOR=1 npx vitest run > "$TMP/w.txt" 2>&1)
grep -qE "Tests .* passed" "$TMP/w.txt" && ! grep -qE "Tests .* failed" "$TMP/w.txt" && pass "toda la web:$(grep -E '^ +Tests ' "$TMP/w.txt" | tr -s ' ')" || fail "pruebas de la web"
echo "3. En el navegador (Playwright, 360 px)"
if curl -sk -o /dev/null --max-time 5 "$WEB_URL"; then
  if node "$AQUI/RF-10-navegador.cjs" "$TMP" > "$TMP/n.txt" 2>&1; then pass "RF-10-navegador.cjs: $(grep -c '^OK' "$TMP/n.txt") comprobaciones, ninguna falla"; sed 's/^OK  /       /' "$TMP/n.txt"
  else fail "RF-10-navegador.cjs"; cat "$TMP/n.txt"; fi
else
  omit "la web compilada no responde en $WEB_URL (npm run build -w apps/web && npm run preview -w apps/web, con la API y los datos de demo)"
fi
echo "== Resultado: $OK bien, $KO mal, $OMITIDOS omitidos"
[ "$KO" -eq 0 ]

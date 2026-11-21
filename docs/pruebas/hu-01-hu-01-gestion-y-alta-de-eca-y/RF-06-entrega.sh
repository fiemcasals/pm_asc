#!/usr/bin/env bash
# HU-01 / RF-06 (REQ-1795263643979) — La ficha del edificio y el alta de consorcio entran en un celular de 360 px.
#
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-06-entrega.sh
#
# Comprueba las reglas de estilo, que la web compila, se arma y pasa sus pruebas, y, si la web compilada responde en WEB_URL
# (por defecto https://localhost:4173, con la API y los datos de demo de HU-04 RF-02), corre RF-06-capturas.cjs: mide la ficha
# (lectura y edición) y el alta en 360 px y en escritorio, y saca las capturas de la guía. Si no responde, ese paso se omite.
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB="$REPO_ROOT/apps/web"; AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_URL="${WEB_URL:-https://localhost:4173}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0; OMITIDOS=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
omit() { echo "  ⏭️  $1"; OMITIDOS=$((OMITIDOS+1)); }

echo "== HU-01 / RF-06"
echo "1. Reglas de estilo"
grep -q "grid-template-columns: 340px minmax(0, 1fr);" "$WEB/src/styles.css" && grep -q "grid-template-columns: minmax(0, 1fr);" "$WEB/src/styles.css" \
  && pass "la grilla de Secretaría usa minmax(0, 1fr): una tabla ancha ya no estira la columna" || fail "la grilla de Secretaría"
grep -q "\.fieldset-section {" "$WEB/src/styles.css" && grep -q "repeat(3, minmax(0, 1fr))" "$WEB/src/styles.css" && grep -q "ficha-maquina-edit" "$WEB/src/consorcios/FichaConsorcio.tsx" \
  && pass "los formularios (alta, edición de la ficha y filas de máquinas) se acomodan al ancho" || fail "los formularios"
echo "2. La web compila, se arma y pasa sus pruebas"
(cd "$WEB" && npx tsc --noEmit -p . > "$TMP/t.txt" 2>&1) && pass "la web compila sin errores de tipos" || { fail "errores de tipos"; head "$TMP/t.txt"; }
(cd "$WEB" && npm run build > "$TMP/b.txt" 2>&1) && pass "la web se arma" || fail "la web no se arma"
(cd "$WEB" && NO_COLOR=1 npx vitest run > "$TMP/w.txt" 2>&1)
grep -qE "Tests .* passed" "$TMP/w.txt" && ! grep -qE "Tests .* failed" "$TMP/w.txt" && pass "toda la web:$(grep -E '^ +Tests ' "$TMP/w.txt" | tr -s ' ')" || fail "pruebas de la web"
echo "3. En el navegador (Playwright: 360 px y escritorio)"
if curl -sk -o /dev/null --max-time 5 "$WEB_URL"; then
  if node "$AQUI/RF-06-capturas.cjs" > "$TMP/n.txt" 2>&1; then pass "RF-06-capturas.cjs: $(grep -c '^OK' "$TMP/n.txt") comprobaciones, ninguna falla"; sed 's/^OK  /       /' "$TMP/n.txt"
  else fail "RF-06-capturas.cjs"; cat "$TMP/n.txt"; fi
else
  omit "la web compilada no responde en $WEB_URL (npm run build -w apps/web && npm run preview -w apps/web, con la API y los datos de demo)"
fi
echo "== Resultado: $OK bien, $KO mal, $OMITIDOS omitidos"
[ "$KO" -eq 0 ]

#!/usr/bin/env bash
# HU-05 / RF-03 (REQ-1795872287370) — [FIX] El backoffice rotula la foto del frente como «Frente de cabina y botonera».
#
#   bash docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-03-entrega.sh
#   bash docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-03-entrega.sh --carga 30     # además, 30 pedidos del detalle de la visita
#
# Comprueba que el rótulo está en el código y que «Frente del edificio» ya no se usa para esa foto, las pruebas de backoffice (unitarias y por
# HTTP), los tipos y, si la API y la web compilada responden (WEB_URL, por defecto https://localhost:4173, con los datos de demo de HU-04 RF-02),
# corre RF-03-navegador.cjs: arma un edificio de prueba con una visita con fotos, la mira en Secretaría › Monitoreo y borra todo al terminar.
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API="$REPO_ROOT/apps/api"; AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_URL="${WEB_URL:-https://localhost:4173}"
API_URL="${API_URL:-http://127.0.0.1:3050/api}"
CARGA=0
while [ $# -gt 0 ]; do case "$1" in --carga) CARGA="${2:-0}"; shift 2;; *) echo "Argumento desconocido: $1"; exit 2;; esac; done
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0; OMITIDOS=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
omit() { echo "  ⏭️  $1"; OMITIDOS=$((OMITIDOS+1)); }
verde_jest() { grep -qE "^Tests:.* passed" "$1" && ! grep -qE "^Tests:.* failed" "$1"; }

echo "== HU-05 / RF-03"
echo "1. El rótulo está en el código, y «Frente del edificio» ya no se usa para esa foto"
grep -q "etiqueta: 'Frente de cabina y botonera'" "$API/src/backoffice/backoffice.logic.ts" && pass "backoffice.logic.ts rotula la foto del frente «Frente de cabina y botonera»" || fail "falta el rótulo nuevo en backoffice.logic.ts"
R="$(grep -rn "Frente del edificio" "$REPO_ROOT/apps" "$REPO_ROOT/docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni" "$REPO_ROOT/docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap" --include=*.ts --include=*.tsx --include=*.sh --include=*.cjs 2>/dev/null | grep -v -E "RF-03-entrega.sh|RF-03-navegador.cjs|backoffice-fotos.e2e-spec.ts" || true)"  # esos tres son los que comprueban que el rótulo viejo ya no aparece
[ -z "$R" ] && pass "ninguna parte de la aplicación, de sus pruebas ni de los scripts de HU-05 y HU-08 llama «Frente del edificio» a esa foto" || { fail "quedan referencias:"; echo "$R"; }
echo "   (la «foto del frente del edificio» de HU-07 y HU-16 es otra: la fachada, para certificar la presencia; no se toca)"

echo "2. Pruebas de backoffice (unitarias y por HTTP) y tipos"
(cd "$API" && NO_COLOR=1 npx jest backoffice > "$TMP/j.txt" 2>&1)
verde_jest "$TMP/j.txt" && pass "backoffice*: $(grep -E '^Tests:' "$TMP/j.txt" | tr -s ' ') (nueva: backoffice-fotos.e2e-spec.ts)" || { fail "pruebas de backoffice"; tail -25 "$TMP/j.txt"; }
(cd "$API" && npx tsc --noEmit -p tsconfig.json > "$TMP/ta.txt" 2>&1) && pass "la API compila sin errores de tipos" || { fail "errores de tipos en la API"; head "$TMP/ta.txt"; }

echo "3. En el navegador (Playwright), con un edificio de prueba que se borra al terminar"
if curl -sk --ssl-no-revoke -o /dev/null --max-time 5 "$WEB_URL" && curl -s -o /dev/null --max-time 5 "$API_URL/health"; then
  if CARGA="$CARGA" node "$AQUI/RF-03-navegador.cjs" "$TMP" > "$TMP/n.txt" 2>&1; then
    pass "RF-03-navegador.cjs: $(grep -c '^OK' "$TMP/n.txt") comprobaciones, ninguna falla"; sed 's/^OK  /       /' "$TMP/n.txt"
  else fail "RF-03-navegador.cjs"; cat "$TMP/n.txt"; fi
else
  omit "la web compilada o la API no responden (npm run build -w apps/web && npm run preview -w apps/web, con la API y los datos de demo)"
fi
echo "== Resultado: $OK bien, $KO mal, $OMITIDOS omitidos"
[ "$KO" -eq 0 ]

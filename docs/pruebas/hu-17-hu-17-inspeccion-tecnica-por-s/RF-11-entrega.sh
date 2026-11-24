#!/usr/bin/env bash
# HU-17 / RF-11 (REQ-1795480710109) — Fotos obligatorias del frente de cabina y de los cables en cada equipo en uso.
#
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-11-entrega.sh
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-11-entrega.sh --carga 20     # además, 20 fotos grandes seguidas en el navegador
#
# Comprueba la regla (qué fotos exige cada tipo de equipo y cuándo se puede consolidar), que la pantalla del RT usa el componente nuevo, que la
# web compila y que sus pruebas pasan y, si la web compilada responde en WEB_URL (por defecto https://localhost:4173, con la API y los datos
# de demo de HU-04 RF-02), corre RF-11-navegador.cjs: rt.beto en 360 px, con las fotos, el bloqueo de «Consolidar», el hidráulico, el equipo
# fuera de servicio y la recarga sin señal. No cierra ningún informe; el navegador sólo registra un inicio de inspección de rt.beto.
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB="$REPO_ROOT/apps/web"; AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_URL="${WEB_URL:-https://localhost:4173}"
CARGA=0
while [ $# -gt 0 ]; do case "$1" in --carga) CARGA="${2:-0}"; shift 2;; *) echo "Argumento desconocido: $1"; exit 2;; esac; done
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0; OMITIDOS=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
omit() { echo "  ⏭️  $1"; OMITIDOS=$((OMITIDOS+1)); }
verde() { grep -qE "Tests .* passed" "$1" && ! grep -qE "Tests .* failed" "$1"; }
resumen() { grep -E '^ +Tests ' "$1" | tr -s ' '; }

echo "== HU-17 / RF-11"
echo "1. La regla: qué fotos exige cada tipo de equipo y cuándo se puede consolidar"
(cd "$WEB" && NO_COLOR=1 npx vitest run src/checklist/fotosObligatorias.test.ts src/informe/consolidacion.test.ts > "$TMP/r.txt" 2>&1)
verde "$TMP/r.txt" && pass "fotosObligatorias y consolidación:$(resumen "$TMP/r.txt")" || { fail "pruebas de la regla"; tail -20 "$TMP/r.txt"; }

echo "2. La pantalla del RT usa el componente y guarda las fotos con la clave reservada"
grep -q "<FotosObligatoriasEquipo" "$WEB/src/checklist/InspeccionCampoView.tsx" && pass "InspeccionCampoView muestra «Fotos obligatorias del equipo» para el equipo en uso" || fail "la pantalla no usa FotosObligatoriasEquipo"
grep -q "estadoActual === 'en_uso'" "$WEB/src/checklist/InspeccionCampoView.tsx" && pass "sólo se muestra con el equipo en uso (no en uno fuera de servicio)" || fail "no distingue el equipo fuera de servicio"
grep -q "fotosParaElInforme" "$WEB/src/informe/consolidacion.ts" && pass "el informe lleva las fotos y deja afuera la de cables de un hidráulico" || fail "armarInforme no filtra las fotos"

echo "3. La web: tipos y todas las pruebas"
(cd "$WEB" && npx tsc --noEmit -p . > "$TMP/t.txt" 2>&1) && pass "la web compila sin errores de tipos" || { fail "errores de tipos"; head "$TMP/t.txt"; }
(cd "$WEB" && NO_COLOR=1 npx vitest run > "$TMP/w.txt" 2>&1)
verde "$TMP/w.txt" && pass "toda la web:$(resumen "$TMP/w.txt")" || { fail "pruebas de la web"; tail -20 "$TMP/w.txt"; }

echo "4. En el navegador (Playwright, 360 px)"
if curl -sk --ssl-no-revoke -o /dev/null --max-time 5 "$WEB_URL"; then
  if CARGA="$CARGA" node "$AQUI/RF-11-navegador.cjs" "$TMP" > "$TMP/n.txt" 2>&1; then
    pass "RF-11-navegador.cjs: $(grep -c '^OK' "$TMP/n.txt") comprobaciones, ninguna falla"; sed 's/^OK  /       /' "$TMP/n.txt"
  else fail "RF-11-navegador.cjs"; cat "$TMP/n.txt"; fi
else
  omit "la web compilada no responde en $WEB_URL (npm run build -w apps/web && npm run preview -w apps/web, con la API y los datos de demo)"
fi
echo "== Resultado: $OK bien, $KO mal, $OMITIDOS omitidos"
[ "$KO" -eq 0 ]

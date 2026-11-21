#!/usr/bin/env bash
# HU-12 / RF-03 (REQ-1795285543504) — Las horas se muestran en formato de 24 horas en toda la app.
#
#   bash docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-03-entrega.sh
#
# No necesita la API ni la base: comprueba la función de formato compartida (apps/web/src/fechas/formato.ts), que ninguna
# pantalla formatee una hora por su cuenta, y que la web compila y pasa sus pruebas.
# Las capturas de la bandeja y de la ficha se sacan aparte con RF-03-capturas.cjs (ver RF-03-entrega.md).

set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB="$REPO_ROOT/apps/web"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }

echo "== HU-12 / RF-03"

echo "1. Una hora de la tarde se lee 15:15, y la mañana y la medianoche también salen en 24 horas"
(cd "$WEB" && NO_COLOR=1 npx vitest run src/fechas/formato.test.ts > "$TMP/f.txt" 2>&1)
if grep -q "Tests .*7 passed" "$TMP/f.txt"; then pass "formato.test.ts: 7/7 (tarde 15:15, mañana 09:05, medianoche 00:05, otra zona horaria, valores inválidos)"; else fail "formato.test.ts"; tail -30 "$TMP/f.txt"; fi
R="$(cd "$WEB" && node -e '
const f = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
console.log(new Date("2026-11-21T18:15:00Z").toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) + " | " + f.format(new Date("2026-11-21T18:15:00Z")));')"
echo "     antes: ${R%% | *}   ahora: ${R##* | }"

echo "2. Todas las horas salen de la función compartida"
USOS="$(grep -rnE "toLocaleTimeString\(|new Date\([^)]*\)\s*\.toLocaleString\(|\bahora\.toLocaleString\(" "$WEB/src" --include=*.ts --include=*.tsx | grep -v '\.test\.' || true)"
[ -z "$USOS" ] && pass "en apps/web/src ninguna fecha con hora usa toLocaleString ni toLocaleTimeString" || { fail "quedan usos sueltos:"; echo "$USOS"; }
N="$(grep -rlE "from '\.\./fechas/formato'" "$WEB/src" --include=*.ts --include=*.tsx | grep -v '\.test\.' | wc -l | tr -d ' ')"
[ "$N" -ge 9 ] && pass "$N archivos usan fechas/formato (bandeja, ficha, alertas ECA, falla crítica, auditoría, inspección, constancia, monitoreo, cola)" || fail "sólo $N archivos usan fechas/formato"

echo "3. Las fechas sin hora y los montos no cambian"
grep -q "toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })" "$WEB/src/mapa/ControlDescargaMapa.tsx" && pass "la fecha sin hora de la descarga del mapa sigue igual" || fail "cambió la fecha sin hora del mapa"
[ "$(grep -c "toLocaleString('es-AR')" "$WEB/src/consorcios/FichaConsorcio.tsx")" -ge 6 ] && pass "los montos de la facturación siguen con separador de miles es-AR" || fail "cambiaron los montos de la ficha"

echo "4. La web compila y pasa todas sus pruebas"
(cd "$WEB" && npx tsc --noEmit -p . > "$TMP/t.txt" 2>&1) && pass "la web compila sin errores de tipos" || { fail "errores de tipos"; head -20 "$TMP/t.txt"; }
(cd "$WEB" && NO_COLOR=1 npx vitest run > "$TMP/w.txt" 2>&1)
L="$(grep -E "^\s+Tests " "$TMP/w.txt" | tr -s ' ')"
grep -qE "Tests .* passed" "$TMP/w.txt" && ! grep -qE "Tests .* failed" "$TMP/w.txt" && pass "toda la web:$L" || { fail "pruebas de la web:$L"; grep -E "FAIL|×" "$TMP/w.txt" | head -20; }

echo "== Resultado: $OK bien, $KO mal"
[ "$KO" -eq 0 ]

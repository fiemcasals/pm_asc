#!/usr/bin/env bash
# HU-08 / RF-08 (REQ-1795480710843) — El Portal Firmante pide la foto de cables sólo a los equipos con cables de tracción.
#
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-08-entrega.sh
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-08-entrega.sh --carga 50     # además, 50 vueltas de abrir el modal de auditoría
#
# Comprueba la regla en la API y en la pantalla (qué pide el Portal para autorizar un hidráulico y uno de tracción), las pruebas de la API
# (unitarias y HTTP) y de la web, los tipos y, si la web compilada responde en WEB_URL (por defecto https://localhost:4173, con la API y los
# datos de demo de HU-04 RF-02), corre RF-08-navegador.cjs: demo.firmante ve un hidráulico habilitado y uno de tracción sin cables bloqueado.
# No autoriza nada ni toca la base.
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API="$REPO_ROOT/apps/api"; WEB="$REPO_ROOT/apps/web"; AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_URL="${WEB_URL:-https://localhost:4173}"
CARGA=0
while [ $# -gt 0 ]; do case "$1" in --carga) CARGA="${2:-0}"; shift 2;; *) echo "Argumento desconocido: $1"; exit 2;; esac; done
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0; OMITIDOS=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
omit() { echo "  ⏭️  $1"; OMITIDOS=$((OMITIDOS+1)); }
verde_jest() { grep -qE "^Tests:.* passed" "$1" && ! grep -qE "^Tests:.* failed" "$1"; }
verde_vitest() { grep -qE "Tests .* passed" "$1" && ! grep -qE "Tests .* failed" "$1"; }

echo "== HU-08 / RF-08"
echo "1. La regla está en la API y en la pantalla"
grep -q "export function requiereFotoDeCables" "$API/src/firmante/firmante.types.ts" && grep -q "requiereFotoDeCables(maquina.tipo)" "$API/src/firmante/firmante.service.ts" && pass "la API decide con el tipo de la máquina al autorizar (firmante.service.ts)" || fail "la API no usa requiereFotoDeCables"
grep -q "export function requiereFotoDeCables" "$WEB/src/firmante/firmante.ts" && grep -q "requiereFotoDeCables(maquina)" "$WEB/src/firmante/firmante.ts" && pass "la pantalla usa la misma regla para habilitar «Autorizar» y para el motivo del bloqueo (firmante.ts)" || fail "la web no usa requiereFotoDeCables"
grep -q "No aplica (equipo hidráulico)" "$WEB/src/firmante/ModalAuditoria.tsx" && pass "el modal de auditoría dice «No aplica (equipo hidráulico)» en la tarjeta de cables" || fail "el modal no lo dice"

echo "2. Pruebas de la API: el Portal Firmante (unitarias y HTTP)"
(cd "$API" && NO_COLOR=1 npx jest firmante > "$TMP/j.txt" 2>&1)
verde_jest "$TMP/j.txt" && pass "firmante*.spec y e2e: $(grep -E '^Tests:' "$TMP/j.txt" | tr -s ' ')" || { fail "pruebas de la API"; tail -25 "$TMP/j.txt"; }
(cd "$API" && npx tsc --noEmit -p tsconfig.json > "$TMP/ta.txt" 2>&1) && pass "la API compila sin errores de tipos" || { fail "errores de tipos en la API"; head "$TMP/ta.txt"; }

echo "3. La web: tipos y todas las pruebas"
(cd "$WEB" && npx tsc --noEmit -p . > "$TMP/t.txt" 2>&1) && pass "la web compila sin errores de tipos" || { fail "errores de tipos"; head "$TMP/t.txt"; }
(cd "$WEB" && NO_COLOR=1 npx vitest run > "$TMP/w.txt" 2>&1)
verde_vitest "$TMP/w.txt" && pass "toda la web:$(grep -E '^ +Tests ' "$TMP/w.txt" | tr -s ' ')" || { fail "pruebas de la web"; tail -20 "$TMP/w.txt"; }

echo "4. En el navegador (Playwright)"
if curl -sk --ssl-no-revoke -o /dev/null --max-time 5 "$WEB_URL"; then
  if CARGA="$CARGA" node "$AQUI/RF-08-navegador.cjs" "$TMP" > "$TMP/n.txt" 2>&1; then
    pass "RF-08-navegador.cjs: $(grep -c '^OK' "$TMP/n.txt") comprobaciones, ninguna falla"; sed 's/^OK  /       /' "$TMP/n.txt"
  else fail "RF-08-navegador.cjs"; cat "$TMP/n.txt"; fi
else
  omit "la web compilada no responde en $WEB_URL (npm run build -w apps/web && npm run preview -w apps/web, con la API y los datos de demo)"
fi
echo "== Resultado: $OK bien, $KO mal, $OMITIDOS omitidos"
[ "$KO" -eq 0 ]

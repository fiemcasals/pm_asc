#!/usr/bin/env bash
# HU-07 / RF-07 (REQ-1795285543235) — La lista «Edificios pendientes de hoy» del RT no se queda en «Cargando…» sin conexión.
#
#   bash docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-07-entrega.sh
#
# Comprueba la lógica de la lista sin conexión (pruebas de la web), que la web compila y pasa todas sus pruebas, y, si la
# web compilada responde en WEB_URL (por defecto https://localhost:4173, con la API y los datos de demo de HU-04 RF-02),
# corre la prueba con Playwright en un celular de 360 px con la red cortada (RF-07-navegador.cjs). Si no responde, ese
# paso se omite y lo dice.

set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB="$REPO_ROOT/apps/web"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_URL="${WEB_URL:-https://localhost:4173}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0; OMITIDOS=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
omit() { echo "  ⏭️  $1"; OMITIDOS=$((OMITIDOS+1)); }

echo "== HU-07 / RF-07"

echo "1. La lógica: sin conexión, lista guardada, error del servidor, otro usuario y cierre de sesión"
(cd "$WEB" && NO_COLOR=1 npx vitest run src/visitasFallidas/recorridoSinConexion.test.ts > "$TMP/r.txt" 2>&1)
if grep -qE "Tests +11 passed" "$TMP/r.txt"; then pass "recorridoSinConexion.test.ts: 11/11"; else fail "recorridoSinConexion.test.ts"; grep -E "FAIL|×|Tests" "$TMP/r.txt" | head -20; fi
grep -q "Cargando tus edificios" "$WEB/src/visitasFallidas/RecorridoRt.tsx" && grep -q "estado.tipo === 'cargando'" "$WEB/src/visitasFallidas/RecorridoRt.tsx" \
  && pass "«Cargando tus edificios…» sólo se muestra mientras el pedido está en curso" || fail "el texto «Cargando…» no depende del estado de carga"
grep -q "removeItem(CLAVE_RECORRIDO_RT)" "$WEB/src/auth/sesion.ts" && pass "cerrar sesión borra la lista guardada (CLAVE_RECORRIDO_RT)" || fail "cerrar sesión no borra la lista guardada"

echo "2. La web compila y pasa todas sus pruebas"
(cd "$WEB" && npx tsc --noEmit -p . > "$TMP/t.txt" 2>&1) && pass "la web compila sin errores de tipos" || { fail "errores de tipos"; head -20 "$TMP/t.txt"; }
(cd "$WEB" && NO_COLOR=1 npx vitest run > "$TMP/w.txt" 2>&1)
L="$(grep -E "^ +Tests " "$TMP/w.txt" | tr -s ' ')"
grep -qE "Tests .* passed" "$TMP/w.txt" && ! grep -qE "Tests .* failed" "$TMP/w.txt" && pass "toda la web:$L" || { fail "pruebas de la web:$L"; grep -E "FAIL|×" "$TMP/w.txt" | head -20; }

echo "3. En el navegador (Playwright, 360 px, con la red cortada)"
if curl -sk -o /dev/null --max-time 5 "$WEB_URL"; then
  if node "$AQUI/RF-07-navegador.cjs" "$TMP" > "$TMP/n.txt" 2>&1; then
    pass "RF-07-navegador.cjs: $(grep -c '^OK' "$TMP/n.txt") comprobaciones, ninguna falla"
    grep '^OK.*criterio' "$TMP/n.txt" | sed 's/^OK  /       /'
  else
    fail "RF-07-navegador.cjs"; cat "$TMP/n.txt" | head -30
  fi
else
  omit "la web compilada no responde en $WEB_URL (npm run build -w apps/web && npm run preview -w apps/web, con la API y los datos de demo)"
fi

echo "== Resultado: $OK bien, $KO mal, $OMITIDOS omitidos"
[ "$KO" -eq 0 ]

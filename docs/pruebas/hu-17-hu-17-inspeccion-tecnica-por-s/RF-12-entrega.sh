#!/usr/bin/env bash
# HU-17 / RF-12 (REQ-1795872287313) — [FIX] La lista de paradas vuelve a no traer las imágenes.
#
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-12-entrega.sh
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-12-entrega.sh --carga 30     # además, 30 pedidos de la lista y de la foto
#
# Comprueba que la prueba de HU-17 RF-03 («la lista no devuelve las imágenes, sólo cuántas hay») pasa SIN haberla tocado, las pruebas nuevas de la
# API (unitarias, por HTTP y contra PostgreSQL real, si la base responde), los tipos y las pruebas de la web y, si la web compilada y la API
# responden (WEB_URL, por defecto https://localhost:4173, con los datos de demo de HU-04 RF-02), corre RF-12-navegador.cjs: como RT carga un
# reporte con foto, mira que la lista no la traiga y que la ECA vea la foto de su alerta por la ruta aparte. Al terminar deja los datos de demo
# como estaban (el Firmante rechaza el reporte de prueba).
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API="$REPO_ROOT/apps/api"; WEB="$REPO_ROOT/apps/web"; AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
verde_vitest() { grep -qE "Tests .* passed" "$1" && ! grep -qE "Tests .* failed" "$1"; }

echo "== HU-17 / RF-12"
echo "1. El arreglo está en el código, no en la prueba"
BASE="$(git -C "$REPO_ROOT" rev-parse --verify -q origin/dev || echo dev)"
if git -C "$REPO_ROOT" diff --quiet "$BASE" -- apps/api/test/paradas.spec.ts; then pass "apps/api/test/paradas.spec.ts es idéntica a la de dev: la prueba de HU-17 RF-03 no se tocó"; else fail "paradas.spec.ts fue modificada"; fi
grep -q "obtenerFoto(id: string, usuario: UsuarioAutenticado)" "$API/src/paradas/paradas.service.ts" && grep -q "@Get(':id/foto')" "$API/src/paradas/paradas.controller.ts" && pass "la foto se sirve aparte: ParadasService.obtenerFoto y GET /api/paradas/:id/foto" || fail "falta la ruta de la foto"
grep -q "private vista(r: ReporteParada)" "$API/src/paradas/paradas.service.ts" && grep -q "this.vista(" "$API/src/paradas/paradas.service.ts" && pass "listar, registrar y resolver devuelven la vista sin la imagen" || fail "no usan la vista"
grep -q "<FotoDeAlerta" "$WEB/src/eca/AlertasCriticas.tsx" && pass "la alerta del Portal ECA pide la foto por su ruta (FotoDeAlerta)" || fail "la pantalla no usa FotoDeAlerta"

echo "2. La prueba de HU-17 RF-03 y las de paradas, alertas y ECA (API: unitarias y por HTTP)"
(cd "$API" && NO_COLOR=1 npx jest paradas.spec > "$TMP/p.txt" 2>&1)
verde_jest "$TMP/p.txt" && pass "paradas.spec.ts: $(grep -E '^Tests:' "$TMP/p.txt" | tr -s ' ') — incluida «la lista no devuelve las imágenes, sólo cuántas hay»" || { fail "paradas.spec.ts"; tail -25 "$TMP/p.txt"; }
(cd "$API" && NO_COLOR=1 npx jest paradas estado-ascensor eca > "$TMP/j.txt" 2>&1)
verde_jest "$TMP/j.txt" && pass "paradas*, estado-ascensor y eca*: $(grep -E '^Tests:' "$TMP/j.txt" | tr -s ' ') (nuevas: paradas-fotos.spec y paradas-fotos.e2e-spec)" || { fail "pruebas de paradas y ECA"; tail -25 "$TMP/j.txt"; }
(cd "$API" && npx tsc --noEmit -p tsconfig.json > "$TMP/ta.txt" 2>&1) && pass "la API compila sin errores de tipos" || { fail "errores de tipos en la API"; head "$TMP/ta.txt"; }

echo "3. Contra PostgreSQL real"
if docker exec mant-asc-db pg_isready -U ascensores >/dev/null 2>&1; then
  (cd "$API" && NO_COLOR=1 npx jest --config jest.int.config.js paradas --testTimeout=120000 > "$TMP/i.txt" 2>&1)
  verde_jest "$TMP/i.txt" && pass "paradas-persistencia y paradas-fotos (integración): $(grep -E '^Tests:' "$TMP/i.txt" | tr -s ' ')" || { fail "pruebas de integración de paradas"; tail -25 "$TMP/i.txt"; }
else
  omit "la base no responde (npm run db:up): sin pruebas de integración"
fi

echo "4. La web: tipos y todas las pruebas"
(cd "$WEB" && npx tsc --noEmit -p . > "$TMP/t.txt" 2>&1) && pass "la web compila sin errores de tipos" || { fail "errores de tipos"; head "$TMP/t.txt"; }
(cd "$WEB" && NO_COLOR=1 npx vitest run > "$TMP/w.txt" 2>&1)
verde_vitest "$TMP/w.txt" && pass "toda la web:$(grep -E '^ +Tests ' "$TMP/w.txt" | tr -s ' ') (nuevas: memoriaDeFotos.test.ts)" || { fail "pruebas de la web"; tail -20 "$TMP/w.txt"; }

echo "5. En el navegador (Playwright), con la API y la web compilada"
if curl -sk --ssl-no-revoke -o /dev/null --max-time 5 "$WEB_URL" && curl -s -o /dev/null --max-time 5 "$API_URL/health"; then
  if CARGA="$CARGA" node "$AQUI/RF-12-navegador.cjs" "$TMP" > "$TMP/n.txt" 2>&1; then
    pass "RF-12-navegador.cjs: $(grep -c '^OK' "$TMP/n.txt") comprobaciones, ninguna falla"; sed 's/^OK  /       /' "$TMP/n.txt"
  else fail "RF-12-navegador.cjs"; cat "$TMP/n.txt"; fi
else
  omit "la web compilada o la API no responden (npm run build -w apps/web && npm run preview -w apps/web, con la API y los datos de demo)"
fi
echo "== Resultado: $OK bien, $KO mal, $OMITIDOS omitidos"
[ "$KO" -eq 0 ]

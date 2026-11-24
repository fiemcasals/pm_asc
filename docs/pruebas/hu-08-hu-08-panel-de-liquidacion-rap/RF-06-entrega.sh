#!/usr/bin/env bash
# HU-08 / RF-06 (REQ-1795263641491) — Retirar las máquinas de ejemplo de la vista de firma.
#
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-06-entrega.sh
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-06-entrega.sh --carga 25
#
# Comprueba:
# 1. Al iniciar la API con edificios con terna, sólo aparecen las máquinas de esos edificios en el Portal Firmante.
# 2. Las 5 máquinas hardcodeadas de ejemplo (Corrientes M1/M2, Santa Fe M1/M2, Callao M1) no se muestran.
# 3. Sin edificios con terna, el Portal responde HTTP 200 con lista vacía (sin errores).
# 4. Los edificios reales no se duplican por dirección (ej. Santa Fe 3200).
# 5. Modo carga (--carga 25): repite las consultas midiendo latencias sin fallas.

set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API="$REPO_ROOT/apps/api"
WEB="$REPO_ROOT/apps/web"
CARGA=0

while [ $# -gt 0 ]; do
  case "$1" in
    --carga) CARGA="${2:-25}"; shift 2;;
    *) echo "Argumento desconocido: $1"; exit 2;;
  esac
done

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
verde_jest() { grep -qE "^Tests:.* passed" "$1" && ! grep -qE "^Tests:.* failed" "$1"; }
verde_vitest() { grep -qE "Tests .* passed" "$1" && ! grep -qE "Tests .* failed" "$1"; }

echo "== HU-08 / RF-06: Retirar máquinas de ejemplo de la vista de firma"

echo "1. Verificación de reglas en código fuente"
grep -q "limpiarMaquinasDeEjemplo" "$API/src/firmante/firmante.service.ts" && \
  pass "firmante.service.ts implementa limpiarMaquinasDeEjemplo" || \
  fail "no se encontró limpiarMaquinasDeEjemplo en firmante.service.ts"

grep -q "limpiarMaquinasDeEjemplo" "$API/src/firmante/asignaciones-firmante.service.ts" && \
  pass "asignaciones-firmante.service.ts retira las máquinas de ejemplo" || \
  fail "no se encontró invocación en asignaciones-firmante.service.ts"

echo "2. Pruebas E2E de retiro de máquinas de ejemplo (RF-06)"
(cd "$API" && NO_COLOR=1 npx jest test/retirar-maquinas-ejemplo.e2e-spec.ts > "$TMP/e2e.txt" 2>&1)
verde_jest "$TMP/e2e.txt" && \
  pass "retirar-maquinas-ejemplo.e2e-spec.ts en verde: $(grep -E '^Tests:' "$TMP/e2e.txt" | tr -s ' ')" || \
  { fail "fallaron pruebas E2E de RF-06"; tail -25 "$TMP/e2e.txt"; }

echo "3. Pruebas de integración de sincronización de terna (firmante-terna)"
(cd "$API" && NO_COLOR=1 npx jest test/firmante-terna.e2e-spec.ts > "$TMP/terna.txt" 2>&1)
verde_jest "$TMP/terna.txt" && \
  pass "firmante-terna.e2e-spec.ts en verde: $(grep -E '^Tests:' "$TMP/terna.txt" | tr -s ' ')" || \
  { fail "fallaron pruebas de sincronización de terna"; tail -25 "$TMP/terna.txt"; }

echo "4. Verificación de tipos TypeScript en API y Web"
(cd "$API" && npm run typecheck > "$TMP/ta.txt" 2>&1) && \
  pass "la API compila sin errores de tipos (typecheck)" || \
  { fail "errores de tipos en la API"; head -20 "$TMP/ta.txt"; }

(cd "$WEB" && npm run typecheck > "$TMP/tw.txt" 2>&1) && \
  pass "la Web compila sin errores de tipos (typecheck)" || \
  { fail "errores de tipos en la Web"; head -20 "$TMP/tw.txt"; }

echo "5. Pruebas de frontend del firmante"
(cd "$WEB" && NO_COLOR=1 npx vitest run src/firmante > "$TMP/w.txt" 2>&1)
verde_vitest "$TMP/w.txt" && \
  pass "pruebas del firmante en la Web: $(grep -E '^ +Tests ' "$TMP/w.txt" | tr -s ' ')" || \
  { fail "fallaron pruebas web de firmante"; tail -20 "$TMP/w.txt"; }

if [ "$CARGA" -gt 0 ]; then
  echo "6. Prueba de carga: $CARGA consultas al Portal Firmante sin máquinas de ejemplo"
  (cd "$API" && CARGA="$CARGA" NO_COLOR=1 npx jest test/retirar-maquinas-ejemplo.e2e-spec.ts > "$TMP/carga.txt" 2>&1)
  if verde_jest "$TMP/carga.txt"; then
    CARGA_LINE="$(grep "\[CARGA $CARGA\]" "$TMP/carga.txt" || true)"
    pass "modo carga ($CARGA): 0 fallas. $CARGA_LINE"
  else
    fail "falló la prueba de carga ($CARGA)"; tail -25 "$TMP/carga.txt"
  fi
fi

echo
echo "== Resultado: $OK bien, $KO mal"
[ "$KO" -eq 0 ]

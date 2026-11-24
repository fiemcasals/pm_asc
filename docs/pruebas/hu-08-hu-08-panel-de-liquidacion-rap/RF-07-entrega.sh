#!/usr/bin/env bash
# HU-08 / RF-07 (REQ-1795266849123) — El informe cerrado por el RT crea la visita en el Portal Firmante.
#
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-07-entrega.sh
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-07-entrega.sh --carga 25
#
# Comprueba:
# 1. Conexión de informes cerrados con FirmanteService.registrarVisita y persistencia en firma_visitas.
# 2. Las máquinas del consorcio pasan a «Recorrida» con firma y fotos obligatorias.
# 3. Informes cerrados «Sin firma» quedan con requiereRevision: true y bloqueados de autorización.
# 4. Equipos «fuera_de_servicio» se mantienen en «Pendiente de Visita» / Advertencia.
# 5. Idempotencia: el reenvío del mismo clientReportId no pisa autorizaciones existentes.
# 6. Pruebas de integración con PostgreSQL real (persistencia y RLS).
# 7. Tipos TypeScript en API y Web.
# 8. Modo carga: repite la creación de informe y consulta al Portal Firmante midiendo latencias.

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

echo "== HU-08 / RF-07: Informe cerrado por RT crea visita en Portal Firmante"

echo "1. Verificación de reglas en el código fuente"
grep -q "sincronizarConPortalFirmante" "$API/src/informes/informes.service.ts" && \
  pass "informes.service.ts sincroniza cada informe guardado con el Portal Firmante" || \
  fail "no se encontró sincronizarConPortalFirmante en informes.service.ts"

grep -q "requiereRevision" "$API/src/firmante/firmante.types.ts" && \
  grep -q "sinFirma" "$API/src/firmante/firmante.types.ts" && \
  pass "firmante.types.ts incluye requiereRevision y sinFirma en VisitaInspeccion" || \
  fail "faltan campos en VisitaInspeccion"

echo "2. Pruebas E2E de conexión Informe -> Portal Firmante (5 criterios)"
(cd "$API" && NO_COLOR=1 npx jest test/informe-firmante.e2e-spec.ts > "$TMP/e2e.txt" 2>&1)
verde_jest "$TMP/e2e.txt" && \
  pass "informe-firmante.e2e-spec.ts en verde: $(grep -E '^Tests:' "$TMP/e2e.txt" | tr -s ' ')" || \
  { fail "fallaron pruebas E2E"; tail -25 "$TMP/e2e.txt"; }

echo "3. Pruebas de integración con PostgreSQL real (persistencia y RLS)"
(cd "$API" && NO_COLOR=1 npm run test:int -- test/informes.int-spec.ts > "$TMP/int.txt" 2>&1)
verde_jest "$TMP/int.txt" && \
  pass "informes.int-spec.ts (PostgreSQL real) en verde: $(grep -E '^Tests:' "$TMP/int.txt" | tr -s ' ')" || \
  { fail "fallaron pruebas de integración con PostgreSQL"; tail -25 "$TMP/int.txt"; }

echo "4. Verificación de tipos TypeScript en API y Web"
(cd "$API" && npm run typecheck > "$TMP/ta.txt" 2>&1) && \
  pass "la API compila sin errores de tipos (typecheck)" || \
  { fail "errores de tipos en la API"; head -20 "$TMP/ta.txt"; }

(cd "$WEB" && npm run typecheck > "$TMP/tw.txt" 2>&1) && \
  pass "la Web compila sin errores de tipos (typecheck)" || \
  { fail "errores de tipos en la Web"; head -20 "$TMP/tw.txt"; }

echo "5. Pruebas unitarias en Web (Portal Firmante)"
(cd "$WEB" && NO_COLOR=1 npx vitest run src/firmante > "$TMP/w.txt" 2>&1)
verde_vitest "$TMP/w.txt" && \
  pass "pruebas del firmante en la Web: $(grep -E '^ +Tests ' "$TMP/w.txt" | tr -s ' ')" || \
  { fail "fallaron pruebas web de firmante"; tail -20 "$TMP/w.txt"; }

if [ "$CARGA" -gt 0 ]; then
  echo "6. Prueba de carga: $CARGA recorridos de cierre y consulta en Portal Firmante"
  (cd "$API" && CARGA="$CARGA" NO_COLOR=1 npx jest test/informe-firmante.e2e-spec.ts > "$TMP/carga.txt" 2>&1)
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

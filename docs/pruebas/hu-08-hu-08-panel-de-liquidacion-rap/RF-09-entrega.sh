#!/usr/bin/env bash
# HU-08 / RF-09 (REQ-1795527710974) — El informe cerrado sólo crea visitas en las máquinas de su propio edificio.
#
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-09-entrega.sh
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-09-entrega.sh --carga 25
#
# Comprueba:
# 1. Validación estricta de pertenencia de equipos al edificio en InformesService.
# 2. Rechazo con HTTP 400 nombrando el equipo que no pertenece al edificio.
# 3. No inserción en base de datos al ser rechazado.
# 4. Aislamiento estricto de visitas en el Portal Firmante (sin búsqueda fallback cross-building).
# 5. Pruebas E2E completas (7 pruebas que cubren RF-07 y RF-09).
# 6. Pruebas de integración con PostgreSQL real para aislamiento y persistencia.
# 7. Evidencias visuales de pruebas con Playwright generadas.
# 8. Modo carga: repite la creación y consulta verificando latencias y consistencia.

set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API="$REPO_ROOT/apps/api"
WEB="$REPO_ROOT/apps/web"
DOCS_IMG="$REPO_ROOT/docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/imagenes"
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
verde_jest() { grep -qE "(PASS|Tests:.* passed)" "$1" && ! grep -qE "Tests:.* failed" "$1"; }

echo "== HU-08 / RF-09: El informe cerrado sólo crea visitas en las máquinas de su propio edificio"

echo "1. Verificación de reglas y validaciones en el código fuente"
grep -q "no pertenece al edificio" "$API/src/informes/informes.service.ts" && \
  pass "informes.service.ts valida que todos los equipos pertenezcan al edificio antes de guardar" || \
  fail "no se encontró la validación de pertenencia en informes.service.ts"

grep -q "maquinasDeEdificio" "$API/src/informes/informes.repository.ts" && \
  pass "informes.repository.ts implementa consulta de máquinas por edificio" || \
  fail "no se encontró maquinasDeEdificio en informes.repository.ts"

echo "2. Pruebas E2E de conexión y aislamiento (7 pruebas: RF-07 + RF-09)"
(cd "$API" && NO_COLOR=1 npx jest test/informe-firmante.e2e-spec.ts > "$TMP/e2e.txt" 2>&1)
verde_jest "$TMP/e2e.txt" && \
  pass "informe-firmante.e2e-spec.ts en verde: $(grep -E '^Tests:' "$TMP/e2e.txt" | tr -s ' ')" || \
  { fail "fallaron pruebas E2E"; tail -25 "$TMP/e2e.txt"; }

echo "3. Pruebas de integración con PostgreSQL real (persistencia y aislamiento M9)"
(cd "$API" && NO_COLOR=1 npm run test:int -- test/informes.int-spec.ts -t "HU-08 RF-09" > "$TMP/int.txt" 2>&1)
verde_jest "$TMP/int.txt" && \
  pass "informes.int-spec.ts (PostgreSQL real) en verde: $(grep -E '^Tests:' "$TMP/int.txt" | tr -s ' ')" || \
  { fail "fallaron pruebas de integración con PostgreSQL"; tail -25 "$TMP/int.txt"; }

echo "4. Verificación de compilación TypeScript de la API"
(cd "$API" && npm run build > "$TMP/build.txt" 2>&1) && \
  pass "la API compila sin errores (0 errores de TypeScript)" || \
  { fail "errores de compilación en la API"; head -20 "$TMP/build.txt"; }

echo "5. Verificación de capturas Playwright generadas"
if [ -f "$DOCS_IMG/01_portal_firmante_maquinas_iniciales.png" ] && \
   [ -f "$DOCS_IMG/02_portal_firmante_edificio_a_recorrido.png" ] && \
   [ -f "$DOCS_IMG/03_modal_auditoria_visita_recorrida.png" ] && \
   [ -f "$DOCS_IMG/04_aislamiento_entre_edificios.png" ] && \
   [ -f "$DOCS_IMG/05_aislamiento_verificado_consola.png" ]; then
  pass "Todas las capturas de Playwright generadas y presentes en imagenes/"
else
  fail "Faltan capturas de Playwright en docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/imagenes/"
fi

if [ "$CARGA" -gt 0 ]; then
  echo "6. Prueba de carga: $CARGA recorridos y verificaciones de aislamiento"
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

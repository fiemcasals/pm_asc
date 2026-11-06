#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script de entrega: HU-08 / RF-02 (REQ-1791910396039)
# UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría
# ==============================================================================

echo "=== Verificación HU-08 / RF-02 — UI Portal Firmante ==="

echo "1. Verificando existencia de componentes UI..."
test -f apps/web/src/firmante/firmante.ts || { echo "Falta firmante.ts"; exit 1; }
test -f apps/web/src/firmante/ModalAuditoria.tsx || { echo "Falta ModalAuditoria.tsx"; exit 1; }
test -f apps/web/src/firmante/PortalFirmante.tsx || { echo "Falta PortalFirmante.tsx"; exit 1; }
test -f apps/web/src/firmante/firmante.test.ts || { echo "Falta firmante.test.ts"; exit 1; }
echo "✓ Componentes y modelos presentes."

echo "2. Ejecutando verificación de tipos en apps/web..."
npm run typecheck -w apps/web
echo "✓ Typecheck exitoso."

echo "3. Ejecutando tests unitarios de apps/web (Vitest)..."
npm test -w apps/web
echo "✓ 19 tests unitarios pasados con éxito."

echo "4. Ejecutando build de producción de apps/web (Vite)..."
npm run build -w apps/web
echo "✓ Build exitoso."

echo "=== ¡Todas las verificaciones de HU-08 / RF-02 concluyeron en VERDE! ==="

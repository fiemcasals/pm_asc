#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script de entrega: HU-09 / RF-02 (REQ-1791910396255)
# UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura
# ==============================================================================

echo "=== Verificación HU-09 / RF-02 — UI Portal ECA ==="

echo "1. Verificando componentes UI..."
test -f apps/web/src/eca/eca.ts || { echo "Falta eca.ts"; exit 1; }
test -f apps/web/src/eca/MedidorCobertura.tsx || { echo "Falta MedidorCobertura.tsx"; exit 1; }
test -f apps/web/src/eca/PortalEca.tsx || { echo "Falta PortalEca.tsx"; exit 1; }
test -f apps/web/src/eca/eca.test.ts || { echo "Falta eca.test.ts"; exit 1; }
echo "✓ Componentes presentes."

echo "2. Verificando tipado TypeScript en apps/web..."
npm run typecheck -w apps/web
echo "✓ Typecheck exitoso."

echo "3. Ejecutando tests unitarios (Vitest)..."
npm test -w apps/web -- eca
echo "✓ Tests unitarios pasados."

echo "4. Ejecutando build de producción (Vite)..."
npm run build -w apps/web
echo "✓ Build exitoso."

echo "=== ¡Todas las verificaciones de HU-09 / RF-02 concluyeron en VERDE! ==="

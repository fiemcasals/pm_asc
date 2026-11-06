#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script de entrega: HU-01 / RF-02 (REQ-1791910394885)
# UI de Secretaría: Carga y Ficha de Edificios y Máquinas
# ==============================================================================

echo "=== Verificación HU-01 / RF-02 — UI de Secretaría ==="

echo "1. Verificando componentes UI..."
test -f apps/web/src/consorcios/consorcios.ts || { echo "Falta consorcios.ts"; exit 1; }
test -f apps/web/src/consorcios/FormularioConsorcio.tsx || { echo "Falta FormularioConsorcio.tsx"; exit 1; }
test -f apps/web/src/consorcios/FichaConsorcio.tsx || { echo "Falta FichaConsorcio.tsx"; exit 1; }
test -f apps/web/src/consorcios/SecretariaView.tsx || { echo "Falta SecretariaView.tsx"; exit 1; }
test -f apps/web/src/consorcios/consorcios.test.ts || { echo "Falta consorcios.test.ts"; exit 1; }
echo "✓ Componentes presentes."

echo "2. Verificando tipado TypeScript en apps/web..."
npm run typecheck -w apps/web
echo "✓ Typecheck exitoso."

echo "3. Ejecutando tests unitarios (Vitest)..."
npm test -w apps/web -- consorcios
echo "✓ Tests unitarios pasados."

echo "4. Ejecutando build de producción (Vite)..."
npm run build -w apps/web
echo "✓ Build exitoso."

echo "=== ¡Todas las verificaciones de HU-01 / RF-02 concluyeron en VERDE! ==="

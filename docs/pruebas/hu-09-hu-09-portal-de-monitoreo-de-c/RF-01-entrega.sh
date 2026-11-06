#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script de entrega: HU-09 / RF-01 (REQ-1791910396167)
# API de Cobertura de Flota por Empresa Conservadora
# ==============================================================================

echo "=== Verificación HU-09 / RF-01 — API de Cobertura de Flota ECA ==="

echo "1. Verificando compilación de tipos..."
npm run typecheck -w apps/api
echo "✓ Typecheck exitoso."

echo "2. Ejecutando tests automatizados (Jest)..."
npm test -w apps/api -- eca
echo "✓ Tests unitarios y e2e de ECA pasados con éxito."

echo "=== ¡Todas las verificaciones de HU-09 / RF-01 concluyeron en VERDE! ==="

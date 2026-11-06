#!/usr/bin/env bash
# HU-01 / RNF-02 (REQ-1794000103321) — Evitar que las pruebas de integración fallen en paralelo.
#
# Corre `npm run test:int` varias veces seguidas y compara las filas antes y después:
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RNF-02-entrega.sh
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RNF-02-entrega.sh --carga 20
#
# Requiere, desde la raíz del repo, `npm run db:up`. No hace falta `npm run dev`.
# No crea datos propios: las pruebas limpian lo que escriben, y eso es lo que se comprueba.

set -u

CORRIDAS=5
if [ "${1:-}" = "--carga" ]; then
  CORRIDAS="${2:-20}"
fi

filas() {
  docker exec mant-asc-db psql -U ascensores -d ascensores -t -A \
    -c "SELECT (SELECT count(*) FROM consorcios) || '/' || (SELECT count(*) FROM maquinas)"
}

ANTES="$(filas)" || { echo "❌ No se pudo leer la base: ¿corriste npm run db:up?"; exit 1; }
echo "== $CORRIDAS corridas de npm run test:int · filas consorcios/maquinas antes: $ANTES"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fallidas=0
: > "$TMP/tiempos"

for n in $(seq 1 "$CORRIDAS"); do
  inicio="$(date +%s%N)"
  if npm run test:int > "$TMP/salida.txt" 2>&1; then
    resultado="OK"
  else
    resultado="FALLÓ"
    fallidas=$((fallidas + 1))
  fi
  ms=$(( ($(date +%s%N) - inicio) / 1000000 ))
  echo "$ms" >> "$TMP/tiempos"
  echo "  corrida $n: $resultado · $(grep -E '^Tests:' "$TMP/salida.txt" | sed 's/  */ /g') · $ms ms"
done

DESPUES="$(filas)"
echo "  filas consorcios/maquinas después: $DESPUES"
sort -n "$TMP/tiempos" | awk -v n="$CORRIDAS" -v f="$fallidas" '
  { t[NR] = $1; s += $1 }
  END { printf "  corridas: %d · fallidas: %d · promedio: %.0f ms · más lenta: %.0f ms\n", n, f, s / NR, t[NR] }'

if [ "$fallidas" -ne 0 ]; then
  echo "❌ Hubo corridas con fallas"
  exit 1
fi
if [ "$ANTES" != "$DESPUES" ]; then
  echo "❌ Las filas cambiaron: $ANTES → $DESPUES"
  exit 1
fi
echo "✅ Todas en verde y la base quedó igual"

#!/usr/bin/env bash
# Corre la suite COMPLETA de la API con otros procesos usando CPU a pleno, para provocar las pruebas que se pasan del tope de 5 s de Jest
# cuando la máquina está ocupada (HU-01 RNF-03 y chat-hilo.e2e-spec). No modifica ningún archivo del repositorio.
#
#   bash docs/decisiones/2026-11-28-pruebas-intermitentes/estres-suite-api.sh
#   bash docs/decisiones/2026-11-28-pruebas-intermitentes/estres-suite-api.sh --procesos 8 --duracion 420 --workers 8
#
#   --procesos N   cuántos procesos extra usan CPU a pleno mientras corre la suite (por defecto 8: el número de núcleos de la PC de desarrollo)
#   --duracion S   cuántos segundos como máximo los mantiene (por defecto 420; la suite completa bajo esa carga tarda ~7 min)
#   --workers N    cuántos workers de Jest (por defecto 8)
#
# Deja la salida COMPLETA de Jest en un archivo (se imprime su ruta al final) y un resumen: qué pruebas fallaron y cuáles por «Exceeded
# timeout». Es justo la salida que HU-01 RNF-03 pide para encontrar la causa de una falla que no se reproduce.
set -u
PROCESOS=8; DURACION=420; WORKERS=8
while [ $# -gt 0 ]; do
  case "$1" in
    --procesos) PROCESOS="${2:-8}"; shift 2;;
    --duracion) DURACION="${2:-420}"; shift 2;;
    --workers) WORKERS="${2:-8}"; shift 2;;
    *) echo "Argumento desconocido: $1"; exit 2;;
  esac
done
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SALIDA="$(mktemp -d)/jest-bajo-carga.log"
echo "== Suite completa de la API con $PROCESOS procesos extra usando CPU y $WORKERS workers de Jest"
echo "   (puede tardar varios minutos; la salida completa queda en $SALIDA)"

PIDS=()
for _ in $(seq 1 "$PROCESOS"); do node -e "const t=Date.now();while(Date.now()-t<${DURACION}*1000){}" & PIDS+=("$!"); done
trap 'kill "${PIDS[@]}" 2>/dev/null' EXIT

inicio=$(date +%s)
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest --maxWorkers="$WORKERS" > "$SALIDA" 2>&1)
codigo=$?
kill "${PIDS[@]}" 2>/dev/null

echo "== Terminó en $(( $(date +%s) - inicio )) s con código $codigo"
grep -E "^Tests:|^Test Suites:" "$SALIDA"
echo "-- Suites que fallaron:"
grep -E "^FAIL " "$SALIDA" | sort -u | sed 's/^/   /' || true
echo "-- Pruebas que fallaron:"
grep -E "^  ● .* › " "$SALIDA" | sort -u | sed 's/^/   /' || true
echo "-- Por tope de tiempo («Exceeded timeout»): $(grep -c 'Exceeded timeout' "$SALIDA")"
echo "-- Las 8 suites más lentas:"
grep -E "^(PASS|FAIL) .*\([0-9.]+ s\)" "$SALIDA" | sed -E 's/^(PASS|FAIL) (\S+) \(([0-9.]+) s\)/\3 s  \1  \2/' | sort -n -r | head -8 | sed 's/^/   /'
echo "Salida completa: $SALIDA"
[ "$codigo" -eq 0 ]

#!/usr/bin/env bash
# HU-11 / RF-07 (REQ-1795091473089) — Corre, uno tras otro, los 12 scripts de entrega de HU-11, HU-15 y HU-18.
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-07-entrega.sh              # los 12 scripts y una tabla con el resultado de cada uno
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-07-entrega.sh --carga 20   # el modo --carga de los 3 scripts que lo tienen
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y docker.
# Los scripts de HU-11 RF-03, RF-05 y RF-06, los de HU-15 RF-02, RNF-01 y RNF-02 y los de HU-18 necesitan los datos de demostración
# (docs/pruebas/hu-04-.../RF-02-datos-demo.sh): si no están, este script los carga y los borra al terminar; si ya estaban, no los toca.
# Cada script usa su BASE_URL por defecto (unos la API directa y otros https://localhost:8050): no se define una para todos.

set -u

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRUEBAS="$(cd "$AQUI/.." && pwd)"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
SEMILLA="$(ls "$PRUEBAS"/hu-04-*/RF-02-datos-demo.sh)"
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1" 2>/dev/null | tr -d '\r'; }

SCRIPTS=(
  "hu-11-*/RF-03" "hu-11-*/RF-04" "hu-11-*/RF-05" "hu-11-*/RF-06"
  "hu-15-*/RF-01" "hu-15-*/RF-02" "hu-15-*/RNF-01" "hu-15-*/RNF-02" "hu-15-*/RNF-03"
  "hu-18-*/RF-01" "hu-18-*/RNF-01" "hu-18-*/RNF-02"
)
CON_CARGA=("hu-11-*/RF-03" "hu-15-*/RNF-01" "hu-15-*/RNF-02")

CARGA=0
if [ "${1:-}" = "--carga" ]; then CARGA="${2:-20}"; fi

TMP="$(mktemp -d)"
CARGUE_DEMO=0
limpiar() {
  if [ "$CARGUE_DEMO" -eq 1 ]; then bash "$SEMILLA" --limpiar >/dev/null 2>&1; echo "(se borraron los datos de demo que cargó este script)"; fi
  rm -rf "$TMP"
}
trap limpiar EXIT

if [ -z "$(sql 'select 1')" ]; then echo "No se pudo consultar la base: ¿está corriendo docker y 'npm run db:up'?"; exit 2; fi

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA corridas del modo --carga de cada script que lo tiene"
  FALLAS=0
  for patron in "${CON_CARGA[@]}"; do
    ruta="$(ls "$PRUEBAS"/$patron-entrega.sh)"
    nombre="$(basename "$(dirname "$ruta")" | cut -c1-5)/$(basename "$ruta" -entrega.sh)"
    echo "-- $nombre"
    bash "$ruta" --carga "$CARGA" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -1
    [ "${PIPESTATUS[0]}" -eq 0 ] || FALLAS=$((FALLAS + 1))
  done
  [ "$FALLAS" -eq 0 ]; exit
fi

if [ "$(sql "select count(*) from usuarios where usuario in ('demo.admin','demo.secretaria')")" != "2" ]; then
  echo "Faltan los datos de demo: se cargan ahora y se borran al terminar."
  # Si quedó uno solo de los dos usuarios de una carga a medias, se limpia antes de volver a cargar.
  bash "$SEMILLA" --limpiar >/dev/null 2>&1
  CARGUE_DEMO=1
  bash "$SEMILLA" > "$TMP/semilla.txt" 2>&1 || { cat "$TMP/semilla.txt"; echo "No se pudieron cargar los datos de demo."; exit 2; }
fi

echo "== HU-11, HU-15 y HU-18: 12 scripts de entrega, uno tras otro"
printf '%-24s %-4s %-5s %s\n' "script" "rc" "seg" "resultado"
TOTAL=0; PASAN=0
for patron in "${SCRIPTS[@]}"; do
  ruta="$(ls "$PRUEBAS"/$patron-entrega.sh)"
  nombre="$(basename "$(dirname "$ruta")" | cut -c1-5)/$(basename "$ruta" -entrega.sh)"
  inicio="$(date +%s)"
  timeout 170 bash "$ruta" > "$TMP/salida.txt" 2>&1; rc=$?
  fin="$(date +%s)"
  resultado="$(sed 's/\x1b\[[0-9;]*m//g' "$TMP/salida.txt" | grep -iE 'resultado' | tail -1 | sed 's/^[= ]*//' | cut -c1-70)"
  TOTAL=$((TOTAL + 1)); [ "$rc" -eq 0 ] && PASAN=$((PASAN + 1))
  printf '%-24s %-4s %-5s %s\n' "$nombre" "$rc" "$((fin - inicio))" "$resultado"
  if [ "$rc" -ne 0 ]; then sed 's/\x1b\[[0-9;]*m//g' "$TMP/salida.txt" | grep -E '❌' | head -5 | sed 's/^/     /'; fi
done

echo
echo "== Resultado: $PASAN de $TOTAL scripts con código 0"
[ "$PASAN" -eq "$TOTAL" ]

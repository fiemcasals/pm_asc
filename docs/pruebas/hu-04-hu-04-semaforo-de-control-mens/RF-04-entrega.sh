#!/usr/bin/env bash
# HU-04 / RF-04 (REQ-1795095941025) — [FIX] Script de entrega de HU-04 RF-02: la inspección de prueba la carga un RT.
#
#   bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-04-entrega.sh              # RF-02-entrega.sh contra https://localhost:8050 y contra http://127.0.0.1:3050
#   bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-04-entrega.sh --carga 20   # el modo --carga de RF-02-entrega.sh contra las dos direcciones
#
# Requiere `npm run db:up`, `npm run dev` (la web en https://localhost:8050 y la API en http://127.0.0.1:3050) y docker.
# Al terminar revisa que no hayan quedado usuarios RF02-ent-*, edificios de prueba ni intentos de login de prueba en la base.

set -u

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$AQUI/RF-02-entrega.sh"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
URLS=("https://localhost:8050" "http://127.0.0.1:3050")
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1" 2>/dev/null | tr -d '\r'; }

if [ -z "$(sql 'select 1')" ]; then echo "No se pudo consultar la base: ¿está corriendo docker y 'npm run db:up'?"; exit 2; fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
CARGA=0
if [ "${1:-}" = "--carga" ]; then CARGA="${2:-20}"; fi

FALLAS=0
for url in "${URLS[@]}"; do
  echo "== RF-02-entrega.sh contra $url$([ "$CARGA" -gt 0 ] && echo " (--carga $CARGA)")"
  if [ "$CARGA" -gt 0 ]; then BASE_URL="$url" bash "$SCRIPT" --carga "$CARGA" > "$TMP/salida.txt" 2>&1; else BASE_URL="$url" bash "$SCRIPT" > "$TMP/salida.txt" 2>&1; fi
  rc=$?
  sed 's/\x1b\[[0-9;]*m//g' "$TMP/salida.txt" | grep -E 'Resultado|consultas:|❌' | sed 's/^/   /'
  if [ "$CARGA" -gt 0 ]; then
    grep -q 'fallidas: 0 ' "$TMP/salida.txt" && [ "$rc" -eq 0 ] && echo "   ✅ código 0" || { echo "   ❌ código $rc"; FALLAS=$((FALLAS + 1)); }
  else
    grep -q '14 verificaciones OK, 0 fallidas' "$TMP/salida.txt" && [ "$rc" -eq 0 ] && echo "   ✅ 14 verificaciones OK, 0 fallidas · código 0" || { echo "   ❌ código $rc"; FALLAS=$((FALLAS + 1)); }
  fi
done

echo "== Residuos en la base después de correr"
usuarios="$(sql "select count(*) from usuarios where usuario like 'RF02-ent-%'")"
edificios="$(sql "select count(*) from consorcios where nombre like 'RF02-ent-%'")"
intentos="$(sql "select count(*) from intentos_login where usuario like 'RF02-ent-%'")"
if [ "$usuarios" = "0" ] && [ "$edificios" = "0" ] && [ "$intentos" = "0" ]; then
  echo "   ✅ 0 usuarios RF02-ent-*, 0 edificios de prueba y 0 filas de RF02-ent-* en intentos_login"
else
  echo "   ❌ quedaron: usuarios=$usuarios edificios=$edificios intentos_login=$intentos"; FALLAS=$((FALLAS + 1))
fi

echo
echo "== Resultado: $([ "$FALLAS" -eq 0 ] && echo "todo en verde" || echo "$FALLAS con error")"
[ "$FALLAS" -eq 0 ]

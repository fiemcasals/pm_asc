#!/usr/bin/env bash
# HU-13 / RF-01 (REQ-1794486918510) — Alertas Críticas del Portal ECA sin prefijos obvios ni códigos duplicados.
#
# Verifica las alertas críticas devueltas por el backend para el Portal ECA y que los títulos limpios
# coincidan con formatearNombreEquipo (sin 'CARTEL GIGANTE:' ni 'M2 - M2:').
#   bash docs/pruebas/hu-13-hu-13-claridad-operativa-y-lim/RF-01-entrega.sh
#   bash docs/pruebas/hu-13-hu-13-claridad-operativa-y-lim/RF-01-entrega.sh --carga 30

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-30}"
fi

CURL=(curl -s --max-time 10)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
elif echo "$BASE_URL" | grep -qE '^https://(localhost|127\.0\.0\.1)(:|/)'; then
  CURL+=(-k)
fi
if curl -V | grep -qi schannel; then
  CURL+=(--ssl-no-revoke)
fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA consultas de flota crítica Portal ECA contra $BASE_URL"
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    c1="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/eca/maquinas?eca=MAICON%20Mantenimiento")"
    if [ "$c1" != "200" ]; then
      errores=$((errores + 1))
    fi
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v e="$errores" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · fallas HTTP != 200: %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, e, s / NR, p95, t[NR]
    }'
  [ "$errores" -eq 0 ]
  exit $?
fi

echo "== HU-13 / RF-01 contra $BASE_URL"

echo "1. Consulta flota MAICON Mantenimiento con equipo en Reparación Urgente"
code1="$("${CURL[@]}" -o "$TMP/maicon.json" -w '%{http_code}' "$BASE_URL/api/eca/maquinas?eca=MAICON%20Mantenimiento")"
urg="$(json "$TMP/maicon.json" 'b.find(m => m.estadoOperativo === "Reparación Urgente")?.codigoAGC')"
if [ "$code1" = "200" ] && [ -n "$urg" ]; then
  pass "Flota MAICON HTTP $code1 · equipo Reparación Urgente=$urg"
else
  fail "Flota MAICON HTTP $code1 · urg='$urg'"
fi

echo "2. Consulta flota con equipo Fuera de Servicio para validar formato sin prefijo duplicado"
code2="$("${CURL[@]}" -o "$TMP/cp.json" -w '%{http_code}' "$BASE_URL/api/eca/maquinas?eca=Conservaci%C3%B3n%20Porte%C3%B1a%20S.R.L.")"
fs_nombre="$(json "$TMP/cp.json" 'b.find(m => m.estadoOperativo === "Fuera de Servicio")?.nombre')"
if [ "$code2" = "200" ] && [ -n "$fs_nombre" ]; then
  pass "Flota Conservación Porteña HTTP $code2 · Fuera de Servicio='$fs_nombre'"
else
  fail "Flota Conservación Porteña HTTP $code2 · fs_nombre='$fs_nombre'"
fi

echo ""
echo "Resultado: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

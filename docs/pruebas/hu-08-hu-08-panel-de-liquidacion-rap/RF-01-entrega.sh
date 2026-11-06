#!/usr/bin/env bash
# HU-08 / RF-01 (REQ-1791910395959) — API de Máquinas Asignadas y Autorización de Firma AGC.
#
# Recorre las condiciones de aprobación contra el entorno levantado:
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-01-entrega.sh
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-01-entrega.sh --carga 100
#
# Requiere, desde la raíz del repo: la API corriendo en :8050 (a través de la web) o :3050 directamente.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
API_URL="${API_URL:-$BASE_URL/api}"
USUARIO_FIRMANTE="${USUARIO_FIRMANTE:-gonza}"

CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-100}"
fi

# TLS: confiar en mkcert si está disponible
CURL=(curl -s --max-time 10)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
fi
if curl -V | grep -qi schannel; then
  CURL+=(--ssl-no-revoke)
fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

TMP="$(mktemp -d)"
limpiar() {
  rm -rf "$TMP"
}
trap limpiar EXIT

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA corridas de GET $API_URL/firmante/maquinas como $USUARIO_FIRMANTE"
  fallidas=0
  : > "$TMP/tiempos"
  for _ in $(seq 1 "$CARGA"); do
    out="$("${CURL[@]}" -o /dev/null -w '%{http_code} %{time_total}' -H "x-user-name: $USUARIO_FIRMANTE" "$API_URL/firmante/maquinas")"
    code="${out%% *}"
    echo "${out##* }" >> "$TMP/tiempos"
    [ "$code" = "200" ] || fallidas=$((fallidas + 1))
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v f="$fallidas" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · fallidas: %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, f, s / NR * 1000, p95 * 1000, t[NR] * 1000
    }'
  [ "$fallidas" -eq 0 ]
  exit $?
fi

echo "== Verificación de HU-08 / RF-01 contra $API_URL =="

# 1. GET /api/firmante/maquinas responde 200 con la lista de máquinas del mes asignadas
code="$("${CURL[@]}" -o "$TMP/maquinas.json" -w '%{http_code}' -H "x-user-name: $USUARIO_FIRMANTE" "$API_URL/firmante/maquinas")"
if [ "$code" = "200" ] && grep -q "MAQ-CORRIENTES-M1" "$TMP/maquinas.json" && grep -q "Recorrida" "$TMP/maquinas.json"; then
  pass "1. GET /api/firmante/maquinas responde 200 y devuelve la lista de máquinas asignadas al firmante"
else
  fail "1. GET /api/firmante/maquinas falló (código: $code)"
fi

# 2. POST /api/firmante/autorizar sin parámetros responde 400
code="$("${CURL[@]}" -o "$TMP/err1.json" -w '%{http_code}' -X POST -H "Content-Type: application/json" -d '{}' "$API_URL/firmante/autorizar")"
if [ "$code" = "400" ]; then
  pass "2. POST /api/firmante/autorizar sin body responde 400 (parámetro requerido)"
else
  fail "2. Se esperaba 400 pero devolvió $code"
fi

# 3. POST /api/firmante/autorizar con máquina inexistente responde 404
code="$("${CURL[@]}" -o "$TMP/err2.json" -w '%{http_code}' -X POST -H "Content-Type: application/json" -d '{"maquinaId":"MAQ-INEXISTENTE"}' "$API_URL/firmante/autorizar")"
if [ "$code" = "404" ]; then
  pass "3. POST /api/firmante/autorizar con máquina inexistente responde 404"
else
  fail "3. Se esperaba 404 pero devolvió $code"
fi

# 4. POST /api/firmante/autorizar en máquina 'Pendiente de Visita' responde 400
code="$("${CURL[@]}" -o "$TMP/err3.json" -w '%{http_code}' -X POST -H "Content-Type: application/json" -d '{"maquinaId":"MAQ-CORRIENTES-M2"}' "$API_URL/firmante/autorizar")"
if [ "$code" = "400" ] && grep -qi "Recorrida" "$TMP/err3.json"; then
  pass "4. Validación de estado: rechaza autorizar máquina en estado 'Pendiente de Visita' (400)"
else
  fail "4. Validación de estado 'Pendiente de Visita' falló (código: $code)"
fi

# 5. POST /api/firmante/autorizar en máquina con 'Advertencia' responde 400
code="$("${CURL[@]}" -o "$TMP/err4.json" -w '%{http_code}' -X POST -H "Content-Type: application/json" -d '{"maquinaId":"MAQ-CALLAO-M1"}' "$API_URL/firmante/autorizar")"
if [ "$code" = "400" ] && grep -qi "Recorrida" "$TMP/err4.json"; then
  pass "5. Validación de estado: rechaza autorizar máquina con 'Advertencia' (400)"
else
  fail "5. Validación de advertencia falló (código: $code)"
fi

# 6. POST /api/firmante/autorizar rechaza si faltan fotos obligatorias (cables)
code="$("${CURL[@]}" -o "$TMP/err5.json" -w '%{http_code}' -X POST -H "Content-Type: application/json" -d '{"maquinaId":"MAQ-SANTAFE-M2"}' "$API_URL/firmante/autorizar")"
if [ "$code" = "400" ] && grep -qi "fotos obligatorias" "$TMP/err5.json"; then
  pass "6. Validación de fotos obligatorias: rechaza si faltan fotos de cables o frente (400)"
else
  fail "6. Validación de fotos obligatorias falló (código: $code)"
fi

# 7. POST /api/firmante/autorizar rechaza si falta la firma del encargado
code="$("${CURL[@]}" -o "$TMP/err6.json" -w '%{http_code}' -X POST -H "Content-Type: application/json" -d '{"maquinaId":"MAQ-SANTAFE-M1"}' "$API_URL/firmante/autorizar")"
if [ "$code" = "400" ] && grep -qi "firma del encargado" "$TMP/err6.json"; then
  pass "7. Validación de firma: rechaza si falta la firma del encargado (400)"
else
  fail "7. Validación de firma del encargado falló (código: $code)"
fi

# 8. POST /api/firmante/autorizar aprueba exitosamente máquina recorrida con fotos y firma
code="$("${CURL[@]}" -o "$TMP/ok.json" -w '%{http_code}' -X POST -H "Content-Type: application/json" -H "x-user-name: $USUARIO_FIRMANTE" -d '{"maquinaId":"MAQ-CORRIENTES-M1"}' "$API_URL/firmante/autorizar")"
if [ "$code" = "200" ] && grep -q '"ok":true' "$TMP/ok.json" && grep -q "protocoloAGC" "$TMP/ok.json"; then
  pass "8. Autorización válida: registra fecha, firmante y emite protocolo AGC (200)"
else
  fail "8. Autorización válida falló (código: $code)"
fi

# 9. GET /api/firmante/maquinas refleja la máquina autorizada
code="$("${CURL[@]}" -o "$TMP/verif.json" -w '%{http_code}' -H "x-user-name: $USUARIO_FIRMANTE" "$API_URL/firmante/maquinas")"
if [ "$code" = "200" ] && grep -q '"autorizada":true' "$TMP/verif.json"; then
  pass "9. Trazabilidad: la máquina ahora figura con estado autorizada en el listado"
else
  fail "9. La máquina no se reflejó como autorizada en el listado"
fi

echo ""
echo "Resultado: $OK verificaciones exitosas, $FALLAS fallidas."
[ "$FALLAS" -eq 0 ]

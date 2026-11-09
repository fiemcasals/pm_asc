#!/usr/bin/env bash
# HU-06 / RF-01 (REQ-1791910396411) — Recepción de Falla Crítica y Alerta Emergente en Secretaría.
#
# Recorre el flujo de la API contra el entorno levantado:
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-01-entrega.sh
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-01-entrega.sh --carga 200
#
# Requiere, desde la raíz del repo, `npm run dev` corriendo (o sólo la API:
# BASE_URL=http://127.0.0.1:3050). La base de datos NO hace falta para esta tarjeta.
#
# Condición 1 (evento en tiempo real): abre el canal SSE, carga un informe con falla crítica y
# comprueba que el evento llega por el canal, midiendo cuánto tarda.
# Condición 2 (notificación con sonido): es visual y se prueba en el navegador (guía
# RF-01-recepcion-de-falla-critica.md). Acá sólo se comprueba que el enlace del evento abre el
# informe.
#
# Datos que deja: informes en memoria de la API con inspector "RF01-entrega-<pid>". No hay
# endpoint para borrarlos: desaparecen al reiniciar la API. No toca la base.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
MAQUINA="MAQ-CALLAO-M1"
INSPECTOR="RF01-entrega-$$"

CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-100}"
fi

# --- TLS: confiar en el CA local de mkcert (y en Windows/Schannel, no consultar revocación)
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
SSE_PID=""
limpiar() {
  [ -n "$SSE_PID" ] && kill "$SSE_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap limpiar EXIT

ahora_ms() { node -e 'process.stdout.write(String(Date.now()))'; }

alta() { # $1 = cablesDesgastados, $2 = limitadorAnulado
  "${CURL[@]}" -o "$TMP/alta.json" -w '%{http_code}' -X POST "$BASE_URL/api/fallas-criticas/informes" \
    -H 'Content-Type: application/json' \
    -d "{\"maquinaId\":\"$MAQUINA\",\"inspector\":\"$INSPECTOR\",\"cablesDesgastados\":$1,\"limitadorAnulado\":$2,\"observaciones\":\"Prueba de entrega RF-01\"}"
}
campo() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));process.stdout.write(String(process.argv[2].split(".").reduce((o,k)=>o?.[k],j)))' "$1" "$2"; }

echo "HU-06 / RF-01 contra $BASE_URL"

# --- Condición 1: el servidor emite el evento en tiempo real
echo "Condición 1 — evento en tiempo real"
# El canal queda abierto todo el script (sin --max-time): lo cierra limpiar() al salir.
SSE_CURL=(curl -s -N)
for opt in "${CURL[@]:4}"; do SSE_CURL+=("$opt"); done   # sólo las opciones de TLS
"${SSE_CURL[@]}" -H 'Accept: text/event-stream' \
  "$BASE_URL/api/fallas-criticas/eventos" > "$TMP/sse.txt" &
SSE_PID=$!
sleep 1

INICIO=$(ahora_ms)
CODIGO=$(alta true false)
[ "$CODIGO" = "201" ] && pass "POST informe con cables desgastados → 201" || fail "POST informe → $CODIGO (esperado 201)"
INFORME_ID=$(campo "$TMP/alta.json" informe.id)
ENLACE=$(campo "$TMP/alta.json" informe.enlaceInforme)
[ "$(campo "$TMP/alta.json" eventoEmitido)" = "true" ] && pass "eventoEmitido = true" || fail "eventoEmitido no es true"

LLEGO=0
for _ in $(seq 1 30); do
  if grep -q "$INFORME_ID" "$TMP/sse.txt" 2>/dev/null; then LLEGO=1; break; fi
  sleep 0.1
done
DEMORA=$(( $(ahora_ms) - INICIO ))
if [ "$LLEGO" -eq 1 ]; then
  pass "el evento falla-critica de $INFORME_ID llegó por el canal SSE (≤ ${DEMORA} ms desde el POST, cota que incluye arrancar node para medir)"
  grep -q '^event: falla-critica' "$TMP/sse.txt" && pass "tipo de evento: falla-critica" || fail "el evento no tiene tipo falla-critica"
else
  fail "el evento no llegó por el canal SSE en 3 s"
fi

CODIGO=$(alta false false)
[ "$CODIGO" = "201" ] && [ "$(campo "$TMP/alta.json" eventoEmitido)" = "false" ] \
  && pass "informe sin falla crítica → 201 sin evento" || fail "informe sin falla crítica → $CODIGO"

# --- Condición 2 (parte API): el enlace del evento abre el informe
echo "Condición 2 — enlace directo al informe (la notificación se prueba en el navegador)"
CODIGO=$("${CURL[@]}" -o "$TMP/informe.html" -w '%{http_code}' "$BASE_URL$ENLACE")
[ "$CODIGO" = "200" ] && grep -q 'Informe de falla crítica' "$TMP/informe.html" \
  && pass "GET $ENLACE → 200 con el informe" || fail "GET $ENLACE → $CODIGO"

# --- Validaciones
echo "Validaciones"
CODIGO=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/fallas-criticas/informes" -H 'Content-Type: application/json' -d '{}')
[ "$CODIGO" = "400" ] && pass "cuerpo vacío → 400" || fail "cuerpo vacío → $CODIGO"
CODIGO=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/fallas-criticas/informes" -H 'Content-Type: application/json' \
  -d "{\"maquinaId\":\"MAQ-NO-EXISTE\",\"inspector\":\"$INSPECTOR\",\"cablesDesgastados\":true,\"limitadorAnulado\":false}")
[ "$CODIGO" = "404" ] && pass "máquina inexistente → 404" || fail "máquina inexistente → $CODIGO"
CODIGO=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/fallas-criticas/informes/INF-no-existe")
[ "$CODIGO" = "404" ] && pass "informe inexistente → 404" || fail "informe inexistente → $CODIGO"

# --- Carga: N altas con falla crítica, todas tienen que llegar por el canal
if [ "$CARGA" -gt 0 ]; then
  echo "Carga — $CARGA informes con falla crítica"
  : > "$TMP/ids.txt"
  MAX=0
  ERRORES=0
  INICIO_CARGA=$(ahora_ms)
  for _ in $(seq 1 "$CARGA"); do
    T0=$(ahora_ms)
    CODIGO=$(alta false true)
    T=$(( $(ahora_ms) - T0 ))
    [ "$T" -gt "$MAX" ] && MAX=$T
    if [ "$CODIGO" = "201" ]; then campo "$TMP/alta.json" informe.id >> "$TMP/ids.txt"; echo >> "$TMP/ids.txt"; else ERRORES=$((ERRORES + 1)); fi
  done
  sleep 1
  PERDIDOS=0
  while read -r id; do
    [ -z "$id" ] && continue
    grep -q "$id" "$TMP/sse.txt" || PERDIDOS=$((PERDIDOS + 1))
  done < "$TMP/ids.txt"
  TOTAL=$(( $(ahora_ms) - INICIO_CARGA ))
  echo "  corridas: $CARGA · fallidas: $ERRORES · eventos perdidos: $PERDIDOS · POST más lento: ${MAX} ms · total: ${TOTAL} ms"
  [ "$ERRORES" -eq 0 ] && [ "$PERDIDOS" -eq 0 ] && pass "carga sin errores ni eventos perdidos" || fail "carga con $ERRORES errores y $PERDIDOS eventos perdidos"
fi

echo
echo "Resultado: $OK OK, $FALLAS con falla"
[ "$FALLAS" -eq 0 ]

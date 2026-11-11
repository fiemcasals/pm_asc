#!/usr/bin/env bash
# HU-11 / RF-03 (REQ-1794155773535) — No informar como entregado un WhatsApp que no se envió.
#
# Recorre los criterios 1 y 3 contra la API levantada sin proveedor de WhatsApp configurado:
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-03-entrega.sh
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-03-entrega.sh --carga 50
#
# Requiere, desde la raíz del repo: `npm run dev` corriendo (o BASE_URL=http://127.0.0.1:3050).
# Nota: el criterio 2 (botón "Despachar Alerta WhatsApp" en Portal ECA) es visual y se valida en
# el navegador o mirando RF-03-portal-eca-no-configurado.png.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-50}"
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
trap 'rm -rf "$TMP"' EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }

PAYLOAD='{"telefonoDestino":"+5491155667788","nombreEca":"MAICON Mantenimiento","consorcio":"Consorcio Corrientes 1234","equipo":"M1: Ascensor Principal","estado":"Reparación Urgente","detalle":"Freno electromagnético con deslizamiento"}'

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA intentos sin proveedor contra $BASE_URL"
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    code="$("${CURL[@]}" -o "$TMP/c.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d "$PAYLOAD" "$BASE_URL/api/whatsapp/enviar-alerta")"
    estado="$(json "$TMP/c.json" 'b.estadoEntrega')"
    if [ "$code" != "503" ] || [ "$estado" = "entregado" ]; then
      errores=$((errores + 1))
    fi
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v e="$errores" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · falsos entregados / distinto de 503: %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, e, s / NR, p95, t[NR]
    }'
  [ "$errores" -eq 0 ]
  exit $?
fi

echo "== HU-11 / RF-03 contra $BASE_URL"

echo "1. Envío manual sin proveedor → HTTP 503, informa motivo y no devuelve 'entregado'"
code1="$("${CURL[@]}" -o "$TMP/env.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "$PAYLOAD" "$BASE_URL/api/whatsapp/enviar-alerta")"
ok1="$(json "$TMP/env.json" 'b.ok')"
estado1="$(json "$TMP/env.json" 'b.estadoEntrega')"
msg1="$(json "$TMP/env.json" 'b.message')"
if [ "$code1" = "503" ] && [ "$ok1" = "false" ] && [ "$estado1" = "no_configurado" ] && echo "$msg1" | grep -qi 'no est.*configurado'; then
  pass "HTTP $code1 · ok: $ok1 · estadoEntrega: $estado1 · \"$msg1\""
else
  fail "HTTP $code1 · ok='$ok1' · estadoEntrega='$estado1' · message='$msg1'"
fi

echo "3. Disparo automático ante alerta crítica registra envío como no realizado cuando falta proveedor"
ALERTA="ALT-MAICON-001"
code3="$("${CURL[@]}" -o "$TMP/trig.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"alertaId\":\"$ALERTA\",\"telefonoDestino\":\"+5491199887766\"}" \
  "$BASE_URL/api/whatsapp/trigger-alerta-critica")"
ok3="$(json "$TMP/trig.json" 'b.ok')"
realizado3="$(json "$TMP/trig.json" 'b.envioRealizado')"
estado3="$(json "$TMP/trig.json" 'b.estado')"
entrega3="$(json "$TMP/trig.json" 'b.estadoEntrega')"
if [ "$code3" = "201" ] && [ "$ok3" = "false" ] && [ "$realizado3" = "false" ] && [ "$estado3" = "no_realizado" ] && [ "$entrega3" = "no_configurado" ]; then
  pass "Trigger HTTP $code3 · ok: $ok3 · envioRealizado: $realizado3 · estado: $estado3 · estadoEntrega: $entrega3"
else
  fail "Trigger HTTP $code3 · ok='$ok3' · envioRealizado='$realizado3' · estado='$estado3' · estadoEntrega='$entrega3'"
fi

echo "   Verificando registro en GET /api/whatsapp/historial?alertaId=$ALERTA"
codeh="$("${CURL[@]}" -o "$TMP/hist.json" -w '%{http_code}' "$BASE_URL/api/whatsapp/historial?alertaId=$ALERTA")"
ultEstado="$(json "$TMP/hist.json" 'b.registros[b.registros.length-1].estado')"
ultOrigen="$(json "$TMP/hist.json" 'b.registros[b.registros.length-1].origen')"
if [ "$codeh" = "200" ] && [ "$ultEstado" = "no_realizado" ] && [ "$ultOrigen" = "automatico" ]; then
  pass "Historial HTTP $codeh · último registro: origen=$ultOrigen estado=$ultEstado"
else
  fail "Historial HTTP $codeh · origen='$ultOrigen' estado='$ultEstado'"
fi

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

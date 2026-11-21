#!/usr/bin/env bash
# HU-11 / RF-08 — El aviso de falla crítica sale como plantilla de WhatsApp aprobada, nunca como texto libre.
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-08-entrega.sh
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-08-entrega.sh --carga 25
#
# Levanta un receptor HTTP local que hace de Meta y de Twilio y guarda el cuerpo exacto que recibe, y tres
# instancias temporales de la API compiladas (Meta con plantilla, Twilio con plantilla y Meta sin plantilla),
# con las credenciales sólo por variables de entorno. Necesita `npm run db:up`. Limpia todo al terminar.

set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then
  CARGA="$2"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOCK_PORT="${MOCK_PORT:-3075}"
PUERTO_META="${PUERTO_META:-3076}"
PUERTO_TWILIO="${PUERTO_TWILIO:-3077}"
PUERTO_SIN="${PUERTO_SIN:-3078}"
TMP="$(mktemp -d)"
OK=0; KO=0
PIDS=()

pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }

limpiar() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" >/dev/null 2>&1 || true; done
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-11 / RF-08 (aviso como plantilla aprobada) contra la API compilada"

# 1. Receptor que hace de Meta y de Twilio: guarda cada pedido tal cual llegó (una línea JSON por pedido).
cat > "$TMP/mock.js" <<'JS'
const http = require('node:http');
const fs = require('node:fs');
const [port, log] = [Number(process.argv[2]), process.argv[3]];
http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    fs.appendFileSync(log, JSON.stringify({ url: req.url, body: Buffer.concat(chunks).toString('utf8') }) + '\n');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: [{ id: 'wamid.RF08.' + Date.now() }], sid: 'SMRF08' + Date.now() }));
  });
}).listen(port, '127.0.0.1');
JS
node "$TMP/mock.js" "$MOCK_PORT" "$TMP/pedidos.log" &
PIDS+=($!)
: > "$TMP/pedidos.log"

# 2. Compilar siempre: este script prueba el código de esta rama, no un dist viejo.
(cd "$REPO_ROOT" && npm run build --workspace=@mant-asc/api >/dev/null) || { echo "No compiló la API"; exit 1; }

levantar_api() { # levantar_api <puerto> VAR=valor ...
  local puerto="$1"; shift
  env API_PORT="$puerto" "$@" node "$REPO_ROOT/apps/api/dist/main.js" > "$TMP/api-$puerto.log" 2>&1 &
  PIDS+=($!)
  for _ in $(seq 1 40); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$puerto/api/health")" = "200" ] && return 0
    sleep 0.5
  done
  echo "La API del puerto $puerto no levantó:"; tail -5 "$TMP/api-$puerto.log"; return 1
}

URL_MOCK="http://127.0.0.1:${MOCK_PORT}"
levantar_api "$PUERTO_META" WHATSAPP_PROVIDER=meta WHATSAPP_META_ACCESS_TOKEN=token-rf08 \
  WHATSAPP_META_PHONE_NUMBER_ID=9988776655 WHATSAPP_META_BASE_URL="$URL_MOCK" \
  WHATSAPP_META_TEMPLATE_NAME=alerta_falla_critica || exit 1
levantar_api "$PUERTO_TWILIO" WHATSAPP_PROVIDER=twilio WHATSAPP_TWILIO_ACCOUNT_SID=ACrf08 \
  WHATSAPP_TWILIO_AUTH_TOKEN=token-rf08 WHATSAPP_TWILIO_FROM=whatsapp:+14155238886 \
  WHATSAPP_TWILIO_BASE_URL="$URL_MOCK" WHATSAPP_TWILIO_CONTENT_SID=HXrf08plantilla || exit 1
levantar_api "$PUERTO_SIN" WHATSAPP_PROVIDER=meta WHATSAPP_META_ACCESS_TOKEN=token-rf08 \
  WHATSAPP_META_PHONE_NUMBER_ID=9988776655 WHATSAPP_META_BASE_URL="$URL_MOCK" || exit 1

cat > "$TMP/aviso.json" <<'JSON'
{
  "telefonoDestino": "+54 9 11 6666-7777",
  "nombreEca": "MAICON Mantenimiento",
  "consorcio": "Av. Corrientes 1234",
  "equipo": "M1 - Principal",
  "estado": "Fuera de Servicio",
  "detalle": "Cabina trabada en piso 3",
  "remitoUrl": "https://app.maicon.example/informe/abc123"
}
JSON
enviar() { curl -s -o "$TMP/res.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$1" "http://127.0.0.1:$2/api/whatsapp/enviar-alerta"; }

echo "1. Meta: sale type \"template\" con nombre, idioma y los 5 parámetros en orden (Criterio 1)"
: > "$TMP/pedidos.log"
CODE="$(enviar "$TMP/aviso.json" "$PUERTO_META")"
tail -n 1 "$TMP/pedidos.log" > "$TMP/ultimo.json"
node -e 'const l=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));require("fs").writeFileSync(process.argv[2],l.body)' "$TMP/ultimo.json" "$TMP/meta-body.json"
if [ "$CODE" = "201" ] && [ "$(json "$TMP/meta-body.json" 'b.type+"|"+b.template.name+"|"+b.template.language.code')" = "template|alerta_falla_critica|es_AR" ] \
   && [ "$(json "$TMP/meta-body.json" 'b.template.components[0].parameters.map(p=>p.text).join(" ¦ ")')" = "Av. Corrientes 1234 ¦ M1 - Principal ¦ Fuera de Servicio ¦ Cabina trabada en piso 3 ¦ https://app.maicon.example/informe/abc123" ]; then
  pass "HTTP 201 y el cuerpo que recibió Meta es una plantilla con los 5 parámetros en orden"
else
  fail "Meta → $CODE $(cat "$TMP/meta-body.json")"
fi
if [ "$(json "$TMP/meta-body.json" '"text" in b || JSON.stringify(b).includes("preview_url")')" = "false" ]; then
  pass "el cuerpo no tiene ningún campo de texto libre"
else
  fail "el cuerpo de Meta trae texto libre: $(cat "$TMP/meta-body.json")"
fi

echo "2. Twilio: sale ContentSid y ContentVariables, sin Body (Criterio 2)"
: > "$TMP/pedidos.log"
CODE="$(enviar "$TMP/aviso.json" "$PUERTO_TWILIO")"
tail -n 1 "$TMP/pedidos.log" > "$TMP/ultimo.json"
node -e 'const l=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const f=new URLSearchParams(l.body);require("fs").writeFileSync(process.argv[2],JSON.stringify({sid:f.get("ContentSid"),vars:JSON.parse(f.get("ContentVariables")),body:f.has("Body")}))' "$TMP/ultimo.json" "$TMP/twilio.json"
if [ "$CODE" = "201" ] && [ "$(json "$TMP/twilio.json" 'b.sid+"|"+b.body+"|"+Object.values(b.vars).join(" ¦ ")')" = "HXrf08plantilla|false|Av. Corrientes 1234 ¦ M1 - Principal ¦ Fuera de Servicio ¦ Cabina trabada en piso 3 ¦ https://app.maicon.example/informe/abc123" ]; then
  pass "HTTP 201: Twilio recibió el ContentSid y las 5 variables, y ningún Body de texto libre"
else
  fail "Twilio → $CODE $(cat "$TMP/twilio.json")"
fi

echo "3. Sin plantilla configurada no sale ningún mensaje (Criterio 3)"
: > "$TMP/pedidos.log"
CODE="$(enviar "$TMP/aviso.json" "$PUERTO_SIN")"
if [ "$CODE" = "503" ] && [ "$(json "$TMP/res.json" 'b.estadoEntrega+"|"+b.error.includes("plantilla")')" = "no_configurado|true" ] && [ ! -s "$TMP/pedidos.log" ]; then
  pass "HTTP 503 no_configurado, el motivo nombra la plantilla y el proveedor no recibió nada"
else
  fail "sin plantilla → $CODE $(cat "$TMP/res.json") pedidos=$(wc -l < "$TMP/pedidos.log")"
fi

echo "4. Un detalle de varias líneas llega limpio (Criterio 4)"
printf '%s' '{"telefonoDestino":"+5491166667777","nombreEca":"MAICON","consorcio":"Av. Callao 800","equipo":"M2","estado":"Reparación Urgente","detalle":"Freno descalibrado.\n\nPuerta abierta\ten piso 2.\r\n        Llamar al encargado."}' > "$TMP/multi.json"
: > "$TMP/pedidos.log"
CODE="$(enviar "$TMP/multi.json" "$PUERTO_META")"
tail -n 1 "$TMP/pedidos.log" > "$TMP/ultimo.json"
node -e 'const l=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));require("fs").writeFileSync(process.argv[2],l.body)' "$TMP/ultimo.json" "$TMP/meta-body.json"
if [ "$CODE" = "201" ] && [ "$(json "$TMP/meta-body.json" 'b.template.components[0].parameters[3].text')" = "Freno descalibrado. Puerta abierta en piso 2. Llamar al encargado." ]; then
  pass "sin saltos de línea, tabulaciones ni tandas de espacios: «Freno descalibrado. Puerta abierta en piso 2. Llamar al encargado.»"
else
  fail "detalle de varias líneas → $CODE $(cat "$TMP/meta-body.json")"
fi

if [ "$CARGA" -gt 0 ]; then
  echo
  echo "== Prueba de carga: $CARGA envíos consecutivos por plantilla (Meta)"
  FALLOS=0; MAX_MS=0; TOTAL_MS=0
  for _ in $(seq 1 "$CARGA"); do
    T0="$(node -e 'console.log(Date.now())')"
    C="$(enviar "$TMP/aviso.json" "$PUERTO_META")"
    DT=$(( $(node -e 'console.log(Date.now())') - T0 ))
    TOTAL_MS=$((TOTAL_MS + DT)); [ "$DT" -gt "$MAX_MS" ] && MAX_MS="$DT"
    [ "$C" != "201" ] && FALLOS=$((FALLOS + 1))
  done
  echo "  Corridas: $CARGA | Fallos: $FALLOS | Promedio: $((TOTAL_MS / CARGA)) ms | Más lenta: ${MAX_MS} ms"
  [ "$FALLOS" = "0" ] && pass "carga: $CARGA envíos, 0 fallos" || fail "carga con $FALLOS fallos"
fi

echo
echo "Resultado: $OK ok, $KO con error"
[ "$KO" -eq 0 ]

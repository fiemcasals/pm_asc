#!/usr/bin/env bash
# HU-11 / RF-09 — Confirmar la entrega real de cada WhatsApp con los avisos del proveedor (Meta y Twilio).
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-09-entrega.sh
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-09-entrega.sh --carga 100
#
# Levanta un proveedor falso que acepta los envíos y dos APIs compiladas (una con Meta y otra con Twilio), con los
# secretos sólo por variables de entorno. Manda avisos de estado firmados como lo hacen Meta (HMAC-SHA256 del cuerpo)
# y Twilio (HMAC-SHA1 de la URL pública y los parámetros). Necesita `npm run db:up`. Limpia todo al terminar.

set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then
  CARGA="$2"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOCK_PORT="${MOCK_PORT:-3085}"
PUERTO_META="${PUERTO_META:-3086}"
PUERTO_TWILIO="${PUERTO_TWILIO:-3087}"
TMP="$(mktemp -d)"
OK=0; KO=0
PIDS=()
VERIFY_TOKEN="verify-rf09"; APP_SECRET="secret-meta-rf09"; TWILIO_TOKEN="token-twilio-rf09"
URL_TWILIO="https://app.maicon.example/api/whatsapp/webhook/twilio"

pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }

# Desde HU-11 RF-13 el historial de envíos pide la sesión de la Secretaría: el script crea una Secretaría temporal y la borra al terminar.
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
SEC_USUARIO="qa.rf09.secretaria"
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }

limpiar() {
  sql "delete from usuarios where usuario='$SEC_USUARIO'" >/dev/null 2>&1 || true
  sql "delete from intentos_login where usuario='$SEC_USUARIO'" >/dev/null 2>&1 || true
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" >/dev/null 2>&1 || true; done
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-11 / RF-09 (avisos de estado del proveedor) contra la API compilada"

# 1. Proveedor falso: acepta cada envío con un id propio (wamid para Meta, SM para Twilio).
cat > "$TMP/mock.js" <<'JS'
const http = require('node:http');
let n = 0;
http.createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    n += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: [{ id: 'wamid.RF09.' + n }], sid: 'SMRF09' + n }));
  });
}).listen(Number(process.argv[2]), '127.0.0.1');
JS
node "$TMP/mock.js" "$MOCK_PORT" &
PIDS+=($!)

# Firmas con el mismo algoritmo que usan los proveedores (no con el código de la API).
cat > "$TMP/firmar.js" <<'JS'
const c = require('node:crypto');
const [tipo, dato, ...resto] = process.argv.slice(2);
if (tipo === 'meta') {
  console.log('sha256=' + c.createHmac('sha256', resto[0]).update(require('node:fs').readFileSync(dato)).digest('hex'));
} else {
  const params = Object.fromEntries(new URLSearchParams(dato));
  const base = Object.keys(params).sort().reduce((a, k) => a + k + params[k], resto[1]);
  console.log(c.createHmac('sha1', resto[0]).update(base, 'utf8').digest('base64'));
}
JS

(cd "$REPO_ROOT" && npm run build --workspace=@mant-asc/api >/dev/null) || { echo "No compiló la API"; exit 1; }
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Clave-QA-2026",4))')"
sql "delete from usuarios where usuario='$SEC_USUARIO'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('$SEC_USUARIO','Secretaría QA','secretaria','$HASH')" >/dev/null || { echo "No pude crear la Secretaría temporal (¿npm run db:up?)"; exit 1; }
token_de() { # token_de <puerto> → token de la Secretaría temporal en esa API
  printf '{"usuario":"%s","password":"Clave-QA-2026"}' "$SEC_USUARIO" > "$TMP/login.json"
  curl -s -o "$TMP/login-r.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login.json" "http://127.0.0.1:$1/api/auth/login"
  json "$TMP/login-r.json" 'b.accessToken||""'
}

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
levantar_api "$PUERTO_META" WHATSAPP_PROVIDER=meta WHATSAPP_META_ACCESS_TOKEN=token WHATSAPP_META_PHONE_NUMBER_ID=1 \
  WHATSAPP_META_BASE_URL="$URL_MOCK" WHATSAPP_META_TEMPLATE_NAME=alerta_falla_critica \
  WHATSAPP_META_VERIFY_TOKEN="$VERIFY_TOKEN" WHATSAPP_META_APP_SECRET="$APP_SECRET" || exit 1
levantar_api "$PUERTO_TWILIO" WHATSAPP_PROVIDER=twilio WHATSAPP_TWILIO_ACCOUNT_SID=ACrf09 WHATSAPP_TWILIO_AUTH_TOKEN="$TWILIO_TOKEN" \
  WHATSAPP_TWILIO_FROM=whatsapp:+14155238886 WHATSAPP_TWILIO_BASE_URL="$URL_MOCK" WHATSAPP_TWILIO_CONTENT_SID=HXrf09 \
  WHATSAPP_TWILIO_WEBHOOK_URL="$URL_TWILIO" || exit 1

declare -A TOKENS
for p in "$PUERTO_META" "$PUERTO_TWILIO"; do
  TOKENS[$p]="$(token_de "$p")"
  [ -n "${TOKENS[$p]}" ] || { echo "No pude ingresar como Secretaría en la API del puerto $p"; exit 1; }
done
tok() { echo "${TOKENS[$1]}"; }

cat > "$TMP/aviso.json" <<'JSON'
{"telefonoDestino":"+54 9 11 6666-7777","nombreEca":"MAICON Mantenimiento","consorcio":"Av. Corrientes 1234","equipo":"M1","estado":"Fuera de Servicio","detalle":"Cabina trabada"}
JSON

enviar() { # enviar <puerto> → imprime el id de mensaje que devolvió el proveedor
  curl -s -o "$TMP/env.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/aviso.json" "http://127.0.0.1:$1/api/whatsapp/enviar-alerta"
  json "$TMP/env.json" 'b.idMensaje'
}
estado_de() { # estado_de <puerto> <id>
  curl -s -o "$TMP/hist.json" -H "Authorization: Bearer $(tok $1)" "http://127.0.0.1:$1/api/whatsapp/historial"
  node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const r=b.registros.find(x=>x.idMensaje===process.argv[2]);console.log(r?r.estadoEntrega:"(no está)")' "$TMP/hist.json" "$2"
}
total_de() { curl -s -o "$TMP/hist.json" -H "Authorization: Bearer $(tok $1)" "http://127.0.0.1:$1/api/whatsapp/historial"; json "$TMP/hist.json" 'b.total'; }
meta_post() { # meta_post <id> <status> [auto|none|firma] [extra]  → imprime el código HTTP
  printf '{"entry":[{"changes":[{"value":{"statuses":[{"id":"%s","status":"%s","timestamp":"1790000000"%s}]}}]}]}' "$1" "$2" "${4:-}" > "$TMP/meta.json"
  local firma="${3:-auto}"
  case "$firma" in auto) firma="$(node "$TMP/firmar.js" meta "$TMP/meta.json" "$APP_SECRET")";; none) firma="";; esac
  curl -s -o "$TMP/wh.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' ${firma:+-H "X-Hub-Signature-256: $firma"} \
    --data-binary @"$TMP/meta.json" "http://127.0.0.1:$PUERTO_META/api/whatsapp/webhook/meta"
}
twilio_post() { # twilio_post <sid> <status> [auto|none|firma] [extra]
  local params="MessageSid=$1&MessageStatus=$2${4:-}"
  local firma="${3:-auto}"
  case "$firma" in auto) firma="$(node "$TMP/firmar.js" twilio "$params" "$TWILIO_TOKEN" "$URL_TWILIO")";; none) firma="";; esac
  curl -s -o "$TMP/wh.json" -w '%{http_code}' -X POST ${firma:+-H "X-Twilio-Signature: $firma"} -d "$params" \
    "http://127.0.0.1:$PUERTO_TWILIO/api/whatsapp/webhook/twilio"
}

echo "1. Verificación de la suscripción de Meta (Criterio 1)"
C="$(curl -s -o "$TMP/v.txt" -w '%{http_code}' "http://127.0.0.1:$PUERTO_META/api/whatsapp/webhook/meta?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=1158201444")"
[ "$C" = "200" ] && [ "$(cat "$TMP/v.txt")" = "1158201444" ] && pass "token correcto: HTTP 200 y devuelve el desafío 1158201444" || fail "verificación → $C $(cat "$TMP/v.txt")"
C="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PUERTO_META/api/whatsapp/webhook/meta?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1")"
[ "$C" = "403" ] && pass "token distinto: HTTP 403" || fail "token distinto → $C"

echo "2. Un envío aceptado todavía no figura entregado (Criterio 7)"
ID_M="$(enviar "$PUERTO_META")"
[ "$(estado_de "$PUERTO_META" "$ID_M")" = "aceptado" ] && pass "el envío $ID_M figura «aceptado»" || fail "estado inicial: $(estado_de "$PUERTO_META" "$ID_M")"

echo "3. Firma de Meta (Criterio 2)"
C1="$(meta_post "$ID_M" delivered none)"; C2="$(meta_post "$ID_M" delivered "sha256=$(printf 'a%.0s' $(seq 1 64))")"
if [ "$C1" = "401" ] && [ "$C2" = "401" ] && [ "$(estado_de "$PUERTO_META" "$ID_M")" = "aceptado" ]; then
  pass "sin firma y con firma inválida: HTTP 401 y el registro sigue «aceptado»"
else
  fail "firma de Meta → sin firma $C1, inválida $C2, estado $(estado_de "$PUERTO_META" "$ID_M")"
fi

echo "4. Estados de Meta: se envía, se entrega, se lee, y nunca retrocede (Criterios 4 y 5)"
meta_post "$ID_M" sent >/dev/null;      E1="$(estado_de "$PUERTO_META" "$ID_M")"
meta_post "$ID_M" delivered >/dev/null; E2="$(estado_de "$PUERTO_META" "$ID_M")"
meta_post "$ID_M" read >/dev/null;      E3="$(estado_de "$PUERTO_META" "$ID_M")"
meta_post "$ID_M" delivered >/dev/null; E4="$(estado_de "$PUERTO_META" "$ID_M")"
[ "$E1|$E2|$E3|$E4" = "enviado|entregado|leido|leido" ] && pass "enviado → entregado → leído, y un delivered tardío no lo baja ($E1|$E2|$E3|$E4)" || fail "secuencia de estados: $E1|$E2|$E3|$E4"
TOTAL_ANTES="$(total_de "$PUERTO_META")"
meta_post "$ID_M" read >/dev/null; meta_post "$ID_M" read >/dev/null
[ "$(total_de "$PUERTO_META")" = "$TOTAL_ANTES" ] && pass "el mismo aviso repetido no crea filas nuevas" || fail "se crearon filas con avisos repetidos"

echo "5. Un mensaje que falla queda «fallido» con el error del proveedor (Criterio 4)"
ID_F="$(enviar "$PUERTO_META")"
meta_post "$ID_F" failed auto ',"errors":[{"code":131026,"title":"Message undeliverable","message":"Message undeliverable","error_data":{"details":"Receiver is incapable of receiving this message"}}]' >/dev/null
curl -s -o "$TMP/hist.json" -H "Authorization: Bearer $(tok $PUERTO_META)" "http://127.0.0.1:$PUERTO_META/api/whatsapp/historial"
if [ "$(json "$TMP/hist.json" 'JSON.stringify(b.registros.filter(x=>x.idMensaje==="'"$ID_F"'").map(x=>[x.estadoEntrega,x.ok,x.errorProveedor.codigo]))')" = '[["fallido",false,"131026"]]' ]; then
  pass "fallido, ok=false y código 131026 del proveedor"
else
  fail "mensaje fallido: $(json "$TMP/hist.json" 'JSON.stringify(b.registros.filter(x=>x.idMensaje==="'"$ID_F"'"))')"
fi

echo "6. Un mensaje que el sistema no conoce responde 200 y no crea nada (Criterio 6)"
TOTAL_ANTES="$(total_de "$PUERTO_META")"
C="$(meta_post "wamid.NO-EXISTE" delivered)"
[ "$C" = "200" ] && [ "$(json "$TMP/wh.json" 'b.desconocidos')" = "1" ] && [ "$(total_de "$PUERTO_META")" = "$TOTAL_ANTES" ] && pass "HTTP 200, desconocidos=1 y el historial no cambió" || fail "mensaje desconocido → $C $(cat "$TMP/wh.json")"

echo "7. Twilio: firma, estados y error (Criterios 3 y 4)"
ID_T="$(enviar "$PUERTO_TWILIO")"
C1="$(twilio_post "$ID_T" delivered none)"; C2="$(twilio_post "$ID_T" delivered "firmainvalida=")"
if [ "$C1" = "401" ] && [ "$C2" = "401" ] && [ "$(estado_de "$PUERTO_TWILIO" "$ID_T")" = "aceptado" ]; then
  pass "Twilio sin firma o con firma inválida: HTTP 401 y el registro no cambia"
else
  fail "firma de Twilio → $C1 / $C2 / $(estado_de "$PUERTO_TWILIO" "$ID_T")"
fi
twilio_post "$ID_T" delivered >/dev/null; T1="$(estado_de "$PUERTO_TWILIO" "$ID_T")"
twilio_post "$ID_T" read >/dev/null;      T2="$(estado_de "$PUERTO_TWILIO" "$ID_T")"
[ "$T1|$T2" = "entregado|leido" ] && pass "Twilio: delivered → entregado y read → leído" || fail "estados de Twilio: $T1|$T2"
ID_T2="$(enviar "$PUERTO_TWILIO")"
twilio_post "$ID_T2" failed auto "&ErrorCode=63016&ErrorMessage=Fuera%20de%20la%20ventana" >/dev/null
[ "$(estado_de "$PUERTO_TWILIO" "$ID_T2")" = "fallido" ] && pass "Twilio: failed → fallido con ErrorCode 63016" || fail "Twilio failed: $(estado_de "$PUERTO_TWILIO" "$ID_T2")"

echo "8. Ningún secreto sale por GET /api/whatsapp/estado (Criterio 8)"
curl -s -o "$TMP/estado.json" "http://127.0.0.1:$PUERTO_META/api/whatsapp/estado"
if ! grep -q -e "$APP_SECRET" -e "$VERIFY_TOKEN" -e "$TWILIO_TOKEN" "$TMP/estado.json"; then
  pass "el estado informa $(cat "$TMP/estado.json") y ningún secreto"
else
  fail "el estado expone un secreto: $(cat "$TMP/estado.json")"
fi

if [ "$CARGA" -gt 0 ]; then
  echo
  echo "== Prueba de carga: $CARGA avisos firmados de entrega (Meta)"
  FALLOS=0; MAX_MS=0; TOTAL_MS=0
  for _ in $(seq 1 "$CARGA"); do
    ID="$(enviar "$PUERTO_META")"
    T0="$(node -e 'console.log(Date.now())')"
    C="$(meta_post "$ID" delivered)"
    DT=$(( $(node -e 'console.log(Date.now())') - T0 ))
    TOTAL_MS=$((TOTAL_MS + DT)); [ "$DT" -gt "$MAX_MS" ] && MAX_MS="$DT"
    { [ "$C" != "200" ] || [ "$(estado_de "$PUERTO_META" "$ID")" != "entregado" ]; } && FALLOS=$((FALLOS + 1))
  done
  echo "  Corridas: $CARGA | Fallos: $FALLOS | Promedio del aviso firmado: $((TOTAL_MS / CARGA)) ms | Más lento: ${MAX_MS} ms"
  [ "$FALLOS" = "0" ] && pass "carga: $CARGA avisos, todos entregados" || fail "carga con $FALLOS fallos"
fi

echo
echo "Resultado: $OK ok, $KO con error"
[ "$KO" -eq 0 ]

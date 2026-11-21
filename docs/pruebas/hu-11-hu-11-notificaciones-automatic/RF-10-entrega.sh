#!/usr/bin/env bash
# HU-11 / RF-10 — La bandeja de avisos muestra si WhatsApp está activo y el estado real de cada envío.
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-10-entrega.sh
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-10-entrega.sh --carga 100
#
# La pantalla se ve con la guía visual (RF-10-guia-visual.md). Este script comprueba lo que la pantalla consume:
#   1. las pruebas de la web de la bandeja y que la web compila;
#   2. GET /api/whatsapp/estado sin proveedor y con Meta (qué dice el cartel) y sin credenciales;
#   3. GET /api/whatsapp/historial (de donde sale el estado de cada envío);
#   4. si la API ya tiene los avisos de estado del proveedor (HU-11 RF-09), el recorrido completo: se envía, el proveedor
#      avisa «entregado» y «leído» con firma, y el historial lo refleja. Sin RF-09 mergeado, ese paso se omite y lo dice.
# Necesita `npm run db:up`. Levanta APIs temporales compiladas y las apaga al terminar.

set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then
  CARGA="$2"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOCK_PORT="${MOCK_PORT:-3095}"
PUERTO_SIN="${PUERTO_SIN:-3096}"
PUERTO_META="${PUERTO_META:-3097}"
TMP="$(mktemp -d)"
OK=0; KO=0; OMITIDOS=0
PIDS=()

pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
omit() { echo "  ⏭️  $1"; OMITIDOS=$((OMITIDOS+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }

# Desde HU-11 RF-13 el historial de envíos pide la sesión de la Secretaría: el script crea una Secretaría temporal y la borra al terminar.
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
SEC_USUARIO="qa.rf10.secretaria"
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }

limpiar() {
  sql "delete from usuarios where usuario='$SEC_USUARIO'" >/dev/null 2>&1 || true
  sql "delete from intentos_login where usuario='$SEC_USUARIO'" >/dev/null 2>&1 || true
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" >/dev/null 2>&1 || true; done
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-11 / RF-10 (cartel de WhatsApp y estado real de cada envío)"

echo "1. La web: pruebas de la bandeja y compilación (Criterio 5)"
if (cd "$REPO_ROOT/apps/web" && npx vitest run src/avisos > "$TMP/vitest.log" 2>&1); then
  pass "pruebas de la bandeja: $(sed 's/\x1b\[[0-9;]*m//g' "$TMP/vitest.log" | grep -E '^ +Tests ' | sed 's/^ *//')"
else
  fail "fallaron las pruebas de la bandeja: $(tail -5 "$TMP/vitest.log")"
fi
if (cd "$REPO_ROOT/apps/web" && npx tsc --noEmit > "$TMP/tsc.log" 2>&1); then pass "la web compila sin errores de tipos"; else fail "errores de tipos: $(head -3 "$TMP/tsc.log")"; fi

(cd "$REPO_ROOT" && npm run build --workspace=@mant-asc/api >/dev/null) || { echo "No compiló la API"; exit 1; }
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Clave-QA-2026",4))')"
sql "delete from usuarios where usuario='$SEC_USUARIO'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('$SEC_USUARIO','Secretaría QA','secretaria','$HASH')" >/dev/null || { echo "No pude crear la Secretaría temporal (¿npm run db:up?)"; exit 1; }
token_de() { # token_de <puerto> → token de la Secretaría temporal en esa API
  printf '{"usuario":"%s","password":"Clave-QA-2026"}' "$SEC_USUARIO" > "$TMP/login.json"
  curl -s -o "$TMP/login-r.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login.json" "http://127.0.0.1:$1/api/auth/login"
  json "$TMP/login-r.json" 'b.accessToken||""'
}

# Receptor que hace de Meta: acepta cada envío con un id propio.
cat > "$TMP/mock.js" <<'JS'
const http = require('node:http');
let n = 0;
http.createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => { n += 1; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ messages: [{ id: 'wamid.RF10.' + n }] })); });
}).listen(Number(process.argv[2]), '127.0.0.1');
JS
node "$TMP/mock.js" "$MOCK_PORT" &
PIDS+=($!)

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

levantar_api "$PUERTO_SIN" WHATSAPP_PROVIDER= WHATSAPP_META_ACCESS_TOKEN= WHATSAPP_TWILIO_AUTH_TOKEN= || exit 1
levantar_api "$PUERTO_META" WHATSAPP_PROVIDER=meta WHATSAPP_META_ACCESS_TOKEN=token-rf10-secreto WHATSAPP_META_PHONE_NUMBER_ID=1 \
  WHATSAPP_META_BASE_URL="http://127.0.0.1:${MOCK_PORT}" WHATSAPP_META_TEMPLATE_NAME=alerta_falla_critica \
  WHATSAPP_META_APP_SECRET=secret-rf10 WHATSAPP_META_VERIFY_TOKEN=verify-rf10 || exit 1

declare -A TOKENS
for p in "$PUERTO_SIN" "$PUERTO_META"; do
  TOKENS[$p]="$(token_de "$p")"
  [ -n "${TOKENS[$p]}" ] || { echo "No pude ingresar como Secretaría en la API del puerto $p"; exit 1; }
done
tok() { echo "${TOKENS[$1]}"; }

echo "2. Lo que dice el cartel: GET /api/whatsapp/estado (Criterio 1)"
curl -s -o "$TMP/sin.json" "http://127.0.0.1:$PUERTO_SIN/api/whatsapp/estado"
[ "$(json "$TMP/sin.json" 'b.configurado+"|"+b.proveedor')" = "false|null" ] && pass "sin proveedor: configurado=false → el cartel dice «WhatsApp no configurado…»" || fail "estado sin proveedor: $(cat "$TMP/sin.json")"
curl -s -o "$TMP/meta.json" "http://127.0.0.1:$PUERTO_META/api/whatsapp/estado"
if [ "$(json "$TMP/meta.json" 'b.configurado+"|"+b.proveedor')" = "true|meta" ] && ! grep -q -e "token-rf10-secreto" -e "secret-rf10" -e "verify-rf10" "$TMP/meta.json"; then
  pass "con Meta: configurado=true, proveedor=meta → «WhatsApp activo: Meta», sin ninguna credencial"
else
  fail "estado con Meta: $(cat "$TMP/meta.json")"
fi

echo "3. De dónde sale el estado de cada envío: GET /api/whatsapp/historial (Criterio 3)"
cat > "$TMP/aviso.json" <<'JSON'
{"telefonoDestino":"+54 9 11 6666-7777","nombreEca":"MAICON Mantenimiento","consorcio":"Av. Corrientes 1234","equipo":"M1","estado":"Fuera de Servicio","detalle":"Cabina trabada"}
JSON
curl -s -o "$TMP/env.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/aviso.json" "http://127.0.0.1:$PUERTO_META/api/whatsapp/enviar-alerta"
ID_MSG="$(json "$TMP/env.json" 'b.idMensaje')"
curl -s -o "$TMP/hist.json" -H "Authorization: Bearer $(tok $PUERTO_META)" "http://127.0.0.1:$PUERTO_META/api/whatsapp/historial"
if [ "$(json "$TMP/hist.json" 'Array.isArray(b.registros) && b.registros.every(r=>"telefonoDestino" in r && "estadoEntrega" in r && "timestamp" in r)')" = "true" ]; then
  pass "el historial trae, por envío, el teléfono, el estado y la hora (lo que la bandeja cruza con cada aviso)"
else
  fail "historial inesperado: $(cat "$TMP/hist.json")"
fi

echo "4. El estado cambia cuando el proveedor avisa (necesita HU-11 RF-09)"
C="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PUERTO_META/api/whatsapp/webhook/meta?hub.mode=subscribe&hub.verify_token=verify-rf10&hub.challenge=1")"
if [ "$C" != "200" ]; then
  omit "la API no tiene los avisos del proveedor (HU-11 RF-09 todavía no está mergeado): se omite el recorrido de estados"
else
  firmar() { printf '%s' "$1" > "$TMP/c.json"; node -e 'const c=require("crypto");console.log("sha256="+c.createHmac("sha256","secret-rf10").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$TMP/c.json"; }
  aviso_meta() { local cuerpo; cuerpo="$(printf '{"entry":[{"changes":[{"value":{"statuses":[{"id":"%s","status":"%s"}]}}]}]}' "$1" "$2")"; \
    curl -s -o /dev/null -X POST -H 'Content-Type: application/json' -H "X-Hub-Signature-256: $(firmar "$cuerpo")" --data-binary @"$TMP/c.json" "http://127.0.0.1:$PUERTO_META/api/whatsapp/webhook/meta"; }
  estado_de() { curl -s -o "$TMP/hist.json" -H "Authorization: Bearer $(tok $PUERTO_META)" "http://127.0.0.1:$PUERTO_META/api/whatsapp/historial"; node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((b.registros.find(r=>r.idMensaje===process.argv[2])||{}).estadoEntrega)' "$TMP/hist.json" "$1"; }
  E0="$(estado_de "$ID_MSG")"; aviso_meta "$ID_MSG" delivered; E1="$(estado_de "$ID_MSG")"; aviso_meta "$ID_MSG" read; E2="$(estado_de "$ID_MSG")"
  [ "$E0|$E1|$E2" = "aceptado|entregado|leido" ] && pass "el historial pasa de aceptado a entregado y a leído (la bandeja lo muestra como «Aceptado…», «Entregado» y «Leído»)" || fail "estados: $E0|$E1|$E2"
fi

if [ "$CARGA" -gt 0 ]; then
  echo
  echo "== Prueba de carga: $CARGA lecturas del cartel y del historial (lo que hace la bandeja al abrirse)"
  FALLOS=0; MAX_MS=0; TOTAL_MS=0
  for _ in $(seq 1 "$CARGA"); do
    T0="$(node -e 'console.log(Date.now())')"
    C1="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PUERTO_META/api/whatsapp/estado")"
    C2="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $(tok $PUERTO_META)" "http://127.0.0.1:$PUERTO_META/api/whatsapp/historial")"
    DT=$(( $(node -e 'console.log(Date.now())') - T0 ))
    TOTAL_MS=$((TOTAL_MS + DT)); [ "$DT" -gt "$MAX_MS" ] && MAX_MS="$DT"
    { [ "$C1" != "200" ] || [ "$C2" != "200" ]; } && FALLOS=$((FALLOS + 1))
  done
  echo "  Corridas: $CARGA | Fallos: $FALLOS | Promedio: $((TOTAL_MS / CARGA)) ms | Más lenta: ${MAX_MS} ms (incluye arrancar node para medir)"
  [ "$FALLOS" = "0" ] && pass "carga: $CARGA aperturas, 0 fallos" || fail "carga con $FALLOS fallos"
fi

echo
echo "Resultado: $OK ok, $KO con error, $OMITIDOS omitidos"
[ "$KO" -eq 0 ]

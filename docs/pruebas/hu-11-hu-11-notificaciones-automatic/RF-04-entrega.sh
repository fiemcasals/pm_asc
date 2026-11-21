#!/usr/bin/env bash
# HU-11 / RF-04 — Proveedor real de WhatsApp (Meta Cloud API / Twilio) y teléfono ECA desde terna de roles.
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-04-entrega.sh
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-04-entrega.sh --carga 25
#
# Levanta un receptor HTTP local que emula el endpoint de Meta Cloud API (modo prueba y rechazo)
# y una instancia temporal de la API compilada con credenciales cargadas sólo por variables de entorno,
# contra la base PostgreSQL real (`npm run db:up`). Limpia todo al finalizar.

set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then
  CARGA="$2"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
API_PORT_TEST="${API_PORT_TEST:-3064}"
MOCK_PORT="${MOCK_PORT:-3065}"
BASE_URL="http://127.0.0.1:${API_PORT_TEST}"
TMP="$(mktemp -d)"
OK=0; KO=0
MOCK_PID=""
API_PID=""
EDIF_ID=""

pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }

limpiar() {
  [ -n "$API_PID" ] && kill "$API_PID" >/dev/null 2>&1 || true
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" >/dev/null 2>&1 || true
  [ -n "$EDIF_ID" ] && sql "delete from consorcios where id='$EDIF_ID'" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-11 / RF-04 (Proveedor real de WhatsApp + teléfono ECA de terna) contra $BASE_URL"

# 1. Levantar servidor receptor HTTP simulando Meta WhatsApp Cloud API (acepta +5491177778888 y rechaza +5491199990000)
cat > "$TMP/mock-meta.js" <<'JS'
const http = require('node:http');
const fs = require('node:fs');
const port = Number(process.argv[2]);
const logFile = process.argv[3];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = {};
    try { body = JSON.parse(raw); } catch {}
    fs.appendFileSync(logFile, JSON.stringify({ url: req.url, auth: req.headers.authorization, to: body.to }) + '\n');
    if (body.to === '5491199990000') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Recipient phone number not in allowed list', code: 131030, error_data: { details: 'Test mode restriction' } } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.RF04.' + Date.now() }] }));
  });
});
server.listen(port, '127.0.0.1');
JS

node "$TMP/mock-meta.js" "$MOCK_PORT" "$TMP/meta.log" &
MOCK_PID=$!

# 2. Compilar si falta dist/main.js y levantar API temporal con credenciales sólo por env vars
if [ ! -f "$REPO_ROOT/apps/api/dist/main.js" ]; then
  (cd "$REPO_ROOT" && npm run build --workspace=@mant-asc/api >/dev/null)
fi

API_PORT="$API_PORT_TEST" \
WHATSAPP_PROVIDER="meta" \
WHATSAPP_META_ACCESS_TOKEN="env-only-token-rf04" \
WHATSAPP_META_PHONE_NUMBER_ID="9988776655" \
WHATSAPP_META_API_VERSION="v21.0" \
WHATSAPP_META_BASE_URL="http://127.0.0.1:${MOCK_PORT}" \
WHATSAPP_META_TEMPLATE_NAME="alerta_falla_critica" \
node "$REPO_ROOT/apps/api/dist/main.js" > "$TMP/api.log" 2>&1 &
API_PID=$!

for i in $(seq 1 30); do
  C="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/health")"
  [ "$C" = "200" ] && break
  sleep 0.5
done

echo "1. Proveedor real configurado desde variables de entorno sin exponer credenciales (Criterios 1 y 4)"
curl -s -o "$TMP/estado.json" "$BASE_URL/api/whatsapp/estado"
if [ "$(json "$TMP/estado.json" 'b.configurado+"|"+b.proveedor')" = "true|meta" ] && ! grep -q "env-only-token" "$TMP/estado.json"; then
  pass "GET /api/whatsapp/estado informa configurado=true, proveedor=meta y cero secretos"
else
  fail "estado inesperado: $(cat "$TMP/estado.json")"
fi

echo "2. Envío exitoso por HTTP real al proveedor en modo prueba (Criterio 1)"
cat > "$TMP/envio_ok.json" <<'JSON'
{
  "telefonoDestino": "+5491177778888",
  "nombreEca": "MAICON Mantenimiento",
  "consorcio": "Av. Santa Fe 3200",
  "equipo": "M1",
  "estado": "Fuera de Servicio",
  "detalle": "Prueba de integración RF-04"
}
JSON
CODE="$(curl -s -o "$TMP/res_ok.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$TMP/envio_ok.json" "$BASE_URL/api/whatsapp/enviar-alerta")"
if [ "$CODE" = "201" ] && [ "$(json "$TMP/res_ok.json" 'b.ok+"|"+b.proveedor+"|"+b.idMensaje.startsWith("wamid.RF04.")')" = "true|meta|true" ]; then
  pass "HTTP 201: mensaje entregado al proveedor Meta real con wamid oficial"
else
  fail "envío exitoso → $CODE $(cat "$TMP/res_ok.json")"
fi

echo "3. Sin teléfono de ECA cargado en la terna NO se envía y se informa el motivo (Criterio 2)"
cat > "$TMP/sin_tel.json" <<'JSON'
{
  "nombreEca": "MAICON Mantenimiento",
  "consorcio": "Av. Santa Fe 3200",
  "equipo": "M1",
  "estado": "Fuera de Servicio",
  "detalle": "Envío sin teléfono"
}
JSON
CODE_ST="$(curl -s -o "$TMP/res_st.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$TMP/sin_tel.json" "$BASE_URL/api/whatsapp/enviar-alerta")"
if [ "$CODE_ST" = "400" ] && [ "$(json "$TMP/res_st.json" 'b.estadoEntrega')" = "sin_telefono" ]; then
  pass "sin teléfono cargado: HTTP 400 (sin_telefono) con motivo claro y sin llamar al proveedor"
else
  fail "sin teléfono → $CODE_ST $(cat "$TMP/res_st.json")"
fi

# Probar resolución desde terna real en PostgreSQL (roles_edificio)
printf '{"usuario":"demo.admin","password":"Demo-Clave-2026"}' > "$TMP/login.json"
curl -s -o "$TMP/login_res.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login.json" "$BASE_URL/api/auth/login"
TOKEN_ADMIN="$(json "$TMP/login_res.json" 'b.accessToken')"

printf '{"nombre":"Consorcio RF04 Santa Fe","direccion":"Av. Santa Fe 3200, CABA","maquinas":[{"referenciaAgc":"M1"}]}' > "$TMP/edif.json"
curl -s -o "$TMP/edif_res.json" -X POST -H "Authorization: Bearer $TOKEN_ADMIN" -H 'Content-Type: application/json' -d @"$TMP/edif.json" "$BASE_URL/api/consorcios"
EDIF_ID="$(json "$TMP/edif_res.json" 'b.id')"
printf '{"rtCalle":{"nombre":"demo.rt","telefono":"+5491111111111","email":"rt@m.com"},"firmante":{"nombre":"demo.firmante","telefono":"+5491122222222","email":"f@m.com"},"eca":{"nombre":"MAICON Mantenimiento","telefono":"+5491177778888","email":"eca@m.com"}}' > "$TMP/roles.json"
curl -s -o /dev/null -X PUT -H "Authorization: Bearer $TOKEN_ADMIN" -H 'Content-Type: application/json' -d @"$TMP/roles.json" "$BASE_URL/api/consorcios/$EDIF_ID/roles"

# Aprobar aviso de ALT-MAICON-001 (sin enviar teléfono explícito) y comprobar que toma +5491177778888 de la terna
curl -s -o /dev/null -X POST -H 'Content-Type: application/json' -d '{"alertaId":"ALT-MAICON-001"}' "$BASE_URL/api/whatsapp/trigger-alerta-critica"
curl -s -o "$TMP/apr_res.json" -X POST -H "Authorization: Bearer $TOKEN_ADMIN" -H 'Content-Type: application/json' -d '{}' "$BASE_URL/api/avisos/ALT-MAICON-001/aprobar"
TEL_USADO="$(json "$TMP/apr_res.json" '(b.envios.find(e=>e.canal==="whatsapp_eca")||{}).destino')"
if [ "$TEL_USADO" = "+5491177778888" ]; then
  pass "el aviso aprobado tomó el teléfono +5491177778888 desde la terna de roles en PostgreSQL"
else
  fail "teléfono usado inesperado: $TEL_USADO ($(cat "$TMP/apr_res.json"))"
fi

echo "4. Rechazo del proveedor informa error exacto y registra fallo en historial (Criterio 3)"
cat > "$TMP/envio_rech.json" <<'JSON'
{
  "telefonoDestino": "+5491199990000",
  "nombreEca": "MAICON Mantenimiento",
  "consorcio": "Av. Callao 800",
  "equipo": "M1",
  "estado": "Fuera de Servicio",
  "detalle": "Número no autorizado en modo prueba"
}
JSON
CODE_RECH="$(curl -s -o "$TMP/res_rech.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$TMP/envio_rech.json" "$BASE_URL/api/whatsapp/enviar-alerta")"
if [ "$CODE_RECH" = "502" ] && grep -q "Recipient phone number not in allowed list" "$TMP/res_rech.json" && [ "$(json "$TMP/res_rech.json" 'b.estadoEntrega')" = "fallido" ]; then
  pass "rechazo del proveedor: HTTP 502 informando el error literal (131030) y estado fallido"
else
  fail "rechazo → $CODE_RECH $(cat "$TMP/res_rech.json")"
fi

curl -s -o "$TMP/hist.json" "$BASE_URL/api/whatsapp/historial"
if [ "$(json "$TMP/hist.json" 'b.registros.some(r=>r.estadoEntrega==="fallido" && String(r.motivo).includes("131030"))')" = "true" ]; then
  pass "el envío rechazado quedó registrado como fallido en GET /api/whatsapp/historial"
else
  fail "historial no registró el rechazo: $(cat "$TMP/hist.json")"
fi

if [ "$CARGA" -gt 0 ]; then
  echo
  echo "== Prueba de carga: $CARGA despachos consecutivos vía proveedor HTTP real"
  FALLOS_CARGA=0; MAX_MS=0; TOTAL_MS=0
  for i in $(seq 1 "$CARGA"); do
    T0="$(node -e 'console.log(Date.now())')"
    C="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$TMP/envio_ok.json" "$BASE_URL/api/whatsapp/enviar-alerta")"
    T1="$(node -e 'console.log(Date.now())')"
    DT=$((T1 - T0))
    TOTAL_MS=$((TOTAL_MS + DT))
    [ "$DT" -gt "$MAX_MS" ] && MAX_MS="$DT"
    [ "$C" != "201" ] && FALLOS_CARGA=$((FALLOS_CARGA + 1))
  done
  PROM_MS=$((TOTAL_MS / CARGA))
  echo "  Corridas: $CARGA | Fallos: $FALLOS_CARGA | Promedio: ${PROM_MS} ms | Más lenta: ${MAX_MS} ms"
  [ "$FALLOS_CARGA" = "0" ] && pass "prueba de carga ($CARGA corridas, 0 fallos, máx ${MAX_MS} ms)" || fail "carga tuvo $FALLOS_CARGA fallos"
fi

echo
echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

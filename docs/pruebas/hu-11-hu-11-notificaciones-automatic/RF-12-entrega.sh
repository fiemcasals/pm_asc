#!/usr/bin/env bash
# HU-11 / RF-12 (REQ-1795263642415) — El historial de envíos de WhatsApp se guarda en PostgreSQL y sobrevive a un reinicio.
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-12-entrega.sh
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-12-entrega.sh --carga 100
#
# Levanta un proveedor falso estilo Meta y una API compilada con Meta configurado; manda avisos, recibe los avisos de estado firmados,
# APAGA la API y la vuelve a arrancar, y comprueba el historial. Crea una Secretaría temporal y la borra al terminar (también borra
# los envíos de prueba). Necesita `npm run db:up`. Con --carga N manda N envíos antes del reinicio y comprueba que estén todos.
set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then CARGA="$2"; fi
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOCK_PORT="${MOCK_PORT:-3125}"
PUERTO="${PUERTO:-3126}"
API="http://127.0.0.1:$PUERTO"
APP_SECRET="secret-meta-rf12"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
SEC_USUARIO="qa.rf12.secretaria"
MARCA="wamid.RF12E.$(date +%s)"
TMP="$(mktemp -d)"
OK=0; KO=0
PIDS=(); API_PID=""
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }

limpiar() {
  sql "delete from whatsapp_envios where id_mensaje like '$MARCA.%'" >/dev/null 2>&1 || true
  sql "delete from usuarios where usuario='$SEC_USUARIO'" >/dev/null 2>&1 || true
  sql "delete from intentos_login where usuario='$SEC_USUARIO'" >/dev/null 2>&1 || true
  [ -n "$API_PID" ] && kill "$API_PID" >/dev/null 2>&1
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" >/dev/null 2>&1 || true; done
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-11 / RF-12 (historial de WhatsApp en PostgreSQL) contra la API compilada"

cat > "$TMP/mock.js" <<'JS'
const http = require('node:http');
let n = 0;
const marca = process.argv[3];
http.createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => { n += 1; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ messages: [{ id: marca + '.' + n }] })); });
}).listen(Number(process.argv[2]), '127.0.0.1');
JS
node "$TMP/mock.js" "$MOCK_PORT" "$MARCA" &
PIDS+=($!)

(cd "$REPO_ROOT" && npm run build --workspace=@mant-asc/api >/dev/null) || { echo "No compiló la API"; exit 1; }
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Clave-QA-2026",4))')"
sql "delete from usuarios where usuario='$SEC_USUARIO'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('$SEC_USUARIO','Secretaría QA','secretaria','$HASH')" >/dev/null || { echo "No pude crear la Secretaría temporal (¿npm run db:up?)"; exit 1; }

levantar() {
  env API_PORT="$PUERTO" WHATSAPP_PROVIDER=meta WHATSAPP_META_ACCESS_TOKEN=token WHATSAPP_META_PHONE_NUMBER_ID=1 \
    WHATSAPP_META_BASE_URL="http://127.0.0.1:$MOCK_PORT" WHATSAPP_META_TEMPLATE_NAME=alerta_falla_critica \
    WHATSAPP_META_APP_SECRET="$APP_SECRET" WHATSAPP_META_VERIFY_TOKEN=verify-rf12 \
    node "$REPO_ROOT/apps/api/dist/main.js" >> "$TMP/api.log" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/health")" = "200" ] && break; sleep 0.5; done
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/health")" = "200" ] || { echo "La API no levantó:"; tail -5 "$TMP/api.log"; exit 1; }
  printf '{"usuario":"%s","password":"Clave-QA-2026"}' "$SEC_USUARIO" > "$TMP/l.json"
  curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$API/api/auth/login"
  SEC="$(json "$TMP/lr.json" 'b.accessToken||""')"
  [ -n "$SEC" ] || { echo "No pude ingresar con la Secretaría temporal"; exit 1; }
}
apagar() { kill "$API_PID" >/dev/null 2>&1; wait "$API_PID" 2>/dev/null; API_PID=""; }

cat > "$TMP/aviso.json" <<'JSON'
{"telefonoDestino":"+54 9 11 6666-1212","nombreEca":"MAICON Mantenimiento","consorcio":"Av. Corrientes 1234","equipo":"M1","estado":"Fuera de Servicio","detalle":"Prueba RF-12"}
JSON
enviar() { curl -s -o "$TMP/env.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/aviso.json" "$API/api/whatsapp/enviar-alerta"; json "$TMP/env.json" 'b.idMensaje'; }
estado_de() {
  curl -s -o "$TMP/h.json" -H "Authorization: Bearer $SEC" "$API/api/whatsapp/historial"
  node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const r=b.registros.find(x=>x.idMensaje===process.argv[2]);console.log(r?r.estadoEntrega:"(no está)")' "$TMP/h.json" "$1"
}
proveedor() {
  printf '{"entry":[{"changes":[{"value":{"statuses":[{"id":"%s","status":"%s","timestamp":"1790000000"}]}}]}]}' "$1" "$2" > "$TMP/meta.json"
  local firma; firma="sha256=$(node -e 'const c=require("node:crypto");console.log(c.createHmac("sha256",process.argv[2]).update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' "$TMP/meta.json" "$APP_SECRET")"
  curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "X-Hub-Signature-256: $firma" --data-binary @"$TMP/meta.json" "$API/api/whatsapp/webhook/meta"
}

levantar
echo "1. Antes del reinicio"
A="$(enviar)"; B="$(enviar)"; F="$(enviar)"
proveedor "$A" delivered >/dev/null; proveedor "$F" failed >/dev/null
[ "$(estado_de "$A")|$(estado_de "$B")|$(estado_de "$F")" = "entregado|aceptado|fallido" ] && pass "tres envíos: $A entregado, $B aceptado, $F fallido" || fail "estados antes: $(estado_de "$A")|$(estado_de "$B")|$(estado_de "$F")"
if [ "$CARGA" -gt 0 ]; then for _ in $(seq 1 "$CARGA"); do enviar >/dev/null; done; fi
sleep 1
FILAS="$(sql "select count(*) from whatsapp_envios where id_mensaje like '$MARCA.%'" | tr -d ' \r')"
[ "$FILAS" = "$((3 + CARGA))" ] && pass "quedaron $FILAS filas en whatsapp_envios" || fail "filas en whatsapp_envios: $FILAS (esperaba $((3 + CARGA)))"

echo "2. Reinicio real de la API (se apaga el proceso y se vuelve a arrancar)"
apagar; levantar
pass "la API se reinició"

echo "3. Después del reinicio"
[ "$(estado_de "$A")|$(estado_de "$B")|$(estado_de "$F")" = "entregado|aceptado|fallido" ] && pass "criterio 1: los tres envíos siguen, con el mismo estado" || fail "estados después: $(estado_de "$A")|$(estado_de "$B")|$(estado_de "$F")"
[ "$(proveedor "$B" read)" = "200" ] && [ "$(estado_de "$B")" = "leido" ] && [ "$(estado_de "$A")" = "entregado" ] && pass "criterio 2: el «read» que llega después actualiza $B (leído) y no toca a $A" || fail "criterio 2: $B=$(estado_de "$B") $A=$(estado_de "$A")"
proveedor "$A" sent >/dev/null; proveedor "$F" delivered >/dev/null
[ "$(estado_de "$A")|$(estado_de "$F")" = "entregado|fallido" ] && pass "criterio 3: un aviso viejo no hace retroceder a $A, y el fallido se mantiene" || fail "criterio 3: $(estado_de "$A")|$(estado_de "$F")"
if [ "$CARGA" -gt 0 ]; then
  N="$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(b.registros.filter(r=>(r.idMensaje||"").startsWith(process.argv[2])).length)' "$TMP/h.json" "$MARCA.")"
  [ "$N" = "$((3 + CARGA))" ] && pass "carga: los $((3 + CARGA)) envíos siguen en el historial después del reinicio" || fail "carga: $N de $((3 + CARGA))"
fi
apagar; levantar
[ "$(estado_de "$B")" = "leido" ] && pass "y lo que se actualizó después del reinicio también quedó guardado (otro reinicio: $B sigue leído)" || fail "después del segundo reinicio $B=$(estado_de "$B")"

echo "4. Pruebas automáticas"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest test/whatsapp-historial-persistencia.e2e-spec.ts test/whatsapp-webhook.e2e-spec.ts test/whatsapp-proveedor.e2e-spec.ts > "$TMP/a.txt" 2>&1)
grep -qE "^Tests: +[0-9]+ passed" "$TMP/a.txt" && ! grep -q "failed" "$TMP/a.txt" && pass "pruebas de WhatsApp: $(grep -E '^Tests:' "$TMP/a.txt" | tr -s ' ')" || fail "pruebas de WhatsApp"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest --config jest.int.config.js --runInBand test/whatsapp-historial.int-spec.ts > "$TMP/i.txt" 2>&1)
grep -qE "^Tests: +[0-9]+ passed" "$TMP/i.txt" && ! grep -q "failed" "$TMP/i.txt" && pass "integración con PostgreSQL real: $(grep -E '^Tests:' "$TMP/i.txt" | tr -s ' ')" || fail "integración con PostgreSQL real"

echo "Resultado: $OK ok, $KO con error"
[ "$KO" -eq 0 ]

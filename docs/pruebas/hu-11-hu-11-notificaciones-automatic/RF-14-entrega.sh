#!/usr/bin/env bash
# HU-11 / RF-14 (REQ-1795263643018) — Que el estado general de un aviso refleje un envío de WhatsApp que falla después.
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-14-entrega.sh
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-14-entrega.sh --carga 20
#
# Levanta un proveedor falso estilo Meta (acepta cada envío con un wamid propio) y una API compilada con Meta configurado y el
# secreto de los avisos de estado. Crea una Secretaría y un RT temporales y los borra al terminar. Necesita `npm run db:up`.
# Con --carga N repite N veces el ciclo aprobar → fallo informado → reintento, y mide cuánto tarda.
set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then CARGA="$2"; fi
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOCK_PORT="${MOCK_PORT:-3105}"
PUERTO="${PUERTO:-3106}"
API="http://127.0.0.1:$PUERTO"
APP_SECRET="secret-meta-rf14"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
SEC_USUARIO="qa.rf14.secretaria"; RT_USUARIO="qa.rf14.rt"
TMP="$(mktemp -d)"
OK=0; KO=0
PIDS=()
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }

limpiar() {
  sql "delete from usuarios where usuario in ('$SEC_USUARIO','$RT_USUARIO')" >/dev/null 2>&1 || true
  sql "delete from intentos_login where usuario in ('$SEC_USUARIO','$RT_USUARIO')" >/dev/null 2>&1 || true
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" >/dev/null 2>&1 || true; done
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-11 / RF-14 (el aviso refleja un WhatsApp que falla después) contra la API compilada"

# Proveedor falso: cuenta los envíos y responde con un wamid propio.
cat > "$TMP/mock.js" <<'JS'
const http = require('node:http');
let n = 0;
http.createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    if (req.url === '/cuantos') { res.end(String(n)); return; }
    n += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: [{ id: 'wamid.RF14.' + n }] }));
  });
}).listen(Number(process.argv[2]), '127.0.0.1');
JS
node "$TMP/mock.js" "$MOCK_PORT" &
PIDS+=($!)
cuantos() { curl -s "http://127.0.0.1:$MOCK_PORT/cuantos"; }

(cd "$REPO_ROOT" && npm run build --workspace=@mant-asc/api >/dev/null) || { echo "No compiló la API"; exit 1; }
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Clave-QA-2026",4))')"
sql "delete from usuarios where usuario in ('$SEC_USUARIO','$RT_USUARIO')" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('$SEC_USUARIO','Secretaría QA','secretaria','$HASH'), ('$RT_USUARIO','RT QA','rt_calle','$HASH')" >/dev/null \
  || { echo "No pude crear los usuarios temporales (¿npm run db:up?)"; exit 1; }

env API_PORT="$PUERTO" WHATSAPP_PROVIDER=meta WHATSAPP_META_ACCESS_TOKEN=token WHATSAPP_META_PHONE_NUMBER_ID=1 \
  WHATSAPP_META_BASE_URL="http://127.0.0.1:$MOCK_PORT" WHATSAPP_META_TEMPLATE_NAME=alerta_falla_critica \
  WHATSAPP_META_APP_SECRET="$APP_SECRET" WHATSAPP_META_VERIFY_TOKEN=verify-rf14 \
  node "$REPO_ROOT/apps/api/dist/main.js" > "$TMP/api.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/health")" = "200" ] && break; sleep 0.5; done
[ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/health")" = "200" ] || { echo "La API no levantó:"; tail -5 "$TMP/api.log"; exit 1; }

login() {
  printf '{"usuario":"%s","password":"Clave-QA-2026"}' "$1" > "$TMP/l.json"
  curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$API/api/auth/login"
  json "$TMP/lr.json" 'b.accessToken||""'
}
SEC="$(login "$SEC_USUARIO")"; RT="$(login "$RT_USUARIO")"
{ [ -n "$SEC" ] && [ -n "$RT" ]; } || { echo "No pude ingresar con los usuarios temporales"; exit 1; }

informar() { # → id del informe (y del aviso)
  printf '{"maquinaId":"MAQ-CORRIENTES-M1","fallasCriticas":["BOTON_PARE_FALLA"]}' > "$TMP/inf.json"
  curl -s -o "$TMP/inf-r.json" -X POST -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d @"$TMP/inf.json" "$API/api/fallas-criticas/informes"
  json "$TMP/inf-r.json" 'b.informe.id'
}
aprobar() { curl -s -o "$TMP/apr.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $SEC" -H 'Content-Type: application/json' -d '{}' "$API/api/avisos/$1/aprobar"; }
aviso() { curl -s -o "$TMP/av.json" -H "Authorization: Bearer $SEC" "$API/api/avisos/$1"; }
estado_bandeja() { # estado del aviso tal como lo lista la bandeja (GET /api/avisos)
  curl -s -o "$TMP/lista.json" -H "Authorization: Bearer $SEC" "$API/api/avisos"
  node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((b.find(a=>a.alertaId===process.argv[2])||{}).estado)' "$TMP/lista.json" "$1"
}
wamid() { json "$TMP/apr.json" "(b.envios.find(e=>e.canal==='$1'&&e.ok)||{}).idMensaje"; }
proveedor() { # proveedor <wamid> <status> [código] → código HTTP del webhook
  local err=""; [ -n "${3:-}" ] && err=",\"errors\":[{\"code\":$3,\"title\":\"Message undeliverable\"}]"
  printf '{"entry":[{"changes":[{"value":{"statuses":[{"id":"%s","status":"%s","timestamp":"1790000000"%s}]}}]}]}' "$1" "$2" "$err" > "$TMP/meta.json"
  local firma; firma="sha256=$(node -e 'const c=require("node:crypto");console.log(c.createHmac("sha256",process.argv[2]).update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' "$TMP/meta.json" "$APP_SECRET")"
  curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "X-Hub-Signature-256: $firma" --data-binary @"$TMP/meta.json" "$API/api/whatsapp/webhook/meta"
}

echo "1. Un aviso «Enviado» cuyo WhatsApp el proveedor informa después como fallido"
ID="$(informar)"; C="$(aprobar "$ID")"; E="$(json "$TMP/apr.json" 'b.estado')"
[ "$C" = "201" ] && [ "$E" = "Enviado" ] && pass "aprobado: «Enviado», con WhatsApp a la ECA ($(wamid whatsapp_eca)) y al Firmante ($(wamid whatsapp_firmante))" || { fail "aprobar → $C $E"; exit 1; }
W_ECA="$(wamid whatsapp_eca)"
[ "$(proveedor "$W_ECA" failed 131026)" = "200" ] && pass "el proveedor avisa que $W_ECA falló (código 131026)" || fail "el aviso del proveedor no fue aceptado"
E="$(estado_bandeja "$ID")"
[ "$E" = "Falló el envío" ] && pass "la bandeja muestra el aviso «Falló el envío» (con eso ofrece «Reintentar envío»)" || fail "la bandeja muestra «$E»"
aviso "$ID"
M="$(json "$TMP/av.json" "(b.envios.find(e=>e.idMensaje==='$W_ECA')||{}).motivo")"
[ "$(json "$TMP/av.json" "(b.envios.find(e=>e.idMensaje==='$W_ECA')||{}).ok")" = "false" ] && [[ "$M" == *131026* ]] && pass "el envío a la ECA queda fallido: «$M»" || fail "el envío a la ECA: $M"

echo "2. Al reintentar bien vuelve a «Enviado» y el historial conserva el fallo anterior"
ANTES="$(cuantos)"; C="$(aprobar "$ID")"; DESPUES="$(cuantos)"; E="$(json "$TMP/apr.json" 'b.estado')"
[ "$C" = "201" ] && [ "$E" = "Enviado" ] && pass "reintento: «Enviado»" || fail "reintento → $C $E"
[ $((DESPUES - ANTES)) -eq 1 ] && pass "sólo se reenvió el WhatsApp que falló (1 mensaje; el del Firmante ya había salido)" || fail "se reenviaron $((DESPUES - ANTES)) mensajes"
N_ECA="$(json "$TMP/apr.json" "b.envios.filter(e=>e.canal==='whatsapp_eca').map(e=>(e.ok?'ok':'fallido')+':'+e.idMensaje).join(' | ')")"
[[ "$N_ECA" == "fallido:$W_ECA | ok:"* ]] && pass "los envíos a la ECA conservan el fallo: $N_ECA" || fail "envíos a la ECA: $N_ECA"
curl -s -o "$TMP/h.json" -H "Authorization: Bearer $SEC" "$API/api/whatsapp/historial"
[ "$(json "$TMP/h.json" "(b.registros.find(r=>r.idMensaje==='$W_ECA')||{}).estadoEntrega")" = "fallido" ] && pass "el historial de WhatsApp sigue mostrando $W_ECA como fallido" || fail "el historial perdió el fallo"
[ "$(estado_bandeja "$ID")" = "Enviado" ] && pass "y la bandeja lo sigue mostrando «Enviado»" || fail "la bandeja no quedó en «Enviado»"

echo "3. Con todos sus envíos entregados o leídos sigue «Enviado»"
ID2="$(informar)"; aprobar "$ID2" >/dev/null
proveedor "$(wamid whatsapp_eca)" delivered >/dev/null; proveedor "$(wamid whatsapp_firmante)" read >/dev/null
[ "$(estado_bandeja "$ID2")" = "Enviado" ] && pass "entregado y leído: «Enviado»" || fail "entregado y leído: $(estado_bandeja "$ID2")"
proveedor "$(wamid whatsapp_eca)" failed 131026 >/dev/null
[ "$(estado_bandeja "$ID2")" = "Enviado" ] && pass "un «failed» tardío después de entregado no lo cambia" || fail "un fallo tardío lo cambió a $(estado_bandeja "$ID2")"
(cd "$REPO_ROOT/apps/web" && NO_COLOR=1 npx vitest run src/avisos > "$TMP/w.txt" 2>&1)
grep -qE "Tests +[0-9]+ passed" "$TMP/w.txt" && ! grep -qE "Tests .* failed" "$TMP/w.txt" && pass "pruebas de la bandeja: $(grep -E '^ +Tests ' "$TMP/w.txt" | tr -s ' ' | sed 's/^ //')" || fail "pruebas de la bandeja"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest test/aviso-fallo-posterior.e2e-spec.ts > "$TMP/a.txt" 2>&1)
grep -qE "^Tests: +[0-9]+ passed" "$TMP/a.txt" && pass "aviso-fallo-posterior.e2e-spec: $(grep -E '^Tests:' "$TMP/a.txt" | tr -s ' ')" || fail "aviso-fallo-posterior.e2e-spec"

if [ "$CARGA" -gt 0 ]; then
  echo "== Prueba de carga: $CARGA ciclos aprobar → fallo informado → reintento"
  FALLOS=0; T0="$(node -e 'console.log(Date.now())')"
  for _ in $(seq 1 "$CARGA"); do
    I="$(informar)"; aprobar "$I" >/dev/null; proveedor "$(wamid whatsapp_firmante)" failed 131026 >/dev/null
    [ "$(estado_bandeja "$I")" = "Falló el envío" ] || FALLOS=$((FALLOS+1))
    aprobar "$I" >/dev/null; [ "$(json "$TMP/apr.json" 'b.estado')" = "Enviado" ] || FALLOS=$((FALLOS+1))
  done
  DT=$(( $(node -e 'console.log(Date.now())') - T0 ))
  echo "  Ciclos: $CARGA | Fallos: $FALLOS | Promedio por ciclo: $((DT / CARGA)) ms (incluye arrancar curl y node)"
  [ "$FALLOS" -eq 0 ] && pass "carga: $CARGA ciclos sin fallos" || fail "carga: $FALLOS fallos"
fi

echo "Resultado: $OK ok, $KO con error"
[ "$KO" -eq 0 ]

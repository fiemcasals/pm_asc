#!/usr/bin/env bash
# HU-11 / RF-11 (REQ-1795263642081) — Los avisos de falla crítica de la bandeja se guardan en PostgreSQL y sobreviven a un reinicio.
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-11-entrega.sh
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-11-entrega.sh --carga 30
#
# Levanta un proveedor falso estilo Meta y una API compilada con Meta configurado; registra fallas, aprueba una, APAGA la API y la
# vuelve a arrancar, y comprueba la bandeja, el enlace y que nada se reenvíe. Crea una Secretaría y un RT temporales y los borra al
# terminar, junto con los avisos y envíos de prueba. Necesita `npm run db:up`. Con --carga N registra N avisos más antes del reinicio.
set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then CARGA="$2"; fi
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOCK_PORT="${MOCK_PORT:-3135}"
PUERTO="${PUERTO:-3136}"
API="http://127.0.0.1:$PUERTO"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
SEC_USUARIO="qa.rf11.secretaria"; RT_USUARIO="qa.rf11.rt"
TMP="$(mktemp -d)"
OK=0; KO=0
PIDS=(); API_PID=""; CREADOS=()
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }

limpiar() {
  for id in "${CREADOS[@]:-}"; do
    [ -n "$id" ] && sql "delete from avisos_falla where alerta_id='$id'; delete from whatsapp_envios where alerta_id='$id'" >/dev/null 2>&1
  done
  sql "delete from usuarios where usuario in ('$SEC_USUARIO','$RT_USUARIO')" >/dev/null 2>&1 || true
  sql "delete from intentos_login where usuario in ('$SEC_USUARIO','$RT_USUARIO')" >/dev/null 2>&1 || true
  [ -n "$API_PID" ] && kill "$API_PID" >/dev/null 2>&1
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" >/dev/null 2>&1 || true; done
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-11 / RF-11 (avisos de la bandeja en PostgreSQL) contra la API compilada"

cat > "$TMP/mock.js" <<'JS'
const http = require('node:http');
let n = 0;
http.createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    if (req.url === '/cuantos') { res.end(String(n)); return; }
    n += 1; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ messages: [{ id: 'wamid.RF11E.' + Date.now() + '.' + n }] }));
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

login() {
  printf '{"usuario":"%s","password":"Clave-QA-2026"}' "$1" > "$TMP/l.json"
  curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$API/api/auth/login"
  json "$TMP/lr.json" 'b.accessToken||""'
}
levantar() {
  env API_PORT="$PUERTO" WHATSAPP_PROVIDER=meta WHATSAPP_META_ACCESS_TOKEN=token WHATSAPP_META_PHONE_NUMBER_ID=1 \
    WHATSAPP_META_BASE_URL="http://127.0.0.1:$MOCK_PORT" WHATSAPP_META_TEMPLATE_NAME=alerta_falla_critica \
    node "$REPO_ROOT/apps/api/dist/main.js" >> "$TMP/api.log" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/health")" = "200" ] && break; sleep 0.5; done
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/health")" = "200" ] || { echo "La API no levantó:"; tail -5 "$TMP/api.log"; exit 1; }
  SEC="$(login "$SEC_USUARIO")"; RT="$(login "$RT_USUARIO")"
  { [ -n "$SEC" ] && [ -n "$RT" ]; } || { echo "No pude ingresar con los usuarios temporales"; exit 1; }
}
apagar() { kill "$API_PID" >/dev/null 2>&1; wait "$API_PID" 2>/dev/null; API_PID=""; }

informar() {
  printf '{"maquinaId":"MAQ-CORRIENTES-M1","fallasCriticas":["BOTON_PARE_FALLA"]}' > "$TMP/inf.json"
  curl -s -o "$TMP/inf-r.json" -X POST -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d @"$TMP/inf.json" "$API/api/fallas-criticas/informes"
  json "$TMP/inf-r.json" 'b.informe.id'
}
aprobar() { curl -s -o "$TMP/apr.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $SEC" -H 'Content-Type: application/json' -d '{}' "$API/api/avisos/$1/aprobar"; }
campo() { # campo <alertaId> <expresión sobre a> → valor del aviso en la bandeja
  curl -s -o "$TMP/lista.json" -H "Authorization: Bearer $SEC" "$API/api/avisos"
  node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const a=b.find(x=>x.alertaId===process.argv[2]);console.log(a?eval(process.argv[3]):"(no está)")' "$TMP/lista.json" "$1" "$2"
}

levantar
echo "1. Antes del reinicio"
P="$(informar)"; E="$(informar)"; CREADOS+=("$P" "$E")
[ "$(aprobar "$E")" = "201" ] && pass "dos avisos: $P pendiente y $E aprobado («$(json "$TMP/apr.json" 'b.estado')»)" || fail "no se pudo aprobar $E"
RUTA="$(json "$TMP/apr.json" 'new URL(b.enlace).pathname')"; VENCE="$(json "$TMP/apr.json" 'b.enlaceVenceEn')"; ENVIOS="$(json "$TMP/apr.json" 'JSON.stringify(b.envios.map(e=>Object.fromEntries(Object.entries(e).sort())))')"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$API$RUTA")" = "200" ] && pass "el enlace del aviso abre el informe (vence el $VENCE)" || fail "el enlace no abre"
for _ in $(seq 1 "$CARGA"); do CREADOS+=("$(informar)"); done
sleep 1
FILAS="$(sql "select count(*) from avisos_falla where alerta_id in ($(printf "'%s'," "${CREADOS[@]}" | sed 's/,$//'))" | tr -d ' \r')"
[ "$FILAS" = "${#CREADOS[@]}" ] && pass "quedaron $FILAS filas en avisos_falla" || fail "filas en avisos_falla: $FILAS de ${#CREADOS[@]}"
MANDADOS="$(cuantos)"

echo "2. Reinicio real de la API (se apaga el proceso y se vuelve a arrancar)"
apagar; levantar
pass "la API se reinició"

echo "3. Después del reinicio"
[ "$(campo "$P" 'a.estado')" = "Pendiente de revisión" ] && pass "criterio 1: $P sigue «Pendiente de revisión» en la bandeja" || fail "criterio 1: $P está «$(campo "$P" 'a.estado')»"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$API$RUTA")" = "200" ] && [ "$(campo "$E" 'a.enlaceVenceEn')" = "$VENCE" ] && pass "criterio 2: el enlace sigue abriendo el informe y vence igual que antes ($VENCE: 7 días desde que se emitió)" || fail "criterio 2: enlace $(curl -s -o /dev/null -w '%{http_code}' "$API$RUTA"), vence $(campo "$E" 'a.enlaceVenceEn')"
C="$(aprobar "$E")"
[ "$C" = "409" ] && [ "$(cuantos)" = "$MANDADOS" ] && [ "$(campo "$E" 'JSON.stringify(a.envios.map(e=>Object.fromEntries(Object.entries(e).sort())))')" = "$ENVIOS" ] && pass "criterio 3: $E no se vuelve a enviar (409, 0 mensajes nuevos) y conserva el estado de cada envío" || fail "criterio 3: aprobar → $C, mensajes $(cuantos) vs $MANDADOS"
[ "$(aprobar "$P")" = "201" ] && [ "$(json "$TMP/apr.json" 'b.estado')" = "Enviado" ] && pass "criterio 1: $P se aprueba después del reinicio y queda «Enviado»" || fail "no se pudo aprobar $P después del reinicio"
if [ "$CARGA" -gt 0 ]; then
  N="$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const ids=new Set(process.argv.slice(2));console.log(b.filter(a=>ids.has(a.alertaId)).length)' "$TMP/lista.json" "${CREADOS[@]}")"
  [ "$N" = "${#CREADOS[@]}" ] && pass "carga: los ${#CREADOS[@]} avisos siguen en la bandeja después del reinicio" || fail "carga: $N de ${#CREADOS[@]}"
fi

echo "4. Pruebas automáticas"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest test/avisos-persistencia.e2e-spec.ts test/avisos.e2e-spec.ts test/informe-aviso.e2e-spec.ts > "$TMP/a.txt" 2>&1)
grep -qE "^Tests: +[0-9]+ passed" "$TMP/a.txt" && ! grep -q "failed" "$TMP/a.txt" && pass "pruebas de avisos: $(grep -E '^Tests:' "$TMP/a.txt" | tr -s ' ')" || fail "pruebas de avisos"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest --config jest.int.config.js --runInBand test/avisos-persistencia.int-spec.ts > "$TMP/i.txt" 2>&1)
grep -qE "^Tests: +[0-9]+ passed" "$TMP/i.txt" && ! grep -q "failed" "$TMP/i.txt" && pass "integración con PostgreSQL real: $(grep -E '^Tests:' "$TMP/i.txt" | tr -s ' ')" || fail "integración con PostgreSQL real"

echo "Resultado: $OK ok, $KO con error"
[ "$KO" -eq 0 ]

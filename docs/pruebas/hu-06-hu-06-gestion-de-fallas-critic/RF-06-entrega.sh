#!/usr/bin/env bash
# HU-06 / RF-06 — RT con sesión: fallas críticas y checklist solo para quien corresponde.
#
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-06-entrega.sh
#
# Requiere `npm run db:up`, la API RECIÉN LEVANTADA (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET: el script registra fallas críticas
# de demostración y eso queda en la memoria de la API hasta que se reinicia) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea usuarios temporales (un RT, un Firmante y una ECA) y la inspección de prueba, y los borra al terminar. BASE_URL por defecto http://127.0.0.1:3050.
# Lo que hace el celular (la cola de fallas críticas, que no pierde nada con la sesión vencida) se prueba en las pruebas de la web y a mano: ver RF-06-entrega.md.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
TMP="$(mktemp -d)"
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
# http <token|-> <metodo> <ruta> [curl extra...] → código en $CODE, cuerpo en $TMP/r.json
http() { local t="$1" m="$2" r="$3"; shift 3; local auth=(); [ "$t" != "-" ] && auth=(-H "Authorization: Bearer $t"); CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$m" "${auth[@]}" "$@" "$BASE_URL$r")"; }
JSONH=(-H 'Content-Type: application/json')
INFORME='{"maquinaId":"MAQ-CORRIENTES-M1","fallasCriticas":["BOTON_PARE_FALLA"],"inspector":"otra.persona"}'
INSP='{"consorcioId":"11111111-1111-4111-8111-111111111111","maquinaId":"22222222-2222-4222-8222-222222222222","referenciaAgc":"m1","tipoMaquina":"hidraulico","estadoEquipo":"en_uso","datos":{}}'
INSPECCION=""
informes() { http "$SEC" GET /api/fallas-criticas/informes; json "$TMP/r.json" 'b.length'; }
limpiar() { [ -n "$INSPECCION" ] && sql "delete from inspecciones_checklist where id='$INSPECCION'" >/dev/null; sql "delete from usuarios where usuario like 'h06r-%'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-06 / RF-06 contra $BASE_URL"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h06r-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('h06r-rt','RT','rt_calle',null,'$HASH'),
  ('h06r-fir','Firmante','firmante',null,'$HASH'),
  ('h06r-eca','ECA','eca','Conservación Porteña S.R.L.','$HASH')" >/dev/null
RT="$(login h06r-rt)"; FIR="$(login h06r-fir)"; ECA="$(login h06r-eca)"; SEC="$(login demo.secretaria)"; ADM="$(login demo.admin)"
for t in "$RT" "$FIR" "$ECA" "$SEC" "$ADM"; do
  { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario: corré antes RF-02-datos-demo.sh"; exit 1; }
done
[ "$(informes)" = "0" ] || { echo "  ❌ la API ya tiene fallas críticas en memoria: reiniciala y volvé a correr"; exit 1; }

echo "1. Criterio 1: sin sesión, 401 (y no se registra ninguna falla crítica)"
MAL=""
for r in "POST /api/fallas-criticas/informes" "GET /api/checklist/config?tipo=traccion" "POST /api/checklist/inspecciones" "GET /api/checklist/inspecciones/11111111-1111-4111-8111-111111111111"; do
  http - "${r%% *}" "${r#* }" "${JSONH[@]}" -d "$INFORME"; [ "$CODE" = "401" ] || MAL="$MAL [$r → $CODE]"
done
[ -z "$MAL" ] && pass "registrar una falla crítica y las 3 rutas del checklist (configuración, crear y ver inspecciones) responden 401 sin sesión" || fail "sin sesión:$MAL"
http "token.inventado.x" POST /api/fallas-criticas/informes "${JSONH[@]}" -d "$INFORME"; [ "$CODE" = "401" ] && pass "con un token inventado también da 401" || fail "token inventado → $CODE"
[ "$(informes)" = "0" ] && pass "no se registró ninguna falla crítica ni se avisó a la Secretaría" || fail "informes tras los pedidos sin sesión: $(informes)"

echo "2. Criterio 2: solo el RT registra y crea; el resto de los roles, 403"
MAL=""; for t in "$SEC" "$ADM" "$FIR" "$ECA"; do http "$t" POST /api/fallas-criticas/informes "${JSONH[@]}" -d "$INFORME"; [ "$CODE" = "403" ] || MAL="$MAL [informe → $CODE]"; http "$t" POST /api/checklist/inspecciones "${JSONH[@]}" -d "$INSP"; [ "$CODE" = "403" ] || MAL="$MAL [inspección → $CODE]"; done
[ -z "$MAL" ] && pass "la Secretaría, el Administrador, el Firmante y la ECA reciben 403 al registrar una falla crítica y al crear una inspección" || fail "403:$MAL"
[ "$(informes)" = "0" ] && pass "y no quedó ninguna falla crítica registrada" || fail "informes: $(informes)"
http "$RT" POST /api/fallas-criticas/informes "${JSONH[@]}" -d "$INFORME"; [ "$CODE" = "201" ] && pass "el RT registra la falla crítica (201)" || fail "RT informe → $CODE $(head -c 200 "$TMP/r.json")"
http "$RT" POST /api/checklist/inspecciones "${JSONH[@]}" -d "$INSP"; INSPECCION="$(json "$TMP/r.json" 'b.id')"
{ [ "$CODE" = "201" ] && [ -n "$INSPECCION" ] && [ "$INSPECCION" != "undefined" ]; } && pass "el RT crea una inspección del checklist (201)" || { fail "RT inspección → $CODE $(head -c 200 "$TMP/r.json")"; INSPECCION=""; }
MAL=""; for t in "$RT" "$SEC" "$ADM" "$FIR"; do http "$t" GET "/api/checklist/config?tipo=traccion"; [ "$CODE" = "200" ] || MAL="$MAL [config → $CODE]"; [ -n "$INSPECCION" ] && { http "$t" GET "/api/checklist/inspecciones/$INSPECCION"; [ "$CODE" = "200" ] || MAL="$MAL [inspección → $CODE]"; }; done
[ -z "$MAL" ] && pass "el RT, la Secretaría, el Administrador y el Firmante leen la configuración y la inspección (200)" || fail "lectura:$MAL"
http "$ECA" GET "/api/checklist/config"; C1="$CODE"; http "$ECA" GET "/api/checklist/inspecciones/${INSPECCION:-11111111-1111-4111-8111-111111111111}"; C2="$CODE"
[ "$C1 $C2" = "403 403" ] && pass "la ECA no lee la configuración ni las inspecciones del checklist (403)" || fail "ECA → $C1 $C2"

echo "3. Criterio 3: el inspector es el usuario de la sesión"
http "$RT" POST /api/fallas-criticas/informes "${JSONH[@]}" -d '{"maquinaId":"MAQ-CORRIENTES-M2","fallasCriticas":["BOTON_PARE_FALLA"],"inspector":"otra.persona"}'
[ "$(json "$TMP/r.json" 'b.informe.inspector')" = "h06r-rt" ] && pass "el cuerpo decía inspector «otra.persona»: el informe quedó a nombre de h06r-rt (la sesión)" || fail "inspector: $(head -c 250 "$TMP/r.json")"
http "$SEC" GET /api/fallas-criticas/informes; [ "$(json "$TMP/r.json" 'b.every(i=>i.inspector==="h06r-rt")')" = "true" ] && pass "la Secretaría ve todos los informes a nombre de h06r-rt" || fail "lo que ve la Secretaría: $(head -c 250 "$TMP/r.json")"
http "$RT" POST /api/fallas-criticas/informes "${JSONH[@]}" -d '{"maquinaId":"MAQ-CORRIENTES-M1","fallasCriticas":["BOTON_PARE_FALLA"]}'; [ "$CODE" = "201" ] && pass "el cuerpo ya no necesita traer el inspector (201 sin ese campo)" || fail "sin inspector → $CODE"

echo "4 y 5. Criterios 4 y 5 (celular): las pruebas de la web"
if command -v npx >/dev/null 2>&1; then
  RES="$(cd "$RAIZ/apps/web" && npx vitest run src/checklist 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Tests ')"
  echo "$RES" | grep -q "failed" && fail "pruebas de la cola y el checklist en la web: $RES" || { [ -n "$RES" ] && pass "pruebas de la cola de fallas críticas y del checklist en la web en verde ($(echo "$RES" | xargs))" || fail "no pude correr las pruebas de la web"; }
else
  echo "   (sin npx: no se corrieron las pruebas de la web)"
fi

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

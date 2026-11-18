#!/usr/bin/env bash
# HU-08 / RF-04 — Portal del Firmante con sesión: cada Firmante ve y firma solo lo suyo.
#
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-04-entrega.sh
#
# Requiere `npm run db:up`, la API RECIÉN LEVANTADA (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET: el script autoriza y rechaza
# máquinas de demostración y eso queda en la memoria de la API hasta que se reinicia) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea usuarios temporales (el Firmante «gonza», dueño de las máquinas de demostración, otro Firmante, un RT y una ECA) y los borra al terminar.
# Si ya existe un usuario «gonza», se detiene sin tocarlo. La pantalla (criterio 5) se prueba a mano: ver RF-04-entrega.md.

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
M1="MAQ-CORRIENTES-M1"; SF1="MAQ-SANTAFE-M1"
estado() { # estado <token> <maquinaId> <campo de visita> → valor
  http "$1" GET /api/firmante/maquinas; json "$TMP/r.json" "(b.find(m=>m.id==='$2')||{visita:{}}).visita.$3"
}
limpiar() { sql "delete from usuarios where usuario in ('gonza','h08f-otro','h08f-rt','h08f-eca')" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-08 / RF-04 contra $BASE_URL"
[ "$(sql "select count(*) from usuarios where lower(usuario)='gonza'")" = "0" ] || { echo "  ❌ ya existe un usuario «gonza» en la base: el script no lo toca. Usá una base de demostración."; trap - EXIT; rm -rf "$TMP"; exit 1; }
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('gonza','Gonza Firmante','firmante',null,'$HASH'),
  ('h08f-otro','Otro Firmante','firmante',null,'$HASH'),
  ('h08f-rt','RT','rt_calle',null,'$HASH'),
  ('h08f-eca','ECA','eca','Conservación Porteña S.R.L.','$HASH')" >/dev/null
GON="$(login gonza)"; OTR="$(login h08f-otro)"; RT="$(login h08f-rt)"; ECA="$(login h08f-eca)"; SEC="$(login demo.secretaria)"; ADM="$(login demo.admin)"
for t in "$GON" "$OTR" "$RT" "$ECA" "$SEC" "$ADM"; do
  { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario: corré antes RF-02-datos-demo.sh"; exit 1; }
done

echo "1. Criterio 1: sin sesión, 401 (y no se autoriza ni se rechaza nada)"
MAL=""
for r in "GET /api/firmante/maquinas" "POST /api/firmante/autorizar" "POST /api/firmante/rechazar"; do
  http - "${r%% *}" "${r#* }" -H 'x-user-name: gonza' -H 'x-user-id: USR-1793292123166' "${JSONH[@]}" -d "{\"maquinaId\":\"$M1\",\"motivo\":\"intruso\"}"
  [ "$CODE" = "401" ] || MAL="$MAL [$r → $CODE]"
done
[ -z "$MAL" ] && pass "las 3 rutas (máquinas, autorizar y rechazar) responden 401 sin sesión, aunque traigan el usuario «gonza» en los headers" || fail "sin sesión:$MAL"
http "token.inventado.x" GET /api/firmante/maquinas; [ "$CODE" = "401" ] && pass "con un token inventado también da 401" || fail "token inventado → $CODE"
[ "$(estado "$GON" "$M1" autorizada)" = "false" ] && [ "$(estado "$GON" "$SF1" rechazada)" != "true" ] && pass "la máquina $M1 sigue sin autorizar y $SF1 sin rechazar" || fail "algo cambió sin sesión"

echo "2. Criterio 2: un Firmante ve y firma solo lo suyo"
http "$GON" GET "/api/firmante/maquinas?firmante=h08f-otro" -H 'x-user-name: h08f-otro'
[ "$(json "$TMP/r.json" 'b.length>0 && b.every(m=>m.firmanteUsername==="gonza")')" = "true" ] && pass "«gonza» pide las de otro Firmante por parámetro y por header: ve igual las suyas ($(json "$TMP/r.json" 'b.length') máquinas)" || fail "gonza pidiendo las de otro → $(head -c 200 "$TMP/r.json")"
http "$OTR" GET /api/firmante/maquinas; [ "$(json "$TMP/r.json" 'b.length')" = "0" ] && pass "un Firmante sin máquinas asignadas no ve ninguna" || fail "otro Firmante → $(head -c 200 "$TMP/r.json")"
http "$OTR" POST /api/firmante/autorizar "${JSONH[@]}" -d "{\"maquinaId\":\"$M1\"}"; A="$CODE"; AM="$(json "$TMP/r.json" 'b.message')"
http "$OTR" POST /api/firmante/rechazar "${JSONH[@]}" -d "{\"maquinaId\":\"$SF1\",\"motivo\":\"no es mío\"}"; R="$CODE"; RM="$(json "$TMP/r.json" 'b.message')"
http "$OTR" POST /api/firmante/autorizar "${JSONH[@]}" -d '{"maquinaId":"MAQ-NO-EXISTE"}'; I="$CODE"; IM="$(json "$TMP/r.json" 'b.message')"
{ [ "$A $R $I" = "404 404 404" ] && [ "$AM" = "$IM" ] && [ "$RM" = "$IM" ]; } && pass "autorizar y rechazar la máquina de otro Firmante da 404, con el mismo mensaje que una máquina inexistente" || fail "máquina ajena → $A $R $I | $AM | $RM | $IM"
[ "$(estado "$GON" "$M1" autorizada)" = "false" ] && [ "$(estado "$GON" "$SF1" rechazada)" != "true" ] && pass "y no cambió nada: $M1 sigue sin autorizar y $SF1 sin rechazar" || fail "cambió la máquina de otro Firmante"

echo "3. Criterio 3: Secretaría y Administrador ven todo pero no autorizan; RT y ECA, 403"
for par in "SEC:la Secretaría" "ADM:el Administrador"; do
  rol="${par%%:*}"; http "${!rol}" GET /api/firmante/maquinas
  TODAS="$(json "$TMP/r.json" 'b.length')"; http "${!rol}" GET "/api/firmante/maquinas?firmante=h08f-otro"; VACIA="$(json "$TMP/r.json" 'b.length')"
  [ "$TODAS" = "5" ] && [ "$VACIA" = "0" ] && pass "${par#*:} ve las 5 máquinas de todos los Firmantes (o las del que elija: 0 para h08f-otro)" || fail "${par#*:}: todas=$TODAS otro=$VACIA"
done
MAL=""; for t in "$SEC" "$ADM" "$RT" "$ECA"; do
  http "$t" POST /api/firmante/autorizar "${JSONH[@]}" -d "{\"maquinaId\":\"$M1\"}"; [ "$CODE" = "403" ] || MAL="$MAL [autorizar → $CODE]"
  http "$t" POST /api/firmante/rechazar "${JSONH[@]}" -d "{\"maquinaId\":\"$SF1\",\"motivo\":\"x\"}"; [ "$CODE" = "403" ] || MAL="$MAL [rechazar → $CODE]"
done
[ -z "$MAL" ] && pass "la Secretaría, el Administrador, el RT y la ECA reciben 403 al autorizar y al rechazar" || fail "403:$MAL"
MAL=""; for t in "$RT" "$ECA"; do http "$t" GET /api/firmante/maquinas; [ "$CODE" = "403" ] || MAL="$MAL [máquinas → $CODE]"; done
[ -z "$MAL" ] && pass "el RT y la ECA tampoco ven las máquinas del Firmante (403)" || fail "RT/ECA:$MAL"
[ "$(estado "$GON" "$M1" autorizada)" = "false" ] && [ "$(estado "$GON" "$SF1" rechazada)" != "true" ] && pass "ninguno de esos pedidos cambió nada" || fail "cambió algo"

echo "4. Criterio 4: la autorización y el rechazo quedan a nombre del usuario de la sesión"
http "$GON" POST /api/firmante/autorizar -H 'x-user-name: intruso' -H 'x-user-id: otro' "${JSONH[@]}" -d "{\"maquinaId\":\"$M1\",\"firmante\":\"intruso\"}"
{ [ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.autorizacion.autorizadoPor')" = "gonza" ]; } && pass "autorizar con «x-user-name: intruso»: queda «gonza», el usuario de la sesión (antes quedaba «intruso»)" || fail "autorizar → $CODE $(head -c 200 "$TMP/r.json")"
http "$GON" POST /api/firmante/rechazar -H 'x-user-name: intruso' "${JSONH[@]}" -d "{\"maquinaId\":\"$SF1\",\"motivo\":\"Falta la firma del encargado\"}"
{ [ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.rechazo.rechazadoPor')" = "gonza" ]; } && pass "rechazar con «x-user-name: intruso»: queda «gonza»" || fail "rechazar → $CODE $(head -c 200 "$TMP/r.json")"
[ "$(estado "$SEC" "$M1" autorizadoPor)" = "gonza" ] && [ "$(estado "$SEC" "$SF1" rechazadoPor)" = "gonza" ] && pass "la Secretaría ve la autorización y el rechazo a nombre de «gonza»" || fail "lo que ve la Secretaría"

echo "5. Criterio 5 (pantalla): las pruebas de la web"
if command -v npx >/dev/null 2>&1; then
  RES="$(cd "$RAIZ/apps/web" && npx vitest run src/firmante 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Tests ')"
  echo "$RES" | grep -q "failed" && fail "pruebas del panel del Firmante en la web: $RES" || { [ -n "$RES" ] && pass "pruebas del panel del Firmante en la web en verde ($(echo "$RES" | xargs))" || fail "no pude correr las pruebas de la web"; }
else
  echo "   (sin npx: no se corrieron las pruebas de la web)"
fi

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

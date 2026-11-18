#!/usr/bin/env bash
# HU-15 / RF-02 — Portal ECA con sesión: cada ECA ve solo lo suyo.
#
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RF-02-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea usuarios temporales (dos ECA, una ECA sin asignar, un RT y un Firmante) y los borra al terminar, con los acuses que hayan quedado.
# Aviso: la API recuerda en memoria el acuse de la alerta hasta que se reinicia. BASE_URL por defecto http://127.0.0.1:3050.
# La pantalla (criterio 5) se prueba a mano: ver RF-02-entrega.md.

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
ALERTAS="'ALT-CP-001','ALT-MAICON-001','ALT-MAICON-002'"
acuses() { sql "select count(*) from acuses_recibo_legal where alerta_id in ($ALERTAS)"; }
limpiar() { sql "delete from acuses_recibo_legal where alerta_id in ($ALERTAS)" >/dev/null; sql "delete from usuarios where usuario like 'h15e-%'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-15 / RF-02 contra $BASE_URL"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from acuses_recibo_legal where alerta_id in ($ALERTAS)" >/dev/null
sql "delete from usuarios where usuario like 'h15e-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('h15e-eca-pte','ECA Porteña','eca','Conservación Porteña S.R.L.','$HASH'),
  ('h15e-eca-mai','ECA Maicon','eca','MAICON Mantenimiento','$HASH'),
  ('h15e-eca-sin','ECA sin asignar','eca',null,'$HASH'),
  ('h15e-rt','RT','rt_calle',null,'$HASH'),
  ('h15e-firmante','Firmante','firmante',null,'$HASH')" >/dev/null
PTE="$(login h15e-eca-pte)"; MAI="$(login h15e-eca-mai)"; SIN="$(login h15e-eca-sin)"; RT="$(login h15e-rt)"; FIR="$(login h15e-firmante)"
SEC="$(login demo.secretaria)"; ADM="$(login demo.admin)"
for t in "$PTE" "$MAI" "$SIN" "$RT" "$FIR" "$SEC" "$ADM"; do
  { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario: corré antes RF-02-datos-demo.sh"; exit 1; }
done

echo "1. Criterio 1: sin sesión, 401 (y no se registra ningún acuse)"
MAL=""
for r in "GET /api/eca/alertas" "GET /api/eca/cobertura" "GET /api/eca/maquinas" "GET /api/eca/remito/ALT-MAICON-002" "GET /api/eca/remito/ALT-MAICON-002?formato=pdf&usuario=intruso@x.com" "POST /api/eca/alertas/ALT-MAICON-002/acuse"; do
  http - "${r%% *}" "${r#* }" -H 'x-eca-user: intruso@x.com' -H 'Content-Type: application/json' -d '{"usuario":"intruso@x.com"}'
  [ "$CODE" = "401" ] || MAL="$MAL [$r → $CODE]"
done
[ -z "$MAL" ] && pass "las 6 rutas del portal (alertas, cobertura, máquinas, remito JSON y PDF, acuse) responden 401 sin sesión" || fail "sin sesión:$MAL"
http "token.inventado.x" GET /api/eca/alertas; [ "$CODE" = "401" ] && pass "con un token inventado también da 401" || fail "token inventado → $CODE"
[ "$(acuses)" = "0" ] && pass "no quedó ningún acuse en la base, aunque la URL, el cuerpo y los headers traían un usuario" || fail "quedaron acuses: $(acuses)"

echo "2. Criterio 2: un usuario ECA sólo ve y descarga lo de su ECA"
http "$PTE" GET /api/eca/alertas -H 'x-eca-name: MAICON Mantenimiento' -H 'x-eca-id: MAICON Mantenimiento' -G --data-urlencode 'eca=MAICON Mantenimiento'
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.eca+"|"+b.alertas.map(a=>a.alerta.id).join(",")')" = "Conservación Porteña S.R.L.|ALT-CP-001" ] && pass "la ECA de Porteña pide la de MAICON por header y por parámetro: ve igual la suya (ALT-CP-001)" || fail "Porteña pidiendo MAICON → $CODE $(head -c 200 "$TMP/r.json")"
http "$MAI" GET /api/eca/alertas; [ "$(json "$TMP/r.json" 'b.alertas.map(a=>a.alerta.id).sort().join(",")')" = "ALT-MAICON-001,ALT-MAICON-002" ] && pass "la ECA de MAICON ve sus 2 alertas y no la de Porteña" || fail "MAICON → $(head -c 200 "$TMP/r.json")"
http "$MAI" GET /api/eca/maquinas; [ "$(json "$TMP/r.json" 'b.length>0 && b.every(m=>m.eca==="MAICON Mantenimiento")')" = "true" ] && pass "sus máquinas son todas de su ECA" || fail "máquinas de otra ECA"
R1="$(http "$MAI" GET /api/eca/remito/ALT-CP-001; echo $CODE)"; R2="$(http "$MAI" GET "/api/eca/remito/ALT-CP-001?formato=pdf"; echo $CODE)"; R3="$(http "$MAI" POST /api/eca/alertas/ALT-CP-001/acuse; echo $CODE)"
[ "$R1 $R2 $R3" = "404 404 404" ] && pass "la alerta de otra ECA da 404 al pedir el remito (JSON y PDF) y al acusar recibo" || fail "alerta ajena → $R1 $R2 $R3"
[ "$(acuses)" = "0" ] && pass "y no quedó ningún acuse en la base" || fail "acuses tras la alerta ajena: $(acuses)"
http "$SIN" GET /api/eca/alertas; { [ "$CODE" = "403" ] && grep -q "ECA asignada" "$TMP/r.json"; } && pass "un usuario ECA sin ECA asignada recibe 403 con el motivo" || fail "sin ECA → $CODE"

echo "3. Criterio 3: Secretaría y Administrador ven cualquier ECA; RT y Firmante, 403"
for rol in SEC ADM; do
  OKROL=1
  for par in "Conservación Porteña S.R.L.|1" "MAICON Mantenimiento|2" "Elevadores San Martín|0"; do
    http "${!rol}" GET /api/eca/alertas -H "x-eca-name: ${par%%|*}"
    [ "$(json "$TMP/r.json" 'b.eca+"|"+b.totalAlertas')" = "${par%%|*}|${par##*|}" ] || OKROL=0
  done
  [ "$OKROL" = "1" ] && pass "$([ "$rol" = SEC ] && echo la Secretaría || echo el Administrador) elige cada una de las 3 ECA y ve sus alertas (1, 2 y 0)" || fail "$rol no ve todas las ECA"
done
MAL=""; for t in "$RT" "$FIR"; do for r in /api/eca/alertas /api/eca/cobertura /api/eca/maquinas /api/eca/remito/ALT-MAICON-002; do http "$t" GET "$r"; [ "$CODE" = "403" ] || MAL="$MAL [$r → $CODE]"; done; http "$t" POST /api/eca/alertas/ALT-MAICON-002/acuse; [ "$CODE" = "403" ] || MAL="$MAL [acuse → $CODE]"; done
[ -z "$MAL" ] && pass "el RT y el Firmante reciben 403 en todas las rutas del portal" || fail "RT/Firmante:$MAL"
MAL=""; for t in "$SEC" "$ADM"; do http "$t" GET /api/eca/remito/ALT-MAICON-002; [ "$CODE" = "403" ] || MAL="$MAL [remito → $CODE]"; http "$t" POST /api/eca/alertas/ALT-MAICON-002/acuse; [ "$CODE" = "403" ] || MAL="$MAL [acuse → $CODE]"; done
[ -z "$MAL" ] && pass "la Secretaría y el Administrador no descargan el remito ni registran el acuse (es de la ECA): 403" || fail "Secretaría/Administrador:$MAL"
[ "$(acuses)" = "0" ] && pass "ningún acuse quedó registrado por ellos" || fail "acuses: $(acuses)"

echo "4. Criterio 4: el acuse queda a nombre del usuario de la sesión"
http "$PTE" POST /api/eca/alertas/ALT-CP-001/acuse -H 'x-eca-user: otro@x.com' -H 'x-user-id: otro' -H 'Content-Type: application/json' -d '{"usuario":"responsable@x.com"}'
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.acuse.usuario')" = "h15e-eca-pte" ] && pass "POST acuse con otro usuario en el cuerpo y en los headers: el acuse es de h15e-eca-pte" || fail "acuse → $CODE $(head -c 200 "$TMP/r.json")"
[ "$(sql "select usuario||'|'||eca from acuses_recibo_legal where alerta_id='ALT-CP-001'")" = "h15e-eca-pte|Conservación Porteña S.R.L." ] && pass "en la base: una fila, de h15e-eca-pte y con la ECA de la alerta" || fail "fila en la base: $(sql "select usuario from acuses_recibo_legal where alerta_id='ALT-CP-001'")"
CODE="$(curl -s -D "$TMP/h.txt" -o "$TMP/r.pdf" -w '%{http_code}' -H "Authorization: Bearer $MAI" -H 'x-eca-user: intruso@x.com' "$BASE_URL/api/eca/remito/ALT-MAICON-001?formato=pdf&usuario=intruso@x.com")"
{ [ "$CODE" = "200" ] && grep -qi "^x-acuse-usuario: h15e-eca-mai" "$TMP/h.txt" && [ "$(head -c 5 "$TMP/r.pdf")" = "%PDF-" ]; } && pass "el remito en PDF con ?usuario=intruso@x.com registra a h15e-eca-mai (cabecera x-acuse-usuario)" || fail "remito PDF → $CODE $(grep -i x-acuse "$TMP/h.txt")"
http - GET /api/eca/remito/ALT-MAICON-002/informe; { [ "$CODE" = "200" ] && grep -q "pendiente" "$TMP/r.json"; } && [ "$(sql "select count(*) from acuses_recibo_legal where alerta_id='ALT-MAICON-002'")" = "0" ] && pass "la vista pública del informe no crea acuses: ALT-MAICON-002 sigue sin acuse" || fail "informe público → $CODE"

echo "5. Criterio 5 (pantalla): las pruebas de la web"
if command -v npx >/dev/null 2>&1; then
  RES="$(cd "$RAIZ/apps/web" && npx vitest run src/eca 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Tests ')"
  echo "$RES" | grep -q "failed" && fail "pruebas del portal en la web: $RES" || { [ -n "$RES" ] && pass "pruebas del portal ECA en la web en verde ($(echo "$RES" | xargs))" || fail "no pude correr las pruebas de la web"; }
else
  echo "   (sin npx: no se corrieron las pruebas de la web)"
fi

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

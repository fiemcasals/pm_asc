#!/usr/bin/env bash
# HU-02 / RF-04 — Abono mensual y porcentajes de pago por máquina (RT de Calle y Firmante).
#
#   bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-04-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos
# de demostración: bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Entra como demo.admin, demo.secretaria y un RT temporal (demo.rt.pago, se borra al terminar); al terminar devuelve la máquina a 60 % / 25 % sin abono y borra su historial de prueba.
# BASE_URL por defecto http://127.0.0.1:3050 (la API directa).

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
http() { # http <token> <metodo> <ruta> [cuerpo] → código en $CODE, cuerpo en $TMP/r.json
  if [ -n "${4:-}" ]; then printf '%s' "$4" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" "$BASE_URL$3")"; fi
}

echo "== HU-02 / RF-04 contra $BASE_URL"
# Los RT de la demo no tienen clave: se crea uno temporal con login para probar el 403 y se borra al terminar.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario='demo.rt.pago'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.pago','demo.rt.pago','rt_calle','$HASH')" >/dev/null
ADMIN="$(login demo.admin)"; SEC="$(login demo.secretaria)"; RT="$(login demo.rt.pago)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
EDIF="$(sql "select id from consorcios where nombre='DEMO Rivadavia 1234'")"
MAQ="$(sql "select id from maquinas where consorcio_id='$EDIF' order by referencia_agc limit 1")"
[ -n "$EDIF" ] && [ -n "$MAQ" ] || { echo "  ❌ falta el edificio DEMO Rivadavia 1234: corré RF-02-datos-demo.sh"; exit 1; }
URL="/api/consorcios/$EDIF/maquinas/$MAQ/pago"
limpiar() { sql "update maquinas set abono_mensual=null, porcentaje_rt=60, porcentaje_firmante=25 where id='$MAQ'" >/dev/null; sql "delete from maquinas_pago_historial where maquina_id='$MAQ'" >/dev/null; }
limpiar

echo "1. Una máquina arranca con 60 % para el RT de Calle, 25 % para el Firmante y sin abono"
http "$ADMIN" GET "$URL"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.porcentajeRt+"|"+b.porcentajeFirmante+"|"+b.abonoMensual')" = "60|25|null" ] && pass "60 | 25 | sin abono" || fail "GET → $CODE $(cat "$TMP/r.json")"

echo "2. La Secretaría edita el abono y los porcentajes"
http "$SEC" PUT "$URL" '{"abonoMensual":200000,"porcentajeRt":50,"porcentajeFirmante":30}'
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.pago.abonoMensual+"|"+b.pago.porcentajeRt+"|"+b.pago.porcentajeFirmante')" = "200000|50|30" ] && pass "PUT → 200 y quedan 200000 | 50 | 30" || fail "PUT → $CODE $(cat "$TMP/r.json")"
[ "$(sql "select porcentaje_rt||'|'||porcentaje_firmante||'|'||abono_mensual from maquinas where id='$MAQ'")" = "50.00|30.00|200000.00" ] && pass "quedó guardado en la base" || fail "la base no refleja el cambio"

echo "3. Cada cambio queda registrado con quién, cuándo, valor anterior y nuevo"
http "$ADMIN" GET "$URL/historial"
[ "$(json "$TMP/r.json" 'b.length')" = "3" ] && [ "$(json "$TMP/r.json" 'b.every(c=>c.usuario==="demo.secretaria"&&c.fecha)')" = "true" ] && pass "3 cambios, todos de demo.secretaria y con fecha" || fail "historial: $(cat "$TMP/r.json")"
[ "$(json "$TMP/r.json" 'b.find(c=>c.campo==="porcentaje_rt").valorAnterior+">"+b.find(c=>c.campo==="porcentaje_rt").valorNuevo')" = "60>50" ] && pass "porcentaje del RT: 60 → 50" || fail "no figura 60 → 50"

echo "4. Los topes: cada porcentaje entre 0 y 100 y la suma no más de 100"
http "$ADMIN" PUT "$URL" '{"porcentajeRt":101}'
[ "$CODE" = "400" ] && pass "101 % → 400" || fail "101 % → $CODE"
http "$ADMIN" PUT "$URL" '{"porcentajeRt":-1}'
[ "$CODE" = "400" ] && pass "-1 % → 400" || fail "-1 % → $CODE"
http "$ADMIN" PUT "$URL" '{"porcentajeRt":80}'
[ "$CODE" = "400" ] && grep -q "80 + 30 = 110" "$TMP/r.json" && pass "80 % + 30 % = 110 → 400 con el motivo" || fail "suma 110 → $CODE $(cat "$TMP/r.json")"
http "$ADMIN" PUT "$URL" '{"porcentajeRt":70}'
[ "$CODE" = "200" ] && pass "70 % + 30 % = 100 → 200 (el tope exacto es válido)" || fail "suma 100 → $CODE"

echo "5. La liquidación usa lo guardado en la máquina"
http "$ADMIN" PUT "$URL" '{"porcentajeRt":50}'
http "$ADMIN" POST "/api/visitas-fallidas/liquidar-maquina" "{\"consorcioId\":\"$EDIF\",\"maquinaId\":\"$MAQ\",\"referenciaAgc\":\"M1\",\"montoBase\":1}"
[ "$(json "$TMP/r.json" 'b.montoBase+"|"+b.origenAbono+"|"+b.montoRt+"|"+b.montoFirmante')" = "200000|maquina|100000|60000" ] && pass "abono 200000 → RT 100000 (50 %) y Firmante 60000 (30 %)" || fail "liquidación: $(cat "$TMP/r.json")"

echo "6. El RT de Calle no ve ni edita el pago"
http "$RT" GET "$URL"; [ "$CODE" = "403" ] && pass "RT ve → 403" || fail "RT ve → $CODE"
http "$RT" PUT "$URL" '{"abonoMensual":1}'; [ "$CODE" = "403" ] && pass "RT edita → 403" || fail "RT edita → $CODE"

limpiar
sql "delete from usuarios where usuario='demo.rt.pago'" >/dev/null
echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

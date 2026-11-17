#!/usr/bin/env bash
# HU-01 / RF-04 — Horarios de atención por edificio editables por la Secretaría.
#
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-04-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Entra como demo.secretaria y un RT temporal (demo.rt.horarios, se borra al terminar); crea un edificio temporal y lo borra.
# BASE_URL por defecto http://127.0.0.1:3050 (la API directa).

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
TMP="$(mktemp -d)"
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
EDIF=""
limpiar() { [ -n "$EDIF" ] && sql "delete from consorcios where id='$EDIF'" >/dev/null; sql "delete from usuarios where usuario='demo.rt.horarios'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-01 / RF-04 contra $BASE_URL"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario='demo.rt.horarios'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.horarios','demo.rt.horarios','rt_calle','$HASH')" >/dev/null
SEC="$(login demo.secretaria)"; RT="$(login demo.rt.horarios)"
{ [ -n "$SEC" ] && [ "$SEC" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
http "$SEC" POST /api/consorcios '{"nombre":"DEMO RF04 horarios","direccion":"Calle Horarios 1","maquinas":[{"referenciaAgc":"M1"}]}'
EDIF="$(json "$TMP/r.json" 'b.id')"
[ -n "$EDIF" ] && [ "$EDIF" != "undefined" ] || { echo "  ❌ no pude crear el edificio de prueba"; exit 1; }
URL="/api/consorcios/$EDIF/horarios"
DOS='[{"desde":"08:00","hasta":"12:00"},{"desde":"17:00","hasta":"20:00"}]'

echo "1. Un edificio nuevo arranca de lunes a viernes de 08:00 a 12:00 y de 17:00 a 20:00"
http "$SEC" GET "$URL"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.porDefecto+"|"+Object.keys(b.franjas).join(",")+"|"+JSON.stringify(b.franjas.viernes)')" = 'true|lunes,martes,miercoles,jueves,viernes|[{"desde":"08:00","hasta":"12:00"},{"desde":"17:00","hasta":"20:00"}]' ] && pass "horario por defecto de lunes a viernes, sin sábado ni domingo" || fail "por defecto: $(head -c 300 "$TMP/r.json")"

echo "2. La Secretaría edita hasta 2 franjas por día; las inválidas se rechazan con 400"
http "$SEC" PUT "$URL" "{\"franjas\":{\"lunes\":$DOS,\"sabado\":[{\"desde\":\"09:00\",\"hasta\":\"13:00\"}]}}"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.actualizadoPor+"|"+b.porDefecto+"|"+JSON.stringify(b.franjas.sabado)')" = 'demo.secretaria|false|[{"desde":"09:00","hasta":"13:00"}]' ] && pass "PUT → 200; quedan las franjas por día y quién las editó" || fail "PUT → $CODE $(head -c 300 "$TMP/r.json")"
[ "$(sql "select franjas->'sabado'->0->>'desde' from horarios_edificio where consorcio_id='$EDIF'")" = "09:00" ] && pass "quedaron en la base" || fail "la base no refleja el cambio"
http "$SEC" PUT "$URL" '{"franjas":{"martes":[{"desde":"12:00","hasta":"08:00"}]}}'
[ "$CODE" = "400" ] && grep -q "posterior a la de inicio" "$TMP/r.json" && pass "fin anterior al inicio → 400 con el motivo" || fail "fin anterior → $CODE"
http "$SEC" PUT "$URL" '{"franjas":{"martes":[{"desde":"08:00","hasta":"12:00"},{"desde":"11:00","hasta":"14:00"}]}}'
[ "$CODE" = "400" ] && grep -q "se superponen" "$TMP/r.json" && pass "franjas superpuestas → 400 con el motivo" || fail "superpuestas → $CODE"
http "$SEC" PUT "$URL" "{\"franjas\":{\"martes\":[{\"desde\":\"08:00\",\"hasta\":\"09:00\"},{\"desde\":\"10:00\",\"hasta\":\"11:00\"},{\"desde\":\"12:00\",\"hasta\":\"13:00\"}]}}"
[ "$CODE" = "400" ] && grep -q "como máximo 2" "$TMP/r.json" && pass "3 franjas en un día → 400" || fail "3 franjas → $CODE"
http "$SEC" GET "$URL"
[ "$(json "$TMP/r.json" 'JSON.stringify(b.franjas.martes)')" = "undefined" ] && pass "lo rechazado no cambió nada" || fail "se guardó algo inválido"
http "$RT" PUT "$URL" '{"aCoordinar":true}'; [ "$CODE" = "403" ] && pass "el RT no edita (403)" || fail "RT edita → $CODE"
http "$RT" GET "$URL"; [ "$CODE" = "403" ] || [ "$CODE" = "404" ] && pass "un RT que no tiene el edificio asignado no lo ve ($CODE)" || fail "RT sin asignar ve → $CODE"

echo "3. «A coordinar» reemplaza las franjas"
http "$SEC" PUT "$URL" '{"aCoordinar":true}'
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.aCoordinar+"|"+JSON.stringify(b.franjas)')" = "true|{}" ] && pass "PUT aCoordinar → 200 y las franjas quedan vacías" || fail "aCoordinar → $CODE $(head -c 200 "$TMP/r.json")"

echo "4. La API informa si está abierto en un momento dado (los feriados cuentan como cerrado)"
http "$SEC" PUT "$URL" "{\"franjas\":{\"lunes\":$DOS,\"martes\":$DOS}}" >/dev/null
abierto() { http "$SEC" GET "$URL/abierto?en=$1"; json "$TMP/r.json" 'b.abierto+"|"+b.motivo'; }
[ "$(abierto '2026-11-17T10:00:00-03:00')" = "true|dentro_de_franja" ] && pass "martes 17/11 10:00 → abierto" || fail "martes 10:00"
[ "$(abierto '2026-11-17T12:00:00-03:00')" = "false|fuera_de_franja" ] && pass "martes 12:00 → cerrado (el fin de la franja no cuenta)" || fail "martes 12:00"
[ "$(abierto '2026-11-17T17:00:00-03:00')" = "true|dentro_de_franja" ] && pass "martes 17:00 → abierto (el inicio sí cuenta)" || fail "martes 17:00"
[ "$(abierto '2026-11-18T10:00:00-03:00')" = "false|dia_cerrado" ] && pass "miércoles (sin franjas en este horario) → cerrado" || fail "miércoles"
[ "$(abierto '2026-11-23T10:00:00-03:00')" = "false|feriado" ] && pass "lunes 23/11/2026 (feriado) → cerrado aunque el lunes tenga franjas" || fail "feriado"
http "$SEC" PUT "$URL" '{"aCoordinar":true}' >/dev/null
[ "$(abierto '2026-11-17T10:00:00-03:00')" = "false|a_coordinar" ] && pass "«A coordinar» → no está abierto" || fail "a coordinar"
http "$SEC" GET "$URL/abierto?en=ayer"; [ "$CODE" = "400" ] && pass "un momento que no es una fecha → 400" || fail "en inválido → $CODE"
http "$SEC" GET /api/feriados; [ "$(json "$TMP/r.json" 'b.feriados.includes("2026-11-23")')" = "true" ] && pass "GET /api/feriados lista los feriados considerados" || fail "feriados"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

#!/usr/bin/env bash
# HU-02 / RF-06 — Asignar, cambiar o quitar la terna de un edificio actualiza de inmediato la vista de firma.
#
#   bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-06-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos
# de demostración de HU-04: bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Entra como demo.admin, demo.secretaria y dos Firmantes de prueba (los crea y los borra al terminar).
# No deja datos: devuelve la terna del edificio DEMO Sin ubicacion como estaba. BASE_URL por defecto http://127.0.0.1:3050.
#
# El criterio 6 (arranque de la API) no se puede probar desde un script: ver el paso «A mano» al final.

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
# Las máquinas de la vista de firma de un edificio, vistas por un token: "codigo:rt:firmante;…"
maquinas_de() { http "$1" GET "/api/firmante/maquinas"; json "$TMP/r.json" "b.filter(m=>m.consorcioId==='$EDIF').map(m=>m.codigoAGC+':'+m.rtCalle+':'+m.firmanteUsername).sort().join(';')"; }
terna() { printf '{"rtCalle":{"nombre":"%s","telefono":"11 5555-0000"},"firmante":{"nombre":"%s","telefono":"11 5555-1111"},"eca":{"nombre":"ECA Demo","email":"e@demo.com"}}' "$1" "$2"; }

echo "== HU-02 / RF-06 contra $BASE_URL"
ADMIN="$(login demo.admin)"; SEC="$(login demo.secretaria)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
EDIF="$(sql "select id from consorcios where nombre='DEMO Sin ubicacion'")"
[ -n "$EDIF" ] || { echo "  ❌ falta el edificio DEMO Sin ubicacion: corré RF-02-datos-demo.sh"; exit 1; }
http "$SEC" GET "/api/consorcios/$EDIF/roles"
cp "$TMP/r.json" "$TMP/terna-original.json"
for u in demo.firmante.a demo.firmante.b; do
  http "$ADMIN" POST "/api/usuarios" "{\"usuario\":\"$u\",\"nombre\":\"$u\",\"rol\":\"firmante\",\"password\":\"Demo-Clave-2026\"}"
done
FA="$(login demo.firmante.a)"; FB="$(login demo.firmante.b)"
{ [ -n "$FA" ] && [ "$FA" != "undefined" ] && [ -n "$FB" ] && [ "$FB" != "undefined" ]; } || { echo "  ❌ no pude crear los Firmantes de prueba"; exit 1; }

echo "1. Con una terna asignada, el Firmante de la terna ve las máquinas del edificio y otro Firmante no"
http "$SEC" PUT "/api/consorcios/$EDIF/roles" "$(terna rt.carla demo.firmante.a)"
[ "$CODE" = "200" ] && pass "PUT terna → 200" || fail "PUT terna → $CODE $(cat "$TMP/r.json")"
[ "$(maquinas_de "$FA")" = "M1:rt.carla:demo.firmante.a;M2:rt.carla:demo.firmante.a" ] && pass "el Firmante A ve M1 y M2 del edificio, con rt.carla" || fail "Firmante A ve: $(maquinas_de "$FA")"
[ -z "$(maquinas_de "$FB")" ] && pass "el Firmante B no ve ninguna" || fail "Firmante B ve: $(maquinas_de "$FB")"

echo "2. Cambiar el Firmante en la terna se ve en la siguiente consulta"
http "$SEC" PUT "/api/consorcios/$EDIF/roles" "$(terna rt.carla demo.firmante.b)"
[ -z "$(maquinas_de "$FA")" ] && pass "el Firmante A dejó de ver sus máquinas" || fail "A todavía ve: $(maquinas_de "$FA")"
[ "$(maquinas_de "$FB")" = "M1:rt.carla:demo.firmante.b;M2:rt.carla:demo.firmante.b" ] && pass "el Firmante B las ve" || fail "B ve: $(maquinas_de "$FB")"

echo "3. Cambiar el RT de Calle se ve en la vista de firma"
http "$SEC" PUT "/api/consorcios/$EDIF/roles" "$(terna rt.diego demo.firmante.b)"
[ "$(maquinas_de "$FB")" = "M1:rt.diego:demo.firmante.b;M2:rt.diego:demo.firmante.b" ] && pass "las máquinas pasaron a rt.diego" || fail "B ve: $(maquinas_de "$FB")"
http "$SEC" GET "/api/backoffice/monitoreo"
[ "$(json "$TMP/r.json" "JSON.stringify(b).includes('rt.diego')")" = "true" ] && pass "el Monitoreo de la Secretaría también muestra a rt.diego" || fail "Monitoreo sin rt.diego"

echo "3b. Reasignar el RT desde el Semáforo también se ve en la vista de firma"
http "$SEC" POST "/api/semaforo/$EDIF/reasignacion" '{"rtAnterior":"rt.diego","rtNuevo":"rt.ana","fecha":"2026-11-25"}'
[ "$CODE" = "201" ] && pass "reasignación rt.diego → rt.ana → 201" || fail "reasignación → $CODE $(cat "$TMP/r.json")"
[ "$(maquinas_de "$FB")" = "M1:rt.ana:demo.firmante.b;M2:rt.ana:demo.firmante.b" ] && pass "las máquinas pasaron a rt.ana sin tocar la terna a mano" || fail "B ve: $(maquinas_de "$FB")"

echo "4. Un Firmante que ya no es el de la terna no puede autorizar ni rechazar sus máquinas (404)"
MAQ="$(http "$FB" GET "/api/firmante/maquinas"; json "$TMP/r.json" "b.find(m=>m.consorcioId==='$EDIF').id")"
http "$FA" POST "/api/firmante/autorizar" "{\"maquinaId\":\"$MAQ\"}"
[ "$CODE" = "404" ] && pass "autorizar → 404" || fail "autorizar → $CODE"
http "$FA" POST "/api/firmante/rechazar" "{\"maquinaId\":\"$MAQ\",\"motivo\":\"prueba\"}"
[ "$CODE" = "404" ] && pass "rechazar → 404" || fail "rechazar → $CODE"

echo "5. Quitar la terna saca las máquinas de la vista de firma"
http "$SEC" DELETE "/api/consorcios/$EDIF/roles"
[ "$CODE" = "204" ] && pass "DELETE terna → 204" || fail "DELETE terna → $CODE"
[ -z "$(maquinas_de "$FB")" ] && [ -z "$(maquinas_de "$SEC")" ] && pass "ni el Firmante ni la Secretaría ven máquinas de ese edificio" || fail "todavía hay máquinas"

echo "Dejando los datos como estaban…"
http "$SEC" PUT "/api/consorcios/$EDIF/roles" "$(node -e 'const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify({rtCalle:t.rtCalle,firmante:t.firmante,eca:t.eca}))' "$TMP/terna-original.json")"
[ "$CODE" = "200" ] && pass "terna original restaurada" || fail "no pude restaurar la terna: $CODE"
sql "delete from reasignaciones_rt where consorcio_id='$EDIF'" >/dev/null
sql "delete from usuarios where usuario in ('demo.firmante.a','demo.firmante.b')" >/dev/null

echo
echo "A mano (criterio 6): reiniciá la API y entrá como demo.secretaria a Portal Firmante: tienen que verse las máquinas de los 5 edificios DEMO, con su terna."
echo "== Resultado: $OK bien, $KO mal"
[ "$KO" -eq 0 ]

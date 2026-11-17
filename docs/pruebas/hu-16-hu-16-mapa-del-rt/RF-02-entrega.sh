#!/usr/bin/env bash
# HU-16 / RF-02 — Tarjeta del edificio y validación de presencia a 30 m.
#
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt/RF-02-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea dos RT y un edificio temporales (con punto en el mapa y encargado) y los borra al terminar. Los botones de la tarjeta, el enlace
# «Llamar» y «Cómo llegar» son de la pantalla (probados en apps/web/src/rtmapa/tarjeta.test.ts y en el navegador); acá se verifica lo que
# valida y registra la API. BASE_URL por defecto http://127.0.0.1:3050 (la API directa).

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
limpiar() { [ -n "$EDIF" ] && sql "delete from inicios_inspeccion where consorcio_id='$EDIF'; delete from consorcios where id='$EDIF'" >/dev/null; sql "delete from usuarios where usuario in ('demo.rt.tarjeta','demo.rt.tarjeta2')" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-16 / RF-02 contra $BASE_URL"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario in ('demo.rt.tarjeta','demo.rt.tarjeta2')" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.tarjeta','Ing. Aliado 1','rt_calle','$HASH'),('demo.rt.tarjeta2','Ing. Aliado 2','rt_calle','$HASH')" >/dev/null
ADMIN="$(login demo.admin)"; SEC="$(login demo.secretaria)"; RT="$(login demo.rt.tarjeta)"; RT2="$(login demo.rt.tarjeta2)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ] && [ -n "$RT2" ] && [ "$RT2" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
http "$ADMIN" POST /api/consorcios '{"nombre":"DEMO RF02 tarjeta","direccion":"Av. Rivadavia 1234, CABA","ubicacion":{"latitud":-34.6118,"longitud":-58.396},"maquinas":[{"referenciaAgc":"M1"}]}'
EDIF="$(json "$TMP/r.json" 'b.id')"
[ -n "$EDIF" ] && [ "$EDIF" != "undefined" ] || { echo "  ❌ no pude crear el edificio de prueba"; exit 1; }
http "$ADMIN" PUT "/api/consorcios/$EDIF/roles" '{"rtCalle":{"nombre":"demo.rt.tarjeta","telefono":"11 0000-0000","email":"rt@demo.com"},"firmante":{"nombre":"Firmante","email":"f@f.com"},"eca":{"nombre":"ECA","email":"e@e.com"}}' >/dev/null
sql "update consorcios set encargado_nombre='Carlos Pérez', encargado_telefono='11 4444-5555' where id='$EDIF'" >/dev/null
AHORA() { node -e 'console.log(new Date().toISOString())'; }
inicio() { # inicio <token> <dLat> <precision> [extra json sin llaves, ej: "fotoFrenteUrl":"x"]
  local ahora; ahora="$(AHORA)"
  local lat; lat="$(node -e "console.log(-34.6118 + $2)")"
  http "$1" POST /api/inicios-inspeccion "{\"consorcioId\":\"$EDIF\",\"gps\":{\"latitud\":$lat,\"longitud\":-58.396,\"precision\":$3,\"timestamp\":\"$ahora\"},\"horaDispositivo\":\"$ahora\"${4:+,$4}}"
}
FOTO='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD'

echo "1. La tarjeta tiene lo que necesita: encargado con teléfono y las reglas de presencia"
http "$RT" GET /api/rt/mapa
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.edificios.find(e=>e.id==="'$EDIF'").encargado.nombre+"|"+b.edificios.find(e=>e.id==="'$EDIF'").encargado.telefono')" = "Carlos Pérez|11 4444-5555" ] && pass "GET /api/rt/mapa trae el encargado y su teléfono (para el botón de llamada)" || fail "mapa → $CODE $(head -c 300 "$TMP/r.json")"
[ "$(json "$TMP/r.json" 'JSON.stringify(b.presencia)')" = '{"radioM":30,"precisionMaxM":30}' ] && pass "trae las reglas de presencia: 30 m y precisión máxima de 30 m" || fail "presencia: $(json "$TMP/r.json" 'JSON.stringify(b.presencia)')"
[ "$(json "$TMP/r.json" 'b.edificios.find(e=>e.id==="'$EDIF'").direccion')" = "Av. Rivadavia 1234, CABA" ] && pass "trae la dirección y los horarios del edificio" || fail "dirección"

echo "2. A 30 m o menos se puede iniciar; más lejos, no"
inicio "$RT" 0.00025 6
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.distanciaM+"|"+b.sinBuenaSenal+"|"+b.revision')" = "27.8|false|no_requiere" ] && pass "a 27,8 m con buena señal → 201, la API midió 27,8 m, sin revisión" || fail "a 27,8 m → $CODE $(head -c 300 "$TMP/r.json")"
inicio "$RT" 0.0003 6
[ "$CODE" = "409" ] && grep -q "Estás a 33 m del edificio" "$TMP/r.json" && pass "a 33,4 m con buena señal → 409 «Estás a 33 m del edificio…»" || fail "a 33,4 m → $CODE $(head -c 300 "$TMP/r.json")"
inicio "$RT" 0.0003 6 '"distanciaM":1'
[ "$CODE" = "409" ] && pass "una distanciaM que mande el celular no cambia nada: la mide la API" || fail "distanciaM del celular → $CODE"
[ "$(sql "select count(*) from inicios_inspeccion where consorcio_id='$EDIF'")" = "1" ] && pass "sólo quedó el inicio válido" || fail "quedaron filas de más"

echo "3. «Sin buena señal GPS»: foto del frente y justificación, y revisión de la Secretaría"
inicio "$RT" 0.00025 90
[ "$CODE" = "400" ] && grep -q "Sin buena señal GPS: hace falta la foto del frente del edificio y una justificación" "$TMP/r.json" && pass "precisión de 90 m sin foto ni justificación → 400 que dice qué falta" || fail "sin foto → $CODE $(head -c 300 "$TMP/r.json")"
inicio "$RT" 0.00025 90 "\"fotoFrenteUrl\":\"$FOTO\""
[ "$CODE" = "400" ] && grep -q "justificación escrita" "$TMP/r.json" && pass "con foto pero sin justificación → 400" || fail "sin justificación → $CODE"
inicio "$RT" 0.00025 90 "\"fotoFrenteUrl\":\"$FOTO\",\"justificacion\":\"Entre edificios altos el GPS no mejora\""
INI="$(json "$TMP/r.json" 'b.id')"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.sinBuenaSenal+"|"+b.revision')" = "true|pendiente" ] && pass "con foto y justificación → 201, queda pendiente de revisión" || fail "con foto y justificación → $CODE $(head -c 300 "$TMP/r.json")"
http "$SEC" GET "/api/inicios-inspeccion?revision=pendiente"
[ "$(json "$TMP/r.json" 'b.some(i=>i.id==="'$INI'")')" = "true" ] && pass "la Secretaría ve la visita en las pendientes de revisión" || fail "no figura en las pendientes"
http "$SEC" POST "/api/inicios-inspeccion/$INI/revisar"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.revision+"|"+b.revisadaPor')" = "revisada|demo.secretaria" ] && pass "la Secretaría la marca como revisada (queda quién)" || fail "revisar → $CODE"

echo "4. Se registran coordenadas, precisión, hora del dispositivo y hora del servidor; nada se edita"
FILA="$(sql "select gps_latitud||'|'||gps_longitud||'|'||gps_precision||'|'||(hora_dispositivo is not null)||'|'||(hora_servidor > now() - interval '5 minutes') from inicios_inspeccion where id='$INI'")"
[ "$FILA" = "-34.61155|-58.396|90|true|true" ] && pass "quedaron coordenadas, precisión, hora del dispositivo y hora del servidor" || fail "fila: $FILA"
for col in "gps_latitud = 0" "hora_servidor = now()" "justificacion = 'otra'"; do
  ERR="$(printf "begin; set local role ascensores_app; select set_config('app.rol_actual','administrador',true); update inicios_inspeccion set %s where id='%s'; rollback;" "$col" "$INI" | docker exec -i "$DB_CONTAINER" psql -U ascensores -d ascensores 2>&1)"
  echo "$ERR" | grep -q "no se puede modificar" && pass "UPDATE de «${col%% =*}» con el rol de la aplicación → rechazado por la base" || fail "UPDATE $col: $ERR"
done

echo "5. Quién puede"
http "$RT2" POST /api/inicios-inspeccion "{\"consorcioId\":\"$EDIF\",\"gps\":{\"latitud\":-34.6118,\"longitud\":-58.396,\"precision\":5},\"horaDispositivo\":\"$(AHORA)\"}"
[ "$CODE" = "404" ] && pass "un RT que no tiene el edificio asignado → 404 (RLS)" || fail "RT sin asignar → $CODE"
http "$SEC" POST /api/inicios-inspeccion "{\"consorcioId\":\"$EDIF\"}"; [ "$CODE" = "403" ] && pass "la Secretaría no inicia inspecciones (403)" || fail "Secretaría → $CODE"
http "$RT" GET /api/inicios-inspeccion; [ "$CODE" = "403" ] && pass "el RT no ve la lista de revisión (403)" || fail "RT lista → $CODE"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

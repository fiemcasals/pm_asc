#!/usr/bin/env bash
# HU-07 / RF-06 — Constancia de visita fallida del RT de Calle: causa de una lista, foto, GPS y hora, y el pin sale por el día.
#
#   bash docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-06-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea un edificio y un RT temporales (demo.rt.constancia) y los borra al terminar. BASE_URL por defecto http://127.0.0.1:3050.

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
limpiar() { [ -n "$EDIF" ] && { sql "delete from visitas_fallidas where consorcio_id='$EDIF'" >/dev/null; sql "delete from consorcios where id='$EDIF'" >/dev/null; }; sql "delete from usuarios where usuario='demo.rt.constancia'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-07 / RF-06 contra $BASE_URL"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario='demo.rt.constancia'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.constancia','demo.rt.constancia','rt_calle','$HASH')" >/dev/null
ADMIN="$(login demo.admin)"; RT="$(login demo.rt.constancia)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
http "$ADMIN" POST /api/consorcios '{"nombre":"DEMO RF06 constancia","direccion":"Calle Constancia 1","maquinas":[{"referenciaAgc":"M1"}]}'
EDIF="$(json "$TMP/r.json" 'b.id')"
http "$ADMIN" PUT "/api/consorcios/$EDIF/roles" '{"rtCalle":{"nombre":"demo.rt.constancia","telefono":"11 0000-0000","email":"rt@demo.com"},"firmante":{"nombre":"Firmante","email":"f@f.com"},"eca":{"nombre":"ECA","email":"e@e.com"}}'
[ "$CODE" = "200" ] || { echo "  ❌ no pude armar el edificio de prueba ($CODE)"; exit 1; }
FOTO='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD'
cuerpo() { printf '{"consorcioId":"%s","causa":"%s","fotoFrenteUrl":"%s","gps":{"latitud":-34.6118,"longitud":-58.396,"precision":11.5},"horaDispositivo":"%s"}' "$EDIF" "$1" "$FOTO" "${2:-2026-11-16T10:00:00.000Z}"; }

echo "1. La causa se elige de una lista que sale de la configuración; la de por defecto es «Encargado o responsable ausente»"
http "$RT" GET /api/visitas-fallidas/causas
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.porDefecto')" = "Encargado o responsable ausente" ] && pass "GET causas → por defecto «Encargado o responsable ausente»" || fail "causas → $CODE $(cat "$TMP/r.json")"
http "$RT" POST /api/visitas-fallidas "{\"consorcioId\":\"$EDIF\",\"fotoFrenteUrl\":\"$FOTO\",\"gps\":{\"latitud\":-34.6,\"longitud\":-58.4},\"horaDispositivo\":\"2026-11-16T10:00:00Z\"}"
[ "$CODE" = "400" ] && pass "sin causa → 400" || fail "sin causa → $CODE"
http "$RT" POST /api/visitas-fallidas "$(cuerpo 'Me dio fiaca')"
[ "$CODE" = "400" ] && pass "una causa que no está en la lista → 400" || fail "causa inventada → $CODE"
[ "$(sql "select count(*) from visitas_fallidas where consorcio_id='$EDIF'")" = "0" ] && pass "no quedó ninguna constancia" || fail "se guardó algo sin causa válida"

echo "2. El RT registra la constancia: GPS, precisión, hora del dispositivo y hora del servidor"
http "$RT" POST /api/visitas-fallidas "$(cuerpo 'Encargado o responsable ausente')"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.numeroAdvertencia')" = "1" ] && pass "POST → 201, advertencia 1" || fail "registrar → $CODE $(cat "$TMP/r.json")"
FILA="$(sql "select motivo||'|'||inspector||'|'||gps_latitud||'|'||gps_precision||'|'||to_char(hora_dispositivo at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI')||'|'||(fecha_hora > now() - interval '1 minute') from visitas_fallidas where consorcio_id='$EDIF'")"
[ "$FILA" = "Encargado o responsable ausente|demo.rt.constancia|-34.6118|11.5|2026-11-16T10:00|true" ] && pass "quedaron causa, inspector (el de la sesión), GPS, precisión, hora del dispositivo y hora del servidor de ahora" || fail "fila: $FILA"

echo "3. El pin desaparece del recorrido del RT por ese día; un segundo intento se rechaza con el motivo"
http "$RT" GET /api/recorrido
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.some(e=>e.id==="'$EDIF'")')" = "false" ] && pass "el edificio ya no está en la lista del RT" || fail "recorrido RT: $(cat "$TMP/r.json" | head -c 200)"
http "$ADMIN" GET /api/recorrido
[ "$(json "$TMP/r.json" 'b.find(e=>e.id==="'$EDIF'").visitaFallidaHoy')" = "true" ] && pass "el Administrador lo sigue viendo, marcado como visita fallida de hoy" || fail "recorrido admin"
http "$RT" POST /api/visitas-fallidas "$(cuerpo 'Encargado o responsable ausente')"
[ "$CODE" = "409" ] && grep -q "ya tiene una visita fallida de hoy" "$TMP/r.json" && pass "segundo intento → 409 con el motivo" || fail "segundo intento → $CODE $(cat "$TMP/r.json")"
[ "$(sql "select count(*) from visitas_fallidas where consorcio_id='$EDIF'")" = "1" ] && pass "el contador sigue en 1" || fail "se sumó otra advertencia"

echo "4. La constancia no se puede editar (ni GPS, ni hora, ni foto, ni causa)"
ERR="$(printf "begin; set local role ascensores_app; select set_config('app.rol_actual','administrador',true); update visitas_fallidas set gps_latitud = 0 where consorcio_id='%s'; rollback;" "$EDIF" | docker exec -i "$DB_CONTAINER" psql -U ascensores -d ascensores 2>&1)"
echo "$ERR" | grep -q "no se puede modificar" && pass "UPDATE del GPS con el rol de la aplicación → rechazado por la base" || fail "UPDATE: $ERR"
ERR="$(printf "begin; set local role ascensores_app; select set_config('app.rol_actual','administrador',true); update visitas_fallidas set motivo = 'otra' where consorcio_id='%s'; rollback;" "$EDIF" | docker exec -i "$DB_CONTAINER" psql -U ascensores -d ascensores 2>&1)"
echo "$ERR" | grep -q "no se puede modificar" && pass "UPDATE de la causa → rechazado" || fail "UPDATE causa: $ERR"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

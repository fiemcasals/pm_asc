#!/usr/bin/env bash
# HU-16 / RF-01 — Mapa del RT con pines por horario (datos que arma la API para la pantalla inicial del RT).
#
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt/RF-01-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea dos RT temporales (demo.rt.mapa y demo.rt.mapa2) y cuatro edificios, y los borra al terminar. El color de cada pin y el cambio
# de color al cruzar una franja los calcula la pantalla (probado en apps/web/src/rtmapa/colorPin.test.ts); acá se verifica lo que
# manda la API: nombre, zona, hora del servidor, feriados, horarios y qué edificios aparecen.
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
IDS=()
limpiar() {
  for id in "${IDS[@]}"; do sql "delete from visitas_fallidas where consorcio_id='$id'; delete from inspecciones_checklist where consorcio_id='$id'; delete from consorcios where id='$id'" >/dev/null; done
  sql "delete from usuarios where usuario in ('demo.rt.mapa','demo.rt.mapa2')" >/dev/null; rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-16 / RF-01 contra $BASE_URL"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario in ('demo.rt.mapa','demo.rt.mapa2')" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.mapa','Ing. Aliado 1','rt_calle','$HASH'),('demo.rt.mapa2','Ing. Aliado 2','rt_calle','$HASH')" >/dev/null
ADMIN="$(login demo.admin)"; RT="$(login demo.rt.mapa)"; RT2="$(login demo.rt.mapa2)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ] && [ -n "$RT2" ] && [ "$RT2" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
RTID="$(sql "select id from usuarios where usuario='demo.rt.mapa'")"
edificio() { # edificio <nombre> <lat> <lng> <rt> → id en stdout
  http "$ADMIN" POST /api/consorcios "{\"nombre\":\"DEMO RF01 $1\",\"direccion\":\"Calle $1 1\",\"ubicacion\":{\"latitud\":$2,\"longitud\":$3},\"maquinas\":[{\"referenciaAgc\":\"M1\"},{\"referenciaAgc\":\"M2\"}]}"
  local id; id="$(json "$TMP/r.json" 'b.id')"
  http "$ADMIN" PUT "/api/consorcios/$id/roles" "{\"rtCalle\":{\"nombre\":\"$4\",\"telefono\":\"11 0000-0000\",\"email\":\"rt@demo.com\"},\"firmante\":{\"nombre\":\"Firmante\",\"email\":\"f@f.com\"},\"eca\":{\"nombre\":\"ECA\",\"email\":\"e@e.com\"}}" >/dev/null
  echo "$id"
}
E1="$(edificio Uno -34.6118 -58.396 demo.rt.mapa)"; IDS+=("$E1")
E2="$(edificio Dos -34.58 -58.42 demo.rt.mapa)"; IDS+=("$E2")
E3="$(edificio Tres -34.62 -58.38 demo.rt.mapa)"; IDS+=("$E3")
E4="$(edificio Ajeno -34.60 -58.40 demo.rt.mapa2)"; IDS+=("$E4")
http "$ADMIN" PUT "/api/consorcios/$E2/horarios" '{"aCoordinar":true}' >/dev/null
http "$ADMIN" PUT "/api/consorcios/$E3/horarios" '{"franjas":{"lunes":[{"desde":"09:00","hasta":"13:00"}]}}' >/dev/null
ids() { http "$RT" GET /api/rt/mapa; json "$TMP/r.json" 'b.edificios.map(e=>e.id).sort().join(",")'; }
ESPERADOS="$(printf '%s\n' "$E1" "$E2" "$E3" | sort | paste -sd,)"

echo "1. Encabezado: nombre, zona y hora del servidor"
http "$ADMIN" PUT "/api/usuarios/$RTID/zona" '{"zona":"Norte"}'
[ "$CODE" = "200" ] && pass "el Administrador carga la zona del RT (PUT /api/usuarios/:id/zona)" || fail "zona → $CODE $(head -c 200 "$TMP/r.json")"
http "$RT" GET /api/rt/mapa
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.rt.nombre+"|"+b.rt.zona')" = "Ing. Aliado 1|Norte" ] && pass "GET /api/rt/mapa trae «Ing. Aliado 1» y la zona «Norte»" || fail "mapa → $CODE $(head -c 200 "$TMP/r.json")"
[ "$(json "$TMP/r.json" 'Math.abs(Date.parse(b.ahora)-Date.now())<10000')" = "true" ] && pass "trae la hora del servidor (para corregir el reloj del celular)" || fail "ahora desfasado"
[ "$(json "$TMP/r.json" 'b.feriados.includes("2026-11-23")')" = "true" ] && pass "trae los feriados" || fail "feriados"
http "$RT" PUT "/api/usuarios/$RTID/zona" '{"zona":"Sur"}'; [ "$CODE" = "403" ] && pass "el RT no cambia su zona (403)" || fail "RT zona → $CODE"

echo "2. Cada edificio trae lo necesario para pintar su pin"
http "$RT" GET /api/rt/mapa
[ "$(json "$TMP/r.json" 'b.edificios.find(e=>e.id==="'$E1'").ubicacion.latitud')" = "-34.6118" ] && pass "la ubicación sale de PostGIS" || fail "ubicación"
[ "$(json "$TMP/r.json" 'Object.keys(b.edificios.find(e=>e.id==="'$E1'").franjas).join(",")')" = "lunes,martes,miercoles,jueves,viernes" ] && pass "un edificio sin editar trae el horario por defecto (lunes a viernes)" || fail "horario por defecto"
[ "$(json "$TMP/r.json" 'b.edificios.find(e=>e.id==="'$E2'").aCoordinar')" = "true" ] && pass "el edificio «A coordinar» viene marcado (pin amarillo)" || fail "a coordinar"
[ "$(json "$TMP/r.json" 'JSON.stringify(b.edificios.find(e=>e.id==="'$E3'").franjas)')" = '{"lunes":[{"desde":"09:00","hasta":"13:00"}]}' ] && pass "el horario editado llega tal cual" || fail "horario editado"

echo "3. El mapa no muestra edificios de otro RT, ni los resueltos en el día, ni los bloqueados"
[ "$(ids)" = "$ESPERADOS" ] && pass "el RT ve sus 3 edificios y no el del otro RT" || fail "edificios: $(ids)"
http "$RT2" GET /api/rt/mapa
[ "$(json "$TMP/r.json" 'b.edificios.map(e=>e.id).join(",")')" = "$E4" ] && pass "el otro RT ve sólo el suyo" || fail "RT2 ve: $(head -c 200 "$TMP/r.json")"
M1="$(sql "select id from maquinas where consorcio_id='$E1' order by referencia_agc limit 1")"; M2="$(sql "select id from maquinas where consorcio_id='$E1' order by referencia_agc offset 1 limit 1")"
sql "insert into inspecciones_checklist (consorcio_id, maquina_id, referencia_agc, tipo_maquina, version_checklist) values ('$E1','$M1','M1','traccion','demo')" >/dev/null
[ "$(ids)" = "$ESPERADOS" ] && pass "con 1 de 2 equipos inspeccionados el edificio sigue en el mapa" || fail "se sacó con la mitad"
sql "insert into inspecciones_checklist (consorcio_id, maquina_id, referencia_agc, tipo_maquina, version_checklist) values ('$E1','$M2','M2','traccion','demo')" >/dev/null
[ "$(ids)" = "$(printf '%s\n' "$E2" "$E3" | sort | paste -sd,)" ] && pass "con todos los equipos inspeccionados hoy el edificio sale del mapa" || fail "no salió al resolverse"
http "$RT" POST /api/visitas-fallidas "{\"consorcioId\":\"$E2\",\"causa\":\"Encargado o responsable ausente\",\"fotoFrenteUrl\":\"data:image/jpeg;base64,AAAA\",\"gps\":{\"latitud\":-34.58,\"longitud\":-58.42,\"precision\":8},\"horaDispositivo\":\"$(node -e 'console.log(new Date().toISOString())')\"}"
[ "$CODE" = "201" ] && [ "$(ids)" = "$E3" ] && pass "con una visita fallida de hoy el edificio sale del mapa" || fail "visita fallida → $CODE; edificios: $(ids)"
sql "alter table visitas_fallidas disable trigger visitas_fallidas_inmutable_trg" >/dev/null
for i in 1 2 3; do sql "insert into visitas_fallidas (id, consorcio_id, consorcio_nombre, direccion, numero_advertencia, motivo, foto_frente_url, gps_latitud, gps_longitud, gps_precision, gps_timestamp, inspector, fecha_hora) values ('demo-rf01-vf-$i','$E3','x','x',$i,'m','f',0,0,1,now() - interval '9 days', 'x', now() - interval '$((6-i)) days')" >/dev/null; done
sql "alter table visitas_fallidas enable trigger visitas_fallidas_inmutable_trg" >/dev/null
[ "$(ids)" = "" ] && pass "con 3 visitas fallidas el edificio está bloqueado y sale del mapa" || fail "bloqueado sigue: $(ids)"
sql "delete from visitas_fallidas where id like 'demo-rf01-vf-%'" >/dev/null

echo "4. Sólo el RT tiene mapa"
http "$ADMIN" GET /api/rt/mapa; [ "$CODE" = "403" ] && pass "el Administrador recibe 403" || fail "admin → $CODE"
curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/rt/mapa" | grep -q 401 && pass "sin sesión → 401" || fail "sin sesión"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

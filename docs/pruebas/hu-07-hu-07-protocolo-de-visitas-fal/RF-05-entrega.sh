#!/usr/bin/env bash
# HU-07 / RF-05 — Edificio bloqueado fuera del recorrido y mínimo 1 día entre visitas fallidas.
#
#   bash docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-05-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos demo de
# HU-04 (bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh, que crea demo.secretaria, demo.admin y los RT).
# Usa el edificio «DEMO Corrientes 100» (RT: rt.beto): para ver su recorrido le pone a rt.beto una clave temporal y al terminar
# se la saca; también borra las visitas, desbloqueos e inspección de prueba. BASE_URL por defecto http://127.0.0.1:3050.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"; trap 'limpiar; rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
limpiar() {
  [ -n "${ID:-}" ] || return 0
  sql "delete from desbloqueos_edificio where consorcio_id='$ID'" >/dev/null
  sql "delete from visitas_fallidas where consorcio_id='$ID'" >/dev/null
  sql "delete from inspecciones_checklist where consorcio_id='$ID'" >/dev/null
  sql "update usuarios set password_hash='sin-login' where usuario='rt.beto'" >/dev/null
  sql "delete from intentos_login where usuario='rt.beto'" >/dev/null
}
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
api() { # api <token> <metodo> <ruta> [cuerpo] → $CODE y $TMP/r.json
  if [ -n "${4:-}" ]; then printf '%s' "$4" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" "$BASE_URL$3")"; fi
}

echo "== HU-07 / RF-05 contra $BASE_URL"
ID="$(sql "select id from consorcios where nombre='DEMO Corrientes 100'")"
[ -n "$ID" ] || { echo "  ❌ falta el edificio DEMO Corrientes 100: corré antes RF-02-datos-demo.sh"; exit 1; }
limpiar
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "update usuarios set password_hash='$HASH' where usuario='rt.beto'" >/dev/null
SEC="$(login demo.secretaria)"; ADMIN="$(login demo.admin)"; RT="$(login rt.beto)"
for t in "$SEC" "$ADMIN" "$RT"; do [ -n "$t" ] && [ "$t" != "undefined" ] || { echo "  ❌ no pude ingresar (¿corriste RF-02-datos-demo.sh?)"; exit 1; }; done
VISITA='{"consorcioId":"'$ID'","fotoFrenteUrl":"https://f/hoy.jpg","gps":{"latitud":-34.6,"longitud":-58.4}}'
fantasma() { sql "insert into visitas_fallidas (id, consorcio_id, consorcio_nombre, direccion, numero_advertencia, motivo, foto_frente_url, gps_latitud, gps_longitud, gps_precision, gps_timestamp, inspector, fecha_hora) values ('VF-RF05-$1', '$ID', 'DEMO Corrientes 100', 'Av. Corrientes 100', $((3-$1)), 'demo', 'https://f/$1.jpg', -34.6, -58.4, 5, now() - interval '$1 days', 'demo', now() - interval '$1 days')" >/dev/null; }

echo "1. Entre dos visitas fallidas del mismo edificio pasa al menos 1 día"
fantasma 2; fantasma 1
api "$SEC" POST /api/visitas-fallidas "$VISITA"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.numeroAdvertencia')" = "3" ] && pass "con visitas de hace 2 y 1 días, la de hoy se registra como Advertencia 3 → 201" || fail "visita de hoy → $CODE $(head -c 200 "$TMP/r.json")"
api "$SEC" POST /api/visitas-fallidas "$VISITA"
[ "$CODE" = "409" ] && pass "una segunda visita fallida el mismo día → 409" || fail "segunda del mismo día → $CODE"
[ "$(sql "select count(*) from visitas_fallidas where consorcio_id='$ID'")" = "3" ] && pass "no sumó advertencia: sigue habiendo 3 visitas fallidas" || fail "se guardó una visita de más"

echo "2. El edificio bloqueado no aparece en la lista de edificios a visitar del RT"
api "$RT" GET /api/recorrido
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.some(e=>e.id==="'$ID'")')" = "false" ] && pass "el recorrido de rt.beto no incluye DEMO Corrientes 100 (bloqueado)" || fail "el RT ve el edificio bloqueado: $CODE $(head -c 200 "$TMP/r.json")"
api "$SEC" GET /api/recorrido
[ "$(json "$TMP/r.json" 'b.find(e=>e.id==="'$ID'").bloqueado')" = "true" ] && pass "la Secretaría lo ve en la lista, marcado como bloqueado" || fail "la Secretaría no lo ve bloqueado"

echo "3. La Secretaría desbloquea con motivo; vuelve al recorrido y queda registrado"
api "$RT" POST "/api/visitas-fallidas/consorcio/$ID/desbloquear" '{"motivo":"quiero entrar"}'
[ "$CODE" = "403" ] && pass "el RT intenta desbloquear → 403" || fail "RT desbloquea → $CODE"
api "$SEC" POST "/api/visitas-fallidas/consorcio/$ID/desbloquear" '{"motivo":"  "}'
[ "$CODE" = "400" ] && pass "sin motivo → 400" || fail "sin motivo → $CODE"
api "$SEC" POST "/api/visitas-fallidas/consorcio/$ID/desbloquear" '{"motivo":"Se coordinó con el administrador"}'
[ "$CODE" = "201" ] && pass "con motivo → 201" || fail "desbloqueo → $CODE $(head -c 200 "$TMP/r.json")"
[ "$(sql "select usuario||'|'||motivo from desbloqueos_edificio where consorcio_id='$ID'")" = "demo.secretaria|Se coordinó con el administrador" ] && pass "en la base queda el desbloqueo con el usuario de la sesión, la fecha y el motivo" || fail "falta el registro del desbloqueo"
api "$RT" GET /api/recorrido
[ "$(json "$TMP/r.json" 'b.some(e=>e.id==="'$ID'")')" = "true" ] && pass "el edificio vuelve al recorrido de rt.beto" || fail "el edificio no volvió al recorrido"
api "$SEC" POST "/api/visitas-fallidas/consorcio/$ID/desbloquear" '{"motivo":"otra vez"}'
[ "$CODE" = "409" ] && pass "desbloquearlo de nuevo (ya no está bloqueado) → 409" || fail "segundo desbloqueo → $CODE"

echo "4. El contador de advertencias vuelve a cero solo con una visita exitosa"
api "$SEC" GET "/api/visitas-fallidas/consorcio/$ID"
[ "$(json "$TMP/r.json" 'b.totalAdvertencias')" = "3" ] && pass "desbloquear no reinició el contador: sigue en 3" || fail "contador tras desbloquear: $(json "$TMP/r.json" 'b.totalAdvertencias')"
api "$ADMIN" GET "/api/consorcios/$ID"; MAQ="$(json "$TMP/r.json" 'b.maquinas[0].id')"
api "$ADMIN" POST /api/checklist/inspecciones "{\"consorcioId\":\"$ID\",\"maquinaId\":\"$MAQ\",\"referenciaAgc\":\"M1\",\"tipoMaquina\":\"traccion\",\"estadoEquipo\":\"en_uso\",\"datos\":{}}"
[ "$CODE" = "201" ] && pass "se registra una inspección (visita exitosa) → 201" || fail "inspección → $CODE $(head -c 200 "$TMP/r.json")"
api "$SEC" GET "/api/visitas-fallidas/consorcio/$ID"
[ "$(json "$TMP/r.json" 'b.totalAdvertencias')" = "0" ] && pass "el contador de advertencias vuelve a 0" || fail "contador tras la inspección: $(json "$TMP/r.json" 'b.totalAdvertencias')"
sql "update visitas_fallidas set fecha_hora = fecha_hora - interval '1 day' where consorcio_id='$ID'" >/dev/null
api "$SEC" POST /api/visitas-fallidas "$VISITA"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.numeroAdvertencia')" = "1" ] && pass "la próxima visita fallida es otra vez Advertencia 1" || fail "tras la visita exitosa → $CODE $(json "$TMP/r.json" 'b.numeroAdvertencia')"

echo; echo "Limpiando las visitas, el desbloqueo, la inspección y la clave temporal de rt.beto…"
echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

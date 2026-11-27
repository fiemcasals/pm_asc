#!/usr/bin/env bash
# HU-19 / RF-09 (REQ-1795778247270) — El chat marca lo que no leíste: contador por conversación, en el menú y en el título de la pestaña.
#
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-09-entrega.sh
#
# Requiere `npm run db:up` y la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET). BASE_URL por defecto http://127.0.0.1:3050.
# Crea usuarios temporales (dos RT, un Firmante, una Secretaría y una ECA) y sus mensajes, y los borra al terminar.
# Lo que se ve en pantalla (el número en el menú, el título de la pestaña, el contador y la negrita en la lista) está en RF-09-entrega.md.

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
idde() { sql "select id from usuarios where usuario = '$1'"; }
# llamar <token|-> <metodo> <ruta> [cuerpo] → código en $CODE y cuerpo en $TMP/r.json
llamar() { local t="$1" m="$2" r="$3" c="${4:-}"; local auth=(); [ "$t" != "-" ] && auth=(-H "Authorization: Bearer $t"); local data=(); [ -n "$c" ] && { printf '%s' "$c" > "$TMP/c.json"; data=(-H 'Content-Type: application/json' --data-binary @"$TMP/c.json"); }
  CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$m" "${auth[@]}" "${data[@]}" "$BASE_URL$r")"; }
grupo() { llamar "$1" POST /api/chat/mensajes "{\"tipoSala\":\"global\",\"contenido\":\"$2\"}"; json "$TMP/r.json" 'b.id'; }
privado() { llamar "$1" POST /api/chat/mensajes "{\"tipoSala\":\"directo\",\"destinatarioId\":\"$2\",\"contenido\":\"$3\"}"; json "$TMP/r.json" 'b.id'; }
# canal <token> <id de la conversación> → su contador en la lista de chats
canal() { llamar "$1" GET /api/chat/canales; json "$TMP/r.json" "(b.find(c=>c.id==='$2')||{}).noLeidos"; }
total() { llamar "$1" GET /api/chat/no-leidos; json "$TMP/r.json" 'b.total'; }
leer() { llamar "$1" POST /api/chat/lecturas "{\"sala\":\"$2\",\"hasta\":\"$3\"}"; }
limpiar() {
  sql "select set_config('app.rol_actual','administrador',false); delete from chat_lecturas where usuario_id in (select id from usuarios where usuario like 'h19n-%'); delete from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19n-%') or destinatario_id in (select id from usuarios where usuario like 'h19n-%')" >/dev/null
  sql "delete from usuarios where usuario like 'h19n-%'" >/dev/null; rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-19 / RF-09 contra $BASE_URL"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h19n-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('h19n-ana','Ana','rt_calle',null,'$HASH'),
  ('h19n-beto','Beto','rt_calle',null,'$HASH'),
  ('h19n-carla','Carla','firmante',null,'$HASH'),
  ('h19n-dora','Dora','secretaria',null,'$HASH'),
  ('h19n-eca','ECA Uno','eca','Conservación Porteña S.R.L.','$HASH')" >/dev/null
ANA="$(login h19n-ana)"; BETO="$(login h19n-beto)"; CARLA="$(login h19n-carla)"; DORA="$(login h19n-dora)"; ECA="$(login h19n-eca)"
for t in "$ANA" "$BETO" "$CARLA" "$DORA" "$ECA"; do { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario temporal: ¿está la API levantada en $BASE_URL?"; exit 1; }; done
ID_ANA="$(idde h19n-ana)"; ID_BETO="$(idde h19n-beto)"; ID_CARLA="$(idde h19n-carla)"; ID_DORA="$(idde h19n-dora)"
# Dos mensajes del grupo de ANTES de que existieran los usuarios de la prueba
sql "insert into chat_mensajes (emisor_id, tipo_sala, contenido, creado_en) values ('$ID_ANA'::uuid,'global','de antes 1', now() - interval '2 days'), ('$ID_ANA'::uuid,'global','de antes 2', now() - interval '1 day')" >/dev/null

echo "0. Un usuario nuevo no acumula lo que se escribió en el grupo antes de que existiera"
[ "$(canal "$BETO" global)" = "0" ] && [ "$(total "$BETO")" = "0" ] && pass "con 2 mensajes viejos en el grupo, Beto (recién creado) tiene 0 sin leer" || fail "Beto tiene $(canal "$BETO" global) en el grupo"

echo "1. Criterio 1: el contador de cada conversación en la lista de chats"
grupo "$ANA" "g1" >/dev/null; grupo "$ANA" "g2" >/dev/null; grupo "$CARLA" "g3" >/dev/null
privado "$ANA" "$ID_BETO" "p1" >/dev/null; P2="$(privado "$ANA" "$ID_BETO" "p2")"; privado "$CARLA" "$ID_BETO" "p3" >/dev/null; privado "$DORA" "$ID_BETO" "p4" >/dev/null
llamar "$BETO" GET /api/chat/canales
G="$(json "$TMP/r.json" "b.find(c=>c.id==='global').noLeidos")"; A="$(json "$TMP/r.json" "b.find(c=>c.id==='$ID_ANA').noLeidos")"; C="$(json "$TMP/r.json" "b.find(c=>c.id==='$ID_CARLA').noLeidos")"; D="$(json "$TMP/r.json" "b.find(c=>c.id==='$ID_DORA').noLeidos")"
{ [ "$G" = "3" ] && [ "$A" = "2" ] && [ "$C" = "1" ] && [ "$D" = "1" ]; } && pass "la lista de Beto trae: grupo 3, Ana 2, Carla 1, Dora 1" || fail "contadores: grupo=$G Ana=$A Carla=$C Dora=$D"
[ "$(json "$TMP/r.json" 'b[0].id')" = "global" ] && [ "$(json "$TMP/r.json" 'b.every(c=>typeof c.noLeidos==="number")')" = "true" ] && pass "la lista sigue empezando por el grupo y todos los contadores son números" || fail "forma de la lista"
privado "$ANA" "$ID_BETO" "p5" >/dev/null; [ "$(canal "$BETO" "$ID_ANA")" = "3" ] && pass "un mensaje nuevo suma uno (Ana: 3)" || fail "Ana: $(canal "$BETO" "$ID_ANA")"

echo "2. Criterio 2: el total"
[ "$(total "$BETO")" = "8" ] && pass "el total de Beto suma el grupo y los privados: 3 + 3 + 1 + 1 = 8" || fail "total de Beto: $(total "$BETO")"
llamar "$ECA" GET /api/chat/no-leidos; [ "$CODE" = "403" ] && pass "la ECA no tiene chat: 403" || fail "ECA → $CODE"
llamar - GET /api/chat/no-leidos; [ "$CODE" = "401" ] && pass "sin sesión: 401" || fail "sin sesión → $CODE"

echo "3. Criterio 3: al leer una conversación su contador vuelve a cero, y lo propio no cuenta"
[ "$(total "$ANA")" = "1" ] && [ "$(canal "$ANA" "$ID_BETO")" = "0" ] && pass "Ana escribió 5 de los 8 mensajes de Beto y 2 del grupo: lo propio no cuenta (solo tiene sin leer el g3 de Carla)" || fail "Ana: total $(total "$ANA")"
leer "$BETO" "$ID_ANA" "$P2"
{ [ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.noLeidos')" = "1" ] && [ "$(json "$TMP/r.json" 'b.total')" = "6" ]; } && pass "marcar leída la conversación con Ana hasta p2 deja 1 sin leer (p5) y el total en 6" || fail "leer hasta p2 → $CODE $(cat "$TMP/r.json")"
privado "$ANA" "$ID_BETO" "p6" >/dev/null
llamar "$BETO" GET "/api/chat/mensajes?sala=$ID_ANA"; ULT="$(json "$TMP/r.json" 'b[b.length-1].id')"
leer "$BETO" "$ID_ANA" "$ULT"; { [ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.noLeidos')" = "0" ]; } && pass "marcar hasta el último deja la conversación en 0" || fail "leer hasta el último → $CODE $(cat "$TMP/r.json")"
leer "$BETO" "$ID_ANA" "$P2"; [ "$(json "$TMP/r.json" 'b.noLeidos')" = "0" ] && pass "la lectura solo avanza: marcar un mensaje más viejo no vuelve a dejar sin leer lo ya leído" || fail "hacia atrás: $(cat "$TMP/r.json")"
[ "$(canal "$BETO" global)" = "3" ] && [ "$(canal "$BETO" "$ID_CARLA")" = "1" ] && pass "leer una conversación no toca las demás (grupo sigue en 3, Carla en 1)" || fail "otras conversaciones: grupo $(canal "$BETO" global), Carla $(canal "$BETO" "$ID_CARLA")"
privado "$ANA" "$ID_BETO" "p7" >/dev/null; [ "$(canal "$BETO" "$ID_ANA")" = "1" ] && pass "un mensaje que llega después de leer vuelve a contar" || fail "después de leer: $(canal "$BETO" "$ID_ANA")"
llamar "$BETO" GET "/api/chat/mensajes?sala=global"; GULT="$(json "$TMP/r.json" 'b[b.length-1].id')"
leer "$BETO" global "$GULT"; privado "$BETO" "$ID_ANA" "respuesta de Beto" >/dev/null
[ "$(canal "$BETO" global)" = "0" ] && [ "$(canal "$BETO" "$ID_ANA")" = "1" ] && pass "lo que Beto escribe no cuenta como sin leer para él (Ana sigue en 1: solo p7)" || fail "propios: grupo $(canal "$BETO" global), Ana $(canal "$BETO" "$ID_ANA")"

echo "4. Criterio 4: lo leído se guarda por usuario en el servidor"
ANTES="$(llamar "$BETO" GET /api/chat/canales; json "$TMP/r.json" 'JSON.stringify(b.map(c=>[c.id,c.noLeidos]))')"
BETO2="$(login h19n-beto)"
DESPUES="$(llamar "$BETO2" GET /api/chat/canales; json "$TMP/r.json" 'JSON.stringify(b.map(c=>[c.id,c.noLeidos]))')"
{ [ "$BETO2" != "$BETO" ] && [ "$ANTES" = "$DESPUES" ] && [ "$(total "$BETO2")" = "$(total "$BETO")" ]; } && pass "al ingresar de nuevo (otra sesión, otro dispositivo) los contadores y el total son los mismos" || fail "otra sesión: $ANTES ≠ $DESPUES"
[ "$(canal "$CARLA" global)" = "2" ] && [ "$(canal "$BETO" global)" = "0" ] && pass "lo que leyó Beto no lo leyó Carla: cada usuario tiene su propio punto de lectura" || fail "Carla: grupo $(canal "$CARLA" global)"
[ "$(sql "select count(*) from chat_lecturas where usuario_id = '$ID_BETO'")" = "2" ] && pass "en la base queda una fila por conversación leída (chat_lecturas)" || fail "filas de chat_lecturas de Beto: $(sql "select count(*) from chat_lecturas where usuario_id = '$ID_BETO'")"

echo "5. Criterio 5: nadie cuenta ni lee lo ajeno"
privado "$ANA" "$ID_DORA" "secreto de Ana a Dora" >/dev/null; SEC_ULT="$(llamar "$DORA" GET "/api/chat/mensajes?sala=$ID_ANA"; json "$TMP/r.json" 'b[b.length-1].id')"
llamar "$CARLA" GET /api/chat/canales; { [ "$(json "$TMP/r.json" "(b.find(c=>c.id==='$ID_ANA')||{}).noLeidos")" = "0" ] && [ "$(json "$TMP/r.json" "(b.find(c=>c.id==='$ID_DORA')||{}).noLeidos")" = "0" ] && [ "$(json "$TMP/r.json" "(b.find(c=>c.id==='$ID_BETO')||{}).noLeidos")" = "0" ]; } && pass "Carla no tiene contadores por los privados de Ana con Beto ni con Dora" || fail "Carla ve contadores ajenos"
[ "$(total "$CARLA")" = "2" ] && pass "el total de Carla solo suma el grupo (2 mensajes de Ana; el g3 es suyo): ningún privado ajeno" || fail "total de Carla: $(total "$CARLA")"
[ "$(total "$DORA")" = "4" ] && pass "el de Dora suma el grupo (3) y su privado con Ana (1)" || fail "total de Dora: $(total "$DORA")"
leer "$CARLA" "$ID_ANA" "$SEC_ULT"; [ "$CODE" = "400" ] && pass "Carla no puede marcar leído un mensaje de un privado ajeno (400)" || fail "Carla marca lo ajeno → $CODE"
[ "$(canal "$DORA" "$ID_ANA")" = "1" ] && pass "y no se movió nada: Dora sigue con su 1" || fail "Dora: $(canal "$DORA" "$ID_ANA")"
leer "$BETO" "$ID_ANA" "$GULT"; [ "$CODE" = "400" ] && pass "un mensaje del grupo no se puede marcar leído como si fuera del privado (400)" || fail "grupo como privado → $CODE"

echo "6. Pedidos inválidos: 400 y no 500"
MAL=""; for c in '{}' '{"hasta":"00000000-0000-4000-8000-000000000000"}' '{"sala":"abc","hasta":"00000000-0000-4000-8000-000000000000"}' '{"sala":"global"}' '{"sala":"global","hasta":"x"}' '{"sala":"global","hasta":"00000000-0000-4000-8000-000000000000"}' "{\"sala\":\"$ID_BETO\",\"hasta\":\"$GULT\"}"; do
  llamar "$BETO" POST /api/chat/lecturas "$c"; [ "$CODE" = "400" ] || MAL="$MAL [$c → $CODE]"; done
[ -z "$MAL" ] && pass "sin conversación, conversación inválida, sin mensaje, mensaje inválido o inexistente, y una conversación con uno mismo responden 400" || fail "no responde 400:$MAL"

echo
echo "== Resultado: $OK OK, $KO con error"
[ "$KO" -eq 0 ]

#!/usr/bin/env bash
# HU-19 / RF-03 (REQ-1795778246351) — La Secretaría figura como contacto en el chat y sus privados se pueden leer y responder.
#
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-03-entrega.sh
#
# Requiere `npm run db:up` y la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET). BASE_URL por defecto http://127.0.0.1:3050.
# Crea usuarios temporales (dos Secretarías, dos RT, un Firmante, un Administrador y una ECA) y sus mensajes, y los borra al terminar.
# Lo que se ve en pantalla (la lista de conversaciones y la insignia «Secretaría») está en RF-03-entrega.md.

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
idde() { sql "select id from usuarios where usuario = '$1'"; }
# canal <token> <id del contacto> <campo>: un dato del canal de ese contacto en la lista de conversaciones de quien pide
canal() { http "$1" GET /api/chat/canales; json "$TMP/r.json" "(b.find(c=>c.id==='$2')||{})['$3']"; }
# hilo <token> <sala> → los textos de esa conversación, separados por « | »
hilo() { http "$1" GET "/api/chat/mensajes?sala=$2"; json "$TMP/r.json" 'b.map(m=>m.contenido).join(" | ")'; }
escribir() { printf '{"tipoSala":"directo","destinatarioId":"%s","contenido":"%s"}' "$2" "$3" > "$TMP/m.json"; http "$1" POST /api/chat/mensajes -H 'Content-Type: application/json' -d @"$TMP/m.json"; }
limpiar() {
  sql "select set_config('app.rol_actual','administrador',false); delete from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19s-%') or destinatario_id in (select id from usuarios where usuario like 'h19s-%')" >/dev/null
  sql "delete from usuarios where usuario like 'h19s-%'" >/dev/null; rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-19 / RF-03 contra $BASE_URL"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h19s-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('h19s-sec','Secretaría Uno','secretaria',null,'$HASH'),
  ('h19s-sec2','Secretaría Dos','secretaria',null,'$HASH'),
  ('h19s-rt','RT Uno','rt_calle',null,'$HASH'),
  ('h19s-rt2','RT Dos','rt_calle',null,'$HASH'),
  ('h19s-fir','Firmante Uno','firmante',null,'$HASH'),
  ('h19s-adm','Admin Uno','administrador',null,'$HASH'),
  ('h19s-eca','ECA Uno','eca','Conservación Porteña S.R.L.','$HASH')" >/dev/null
SEC="$(login h19s-sec)"; SEC2="$(login h19s-sec2)"; RT="$(login h19s-rt)"; RT2="$(login h19s-rt2)"; FIR="$(login h19s-fir)"; ADM="$(login h19s-adm)"; ECA="$(login h19s-eca)"
for t in "$SEC" "$SEC2" "$RT" "$RT2" "$FIR" "$ADM" "$ECA"; do
  { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario temporal: ¿está la API levantada en $BASE_URL?"; exit 1; }
done
ID_SEC="$(idde h19s-sec)"; ID_RT="$(idde h19s-rt)"; ID_RT2="$(idde h19s-rt2)"; ID_FIR="$(idde h19s-fir)"; ID_ADM="$(idde h19s-adm)"; ID_SEC2="$(idde h19s-sec2)"; ID_ECA="$(idde h19s-eca)"

echo "1. Criterio 1: la Secretaría figura como contacto de RT, Firmante y Administrador, y no de sí misma"
MAL=""
for par in "RT:$RT" "Firmante:$FIR" "Administrador:$ADM"; do
  R="$(canal "${par#*:}" "$ID_SEC" rol)"; N="$(canal "${par#*:}" "$ID_SEC" nombre)"; T="$(canal "${par#*:}" "$ID_SEC" tipo)"
  [ "$R" = "secretaria" ] && [ "$T" = "directo" ] && [ "$N" = "Secretaría Uno" ] || MAL="$MAL [${par%%:*} ve rol=$R tipo=$T nombre=$N]"
done
[ -z "$MAL" ] && pass "el RT, el Firmante y el Administrador tienen a «Secretaría Uno» como contacto directo, con rol secretaria" || fail "contacto ausente o distinto:$MAL"
[ -z "$(canal "$SEC" "$ID_SEC" id)" ] || [ "$(canal "$SEC" "$ID_SEC" id)" = "undefined" ] && pass "la Secretaría no se ve a sí misma en su lista" || fail "la Secretaría figura como contacto de sí misma"
MAL=""; for id in "$ID_RT" "$ID_RT2" "$ID_FIR" "$ID_ADM" "$ID_SEC2"; do [ "$(canal "$SEC" "$id" id)" = "$id" ] || MAL="$MAL $id"; done
[ -z "$MAL" ] && pass "y sí ve a los dos RT, al Firmante, al Administrador y a otra Secretaría" || fail "le faltan contactos a la Secretaría:$MAL"

echo "2. Criterio 2: un privado de un RT a la Secretaría llega y ella lo ve"
escribir "$RT" "$ID_SEC" "Secretaria, falta el acuse de Corrientes 1234"
[ "$CODE" = "201" ] && pass "el RT le escribe a la Secretaría (201)" || fail "el RT no pudo escribirle a la Secretaría ($CODE $(head -c 150 "$TMP/r.json"))"
[ "$(hilo "$SEC" "$ID_RT")" = "Secretaria, falta el acuse de Corrientes 1234" ] && pass "la Secretaría lo ve al abrir su chat con ese RT" || fail "la Secretaría ve: «$(hilo "$SEC" "$ID_RT")»"
[ "$(canal "$SEC" "$ID_RT" ultimoMensaje)" = "Secretaria, falta el acuse de Corrientes 1234" ] && pass "y en su lista, la conversación con el RT muestra ese mensaje como el último" || fail "último mensaje en la lista de la Secretaría: «$(canal "$SEC" "$ID_RT" ultimoMensaje)»"

echo "3. Criterio 3: un privado de la Secretaría a un RT aparece en el chat del RT, y la respuesta vuelve"
escribir "$SEC" "$ID_RT2" "Beto, pasa por Cabildo 1540"
[ "$CODE" = "201" ] && pass "la Secretaría le escribe a otro RT (201)" || fail "la Secretaría no pudo escribirle al RT ($CODE)"
[ "$(canal "$RT2" "$ID_SEC" ultimoMensaje)" = "Beto, pasa por Cabildo 1540" ] && pass "el RT ve en su lista la conversación con la Secretaría con ese mensaje" || fail "lista del RT: «$(canal "$RT2" "$ID_SEC" ultimoMensaje)»"
[ "$(hilo "$RT2" "$ID_SEC")" = "Beto, pasa por Cabildo 1540" ] && pass "y lo lee al abrirla" || fail "el RT lee: «$(hilo "$RT2" "$ID_SEC")»"
escribir "$RT2" "$ID_SEC" "Voy ahora"
[ "$CODE" = "201" ] && [ "$(hilo "$SEC" "$ID_RT2")" = "Beto, pasa por Cabildo 1540 | Voy ahora" ] && pass "el RT responde y la Secretaría ve la conversación completa, en orden" || fail "la Secretaría ve: «$(hilo "$SEC" "$ID_RT2")» (respuesta $CODE)"

echo "4. Criterio 4: los privados con la Secretaría solo los ven sus dos participantes"
MAL=""
for par in "Firmante:$FIR" "Administrador:$ADM" "otro RT:$RT2" "otra Secretaría:$SEC2"; do
  t="${par#*:}"
  for sala in global "$ID_RT" "$ID_SEC"; do
    case "$(hilo "$t" "$sala")" in *"falta el acuse"*) MAL="$MAL [${par%%:*} lo ve en $sala]";; esac
  done
  case "$(http "$t" GET /api/chat/canales; json "$TMP/r.json" 'b.map(c=>c.ultimoMensaje||"").join("|")')" in *"falta el acuse"*) MAL="$MAL [${par%%:*} lo ve en su lista]";; esac
done
[ -z "$MAL" ] && pass "el Firmante, el Administrador, otro RT y otra Secretaría no lo ven ni en el grupo ni en su lista ni abriendo cualquiera de los dos chats" || fail "se filtró un privado:$MAL"

echo "5. Criterio 5: la ECA sigue sin chat"
MAL=""; for ruta in /api/chat/canales "/api/chat/mensajes?sala=global"; do http "$ECA" GET "$ruta"; [ "$CODE" = "403" ] || MAL="$MAL [GET $ruta → $CODE]"; done
http "$ECA" POST /api/chat/mensajes -H 'Content-Type: application/json' -d '{"tipoSala":"global","contenido":"no deberia entrar"}'; [ "$CODE" = "403" ] || MAL="$MAL [POST → $CODE]"
[ -z "$MAL" ] && pass "las tres rutas del chat le responden 403 a la ECA" || fail "la ECA entra al chat:$MAL"
MAL=""; for t in "$RT" "$FIR" "$ADM" "$SEC"; do [ "$(canal "$t" "$ID_ECA" id)" = "$ID_ECA" ] && MAL="$MAL [la ECA figura como contacto]"; done
[ -z "$MAL" ] && pass "y la ECA no figura como contacto de nadie" || fail "$MAL"
http - GET /api/chat/canales; [ "$CODE" = "401" ] && pass "sin sesión el chat responde 401" || fail "sin sesión → $CODE"

echo
echo "== Resultado: $OK OK, $KO con error"
[ "$KO" -eq 0 ]

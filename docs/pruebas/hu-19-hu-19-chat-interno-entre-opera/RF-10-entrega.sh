#!/usr/bin/env bash
# HU-19 / RF-10 (REQ-1795778247416) — Avisos del navegador cuando llega un mensaje nuevo del chat.
#
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-10-entrega.sh
#
# Requiere `npm run db:up` y la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET). BASE_URL por defecto http://127.0.0.1:3050;
# WEB_URL (por defecto https://localhost:8051) es la web: si responde, también se comprueba el service worker. Crea usuarios temporales y los borra al terminar.
# Lo que hace el navegador (el botón, el permiso, el aviso y tocarlo) está en RF-10-entrega.md, con capturas: esos avisos no se pueden ver desde un script.
# Acá se comprueba lo que el servidor le da a la pantalla para avisar: de cada conversación con algo sin leer, el último mensaje de OTRA persona.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
WEB_URL="${WEB_URL:-https://localhost:8051}"
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
llamar() { local t="$1" m="$2" r="$3" c="${4:-}"; local auth=(); [ "$t" != "-" ] && auth=(-H "Authorization: Bearer $t"); local data=(); [ -n "$c" ] && { printf '%s' "$c" > "$TMP/c.json"; data=(-H 'Content-Type: application/json' --data-binary @"$TMP/c.json"); }
  CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$m" "${auth[@]}" "${data[@]}" "$BASE_URL$r")"; }
grupo() { llamar "$1" POST /api/chat/mensajes "{\"tipoSala\":\"global\",\"contenido\":\"$2\"}"; json "$TMP/r.json" 'b.id'; }
privado() { llamar "$1" POST /api/chat/mensajes "{\"tipoSala\":\"directo\",\"destinatarioId\":\"$2\",\"contenido\":\"$3\"}"; json "$TMP/r.json" 'b.id'; }
resumen() { llamar "$1" GET /api/chat/no-leidos; }
limpiar() {
  sql "select set_config('app.rol_actual','administrador',false); delete from chat_lecturas where usuario_id in (select id from usuarios where usuario like 'h19a-%'); delete from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19a-%') or destinatario_id in (select id from usuarios where usuario like 'h19a-%')" >/dev/null
  sql "delete from usuarios where usuario like 'h19a-%'" >/dev/null; rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-19 / RF-10 contra $BASE_URL"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h19a-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('h19a-ana','Ana Gómez','rt_calle',null,'$HASH'),
  ('h19a-beto','Beto Ruiz','rt_calle',null,'$HASH'),
  ('h19a-carla','Carla Díaz','firmante',null,'$HASH'),
  ('h19a-eca','ECA Uno','eca','Conservación Porteña S.R.L.','$HASH')" >/dev/null
ANA="$(login h19a-ana)"; BETO="$(login h19a-beto)"; CARLA="$(login h19a-carla)"; ECA="$(login h19a-eca)"
for t in "$ANA" "$BETO" "$CARLA" "$ECA"; do { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario temporal: ¿está la API levantada en $BASE_URL?"; exit 1; }; done
ID_ANA="$(idde h19a-ana)"; ID_BETO="$(idde h19a-beto)"; ID_CARLA="$(idde h19a-carla)"

echo "1. Criterio 2: de cada conversación con algo sin leer, el último mensaje de otra persona (quién escribió y el comienzo del texto)"
resumen "$BETO"; { [ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.total')" = "0" ] && [ "$(json "$TMP/r.json" 'b.conversaciones.length')" = "0" ]; } && pass "sin nada sin leer: total 0 y ninguna conversación" || fail "resumen vacío: $CODE $(cat "$TMP/r.json")"
grupo "$ANA" "g1" >/dev/null; G2="$(grupo "$CARLA" "Aviso general de Carla")"; privado "$ANA" "$ID_BETO" "p1" >/dev/null; P2="$(privado "$ANA" "$ID_BETO" "Beto, ¿llegaste al edificio?")"
resumen "$BETO"
{ [ "$(json "$TMP/r.json" 'b.total')" = "4" ] && [ "$(json "$TMP/r.json" 'b.conversaciones.map(c=>c.sala+":"+c.noLeidos).join("|")')" = "global:2|$ID_ANA:2" ]; } && pass "Beto: total 4; el grupo con 2 sin leer y la conversación con Ana con 2" || fail "resumen de Beto: $(cat "$TMP/r.json")"
{ [ "$(json "$TMP/r.json" 'b.conversaciones[0].ultimoMensaje.id')" = "$G2" ] && [ "$(json "$TMP/r.json" 'b.conversaciones[0].ultimoMensaje.emisorNombre')" = "Carla Díaz" ] && [ "$(json "$TMP/r.json" 'b.conversaciones[0].ultimoMensaje.contenido')" = "Aviso general de Carla" ]; } && pass "del grupo trae el último: el de «Carla Díaz» («Aviso general de Carla»)" || fail "ultimo del grupo: $(json "$TMP/r.json" 'JSON.stringify(b.conversaciones[0])')"
{ [ "$(json "$TMP/r.json" "b.conversaciones[1].ultimoMensaje.id")" = "$P2" ] && [ "$(json "$TMP/r.json" 'b.conversaciones[1].ultimoMensaje.emisorNombre')" = "Ana Gómez" ] && [ "$(json "$TMP/r.json" 'b.conversaciones[1].ultimoMensaje.contenido')" = "Beto, ¿llegaste al edificio?" ]; } && pass "del privado trae el último: el de «Ana Gómez»" || fail "ultimo del privado: $(json "$TMP/r.json" 'JSON.stringify(b.conversaciones[1])')"
[ "$(json "$TMP/r.json" 'Object.keys(b.conversaciones[1].ultimoMensaje).sort().join(",")')" = "conFoto,contenido,creadoEn,emisorNombre,id" ] && pass "cada mensaje trae solo id, quién escribió, texto, si tiene foto y cuándo" || fail "campos: $(json "$TMP/r.json" 'Object.keys(b.conversaciones[1].ultimoMensaje)')"
printf '{"tipoSala":"directo","destinatarioId":"%s","contenido":"","adjuntoUrl":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="}' "$ID_BETO" > "$TMP/foto.json"
curl -s -o /dev/null -X POST -H "Authorization: Bearer $CARLA" -H 'Content-Type: application/json' --data-binary @"$TMP/foto.json" "$BASE_URL/api/chat/mensajes"
resumen "$BETO"; FOTO="$(json "$TMP/r.json" "JSON.stringify(b.conversaciones.find(c=>c.sala==='$ID_CARLA').ultimoMensaje)")"
{ echo "$FOTO" | grep -q '"conFoto":true' && echo "$FOTO" | grep -q '📷 Foto adjunta' && ! grep -q base64 "$TMP/r.json"; } && pass "un mensaje con foto viaja como «conFoto: true» con su texto, y la respuesta NO lleva la imagen ($(wc -c < "$TMP/r.json" | tr -d ' ') bytes)" || fail "foto: $FOTO"
privado "$ANA" "$ID_BETO" "$(printf 'x%.0s' $(seq 1 600))" >/dev/null; resumen "$BETO"
[ "$(json "$TMP/r.json" "b.conversaciones.find(c=>c.sala==='$ID_ANA').ultimoMensaje.contenido.length")" = "200" ] && pass "un texto de 600 caracteres viaja recortado a 200 (la pantalla muestra los primeros 100)" || fail "largo: $(json "$TMP/r.json" "b.conversaciones.find(c=>c.sala==='$ID_ANA').ultimoMensaje.contenido.length")"

echo "2. Criterio 4: lo propio no se avisa, y lo leído deja de aparecer"
privado "$BETO" "$ID_ANA" "respuesta mía a Ana" >/dev/null; resumen "$BETO"
{ ! grep -q "respuesta mía a Ana" "$TMP/r.json"; } && pass "lo que Beto escribe no aparece en su resumen" || fail "aparece un mensaje propio"
resumen "$ANA"; [ "$(json "$TMP/r.json" "b.conversaciones.find(c=>c.sala==='$ID_BETO').ultimoMensaje.contenido")" = "respuesta mía a Ana" ] && pass "y a Ana sí le aparece su respuesta, que es de otro" || fail "Ana: $(cat "$TMP/r.json")"
llamar "$BETO" GET "/api/chat/mensajes?sala=$ID_ANA"; ULT="$(json "$TMP/r.json" 'b[b.length-1].id')"
llamar "$BETO" POST /api/chat/lecturas "{\"sala\":\"$ID_ANA\",\"hasta\":\"$ULT\"}"; resumen "$BETO"
[ "$(json "$TMP/r.json" "b.conversaciones.some(c=>c.sala==='$ID_ANA')")" = "false" ] && pass "al leer la conversación con Ana deja de aparecer en el resumen" || fail "sigue apareciendo: $(cat "$TMP/r.json")"
N2="$(privado "$ANA" "$ID_BETO" "mensaje nuevo después de leer")"; resumen "$BETO"
[ "$(json "$TMP/r.json" "b.conversaciones.find(c=>c.sala==='$ID_ANA').ultimoMensaje.id")" = "$N2" ] && pass "un mensaje que llega después vuelve a aparecer, con su propio id (la pantalla avisa cuando cambia el id)" || fail "mensaje nuevo: $(cat "$TMP/r.json")"

echo "3. Privacidad y acceso"
resumen "$CARLA"; { [ "$(json "$TMP/r.json" "b.conversaciones.some(c=>c.sala==='$ID_ANA' || c.sala==='$ID_BETO')")" = "false" ] && ! grep -q "nuevo después de leer" "$TMP/r.json"; } && pass "Carla no recibe nada de los privados de Ana con Beto" || fail "Carla ve algo ajeno: $(cat "$TMP/r.json")"
llamar "$ECA" GET /api/chat/no-leidos; [ "$CODE" = "403" ] && pass "la ECA no tiene chat: 403" || fail "ECA → $CODE"
llamar - GET /api/chat/no-leidos; [ "$CODE" = "401" ] && pass "sin sesión: 401" || fail "sin sesión → $CODE"
resumen "$BETO"; [ "$(json "$TMP/r.json" 'typeof b.total')" = "number" ] && pass "el total de siempre sigue estando (el menú y el título no cambian)" || fail "sin total"

echo "4. El service worker (solo si la web responde en $WEB_URL)"
CODIGO_WEB="$(curl -sk -m 5 -o "$TMP/sw-chat.js" -w '%{http_code}' "$WEB_URL/sw-chat.js")"
if [ "$CODIGO_WEB" = "200" ] && ! grep -qi '<html' "$TMP/sw-chat.js"; then
  grep -q "notificationclick" "$TMP/sw-chat.js" && grep -q "abrir-chat" "$TMP/sw-chat.js" && grep -q "openWindow" "$TMP/sw-chat.js" && pass "la web sirve sw-chat.js (no una página): al tocar un aviso trae la aplicación al frente, le pide abrir la conversación o abre /?chat=…" || fail "sw-chat.js no tiene el manejador esperado"
else
  echo "  (la web no responde en $WEB_URL: no se comprueba el service worker)"
fi

echo
echo "== Resultado: $OK OK, $KO con error"
[ "$KO" -eq 0 ]

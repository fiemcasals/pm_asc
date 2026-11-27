#!/usr/bin/env bash
# HU-19 / RF-04 (REQ-1795778246508) — La API del chat rechaza con un mensaje claro lo que no corresponde en vez de fallar o guardarlo.
#
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-04-entrega.sh
#
# Requiere `npm run db:up` y la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET). BASE_URL por defecto http://127.0.0.1:3050.
# Crea usuarios temporales (dos RT —uno dado de baja—, una Secretaría y una ECA) y los borra, con sus mensajes, al terminar.
# El límite de 2.000 caracteres de la caja de texto (criterio 4, la parte de la pantalla) está en RF-04-entrega.md.

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
# enviar <token> <cuerpo JSON> → código en $CODE y cuerpo en $TMP/r.json
enviar() { printf '%s' "$2" > "$TMP/m.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $1" -H 'Content-Type: application/json' --data-binary @"$TMP/m.json" "$BASE_URL/api/chat/mensajes")"; }
# enviar_archivo <token> <archivo con el cuerpo>
enviar_archivo() { CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $1" -H 'Content-Type: application/json' --data-binary @"$2" "$BASE_URL/api/chat/mensajes")"; }
mensaje() { json "$TMP/r.json" 'String(b.message)' 2>/dev/null | cut -c1-110; }
guardados() { sql "select count(*) from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19q-%')"; }
limpiar() {
  sql "select set_config('app.rol_actual','administrador',false); delete from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19q-%') or destinatario_id in (select id from usuarios where usuario like 'h19q-%')" >/dev/null
  sql "delete from usuarios where usuario like 'h19q-%'" >/dev/null; rm -rf "$TMP"
}
trap limpiar EXIT
# rechaza <titulo> <token> <cuerpo> <regex del mensaje>: 400, con el mensaje esperado y sin guardar nada
rechaza() {
  local antes; antes="$(guardados)"; enviar "$2" "$3"
  if [ "$CODE" = "400" ] && echo "$(mensaje)" | grep -Eiq "$4" && [ "$(guardados)" = "$antes" ]; then pass "$1 → 400 «$(mensaje)»"
  else fail "$1 → $CODE «$(mensaje)» (guardados: $antes → $(guardados))"; fi
}

echo "== HU-19 / RF-04 contra $BASE_URL"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h19q-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('h19q-rt','RT Uno','rt_calle',null,'$HASH'),
  ('h19q-rt2','RT Dos','rt_calle',null,'$HASH'),
  ('h19q-sec','Secretaría','secretaria',null,'$HASH'),
  ('h19q-eca','ECA Uno','eca','Conservación Porteña S.R.L.','$HASH'),
  ('h19q-baja','RT de baja','rt_calle',null,'$HASH')" >/dev/null
sql "update usuarios set activo = false where usuario = 'h19q-baja'" >/dev/null
RT="$(login h19q-rt)"; SEC="$(login h19q-sec)"; ECA="$(login h19q-eca)"
for t in "$RT" "$SEC" "$ECA"; do { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario temporal: ¿está la API levantada en $BASE_URL?"; exit 1; }; done
ID_RT="$(sql "select id from usuarios where usuario='h19q-rt'")"; ID_RT2="$(sql "select id from usuarios where usuario='h19q-rt2'")"; ID_SEC="$(sql "select id from usuarios where usuario='h19q-sec'")"
ID_ECA="$(sql "select id from usuarios where usuario='h19q-eca'")"; ID_BAJA="$(sql "select id from usuarios where usuario='h19q-baja'")"
SIN="00000000-0000-4000-8000-000000000000"
curl -s -o "$TMP/ed.json" -H "Authorization: Bearer $SEC" "$BASE_URL/api/consorcios"; ID_EDIFICIO="$(json "$TMP/ed.json" 'b[0] && b[0].id')"
{ [ -n "$ID_EDIFICIO" ] && [ "$ID_EDIFICIO" != "undefined" ]; } || { echo "  ❌ no hay edificios de demostración: corré antes RF-02-datos-demo.sh"; exit 1; }

echo "1. Criterio 1: el destinatario de un privado"
rechaza "destinatario que no es un identificador" "$RT" '{"tipoSala":"directo","destinatarioId":"no-es-uuid","contenido":"hola"}' 'destinatario no es un identificador'
rechaza "destinatario con una inyección SQL" "$RT" '{"tipoSala":"directo","destinatarioId":"x'"'"'; DROP TABLE chat_mensajes; --","contenido":"hola"}' 'destinatario no es un identificador'
rechaza "destinatario que no existe" "$RT" "{\"tipoSala\":\"directo\",\"destinatarioId\":\"$SIN\",\"contenido\":\"hola\"}" 'no existe o no es un contacto'
rechaza "destinatario dado de baja (inactivo)" "$RT" "{\"tipoSala\":\"directo\",\"destinatarioId\":\"$ID_BAJA\",\"contenido\":\"hola\"}" 'no existe o no es un contacto'
rechaza "destinatario de otro rol (una ECA no usa el chat)" "$RT" "{\"tipoSala\":\"directo\",\"destinatarioId\":\"$ID_ECA\",\"contenido\":\"hola\"}" 'no existe o no es un contacto'
rechaza "privado sin destinatario" "$RT" '{"tipoSala":"directo","contenido":"hola"}' 'seleccionar un destinatario'
rechaza "privado a sí mismo" "$RT" "{\"tipoSala\":\"directo\",\"destinatarioId\":\"$ID_RT\",\"contenido\":\"hola\"}" 'ti mismo'
enviar "$RT" "{\"tipoSala\":\"directo\",\"destinatarioId\":\"$ID_RT2\",\"contenido\":\"hola otro RT\"}"; [ "$CODE" = "201" ] && pass "un privado a otro RT (un contacto de verdad) se guarda (201)" || fail "privado a un RT → $CODE"
enviar "$RT" "{\"tipoSala\":\"directo\",\"destinatarioId\":\"$ID_SEC\",\"contenido\":\"hola Secretaria\"}"; [ "$CODE" = "201" ] && pass "y un privado a la Secretaría también (201)" || fail "privado a la Secretaría → $CODE"

echo "2. Criterio 2: el tipo de sala"
rechaza "tipo de sala inventado" "$RT" '{"tipoSala":"xyz","contenido":"hola"}' 'tipo de sala tiene que ser'
rechaza "sin tipo de sala" "$RT" '{"contenido":"hola"}' 'tipo de sala tiene que ser'
rechaza "tipo de sala numérico" "$RT" '{"tipoSala":5,"contenido":"hola"}' 'tipo de sala tiene que ser'
rechaza "cuerpo vacío" "$RT" '{}' 'tipo de sala tiene que ser'
rechaza "el cuerpo es una lista" "$RT" '[]' 'tiene que ser un objeto'
enviar "$RT" '{no es json'; [ "$CODE" = "400" ] && pass "un cuerpo que no es JSON responde 400" || fail "no es JSON → $CODE"

echo "3. Criterio 3: el edificio"
rechaza "edificio que no es un identificador" "$SEC" '{"tipoSala":"global","contenido":"hola","consorcioId":"abc"}' 'edificio elegido no es v'
rechaza "edificio que no existe" "$SEC" "{\"tipoSala\":\"global\",\"contenido\":\"hola\",\"consorcioId\":\"$SIN\"}" 'edificio elegido no existe'
rechaza "un RT sin ese edificio asignado (para él no existe)" "$RT" "{\"tipoSala\":\"global\",\"contenido\":\"hola\",\"consorcioId\":\"$ID_EDIFICIO\"}" 'edificio elegido no existe o no está disponible'
enviar "$SEC" "{\"tipoSala\":\"global\",\"contenido\":\"hola con edificio\",\"consorcioId\":\"$ID_EDIFICIO\",\"maquinaRef\":\"M1\"}"
{ [ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.consorcioId')" = "$ID_EDIFICIO" ] && [ -n "$(json "$TMP/r.json" 'b.edificioNombre')" ]; } && pass "un edificio que existe se acepta y el mensaje sale con su nombre («$(json "$TMP/r.json" 'b.edificioNombre')»)" || fail "edificio válido → $CODE $(head -c 150 "$TMP/r.json")"

echo "4. Criterio 4: el contenido"
rechaza "contenido numérico" "$RT" '{"tipoSala":"global","contenido":123}' 'contenido del mensaje tiene que ser texto'
rechaza "contenido que es un objeto" "$RT" '{"tipoSala":"global","contenido":{"a":1}}' 'contenido del mensaje tiene que ser texto'
node -e 'const n=Number(process.argv[1]);require("fs").writeFileSync(process.argv[2],JSON.stringify({tipoSala:"global",contenido:"a".repeat(n)}))' 2001 "$TMP/c2001.json"
node -e 'const n=Number(process.argv[1]);require("fs").writeFileSync(process.argv[2],JSON.stringify({tipoSala:"global",contenido:"a".repeat(n)}))' 2000 "$TMP/c2000.json"
node -e 'const n=Number(process.argv[1]);require("fs").writeFileSync(process.argv[2],JSON.stringify({tipoSala:"global",contenido:"a".repeat(n)}))' 100000 "$TMP/c100k.json"
ANTES="$(guardados)"; enviar_archivo "$RT" "$TMP/c2001.json"
{ [ "$CODE" = "400" ] && echo "$(mensaje)" | grep -q "no puede superar los 2000 caracteres" && [ "$(guardados)" = "$ANTES" ]; } && pass "2.001 caracteres → 400 «$(mensaje)»" || fail "2.001 caracteres → $CODE"
ANTES="$(guardados)"; enviar_archivo "$RT" "$TMP/c100k.json"
{ [ "$CODE" = "400" ] && [ "$(guardados)" = "$ANTES" ]; } && pass "un mensaje de 100.000 caracteres → 400 y no se guarda" || fail "100.000 caracteres → $CODE"
enviar_archivo "$RT" "$TMP/c2000.json"; { [ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.contenido.length')" = "2000" ]; } && pass "2.000 caracteres exactos se guardan completos (201)" || fail "2.000 caracteres → $CODE"

echo "5. Criterio 5: el adjunto"
rechaza "adjunto con una dirección javascript:" "$RT" '{"tipoSala":"global","contenido":"x","adjuntoUrl":"javascript:alert(1)"}' 'adjunto tiene que ser una imagen PNG, JPEG o WEBP'
rechaza "adjunto con una dirección http:// externa" "$RT" '{"tipoSala":"global","contenido":"x","adjuntoUrl":"http://example.com/pixel.png"}' 'adjunto tiene que ser una imagen PNG, JPEG o WEBP'
rechaza "adjunto SVG (puede llevar scripts)" "$RT" '{"tipoSala":"global","contenido":"x","adjuntoUrl":"data:image/svg+xml;base64,PHN2Zz4="}' 'adjunto tiene que ser una imagen PNG, JPEG o WEBP'
rechaza "adjunto HTML" "$RT" '{"tipoSala":"global","contenido":"x","adjuntoUrl":"data:text/html;base64,PGgxPg=="}' 'adjunto tiene que ser una imagen PNG, JPEG o WEBP'
rechaza "adjunto que no es texto" "$RT" '{"tipoSala":"global","contenido":"x","adjuntoUrl":5}' 'adjunto tiene que ser una imagen PNG, JPEG o WEBP'
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
enviar "$RT" "{\"tipoSala\":\"global\",\"contenido\":\"\",\"adjuntoUrl\":\"$PNG\"}"
{ [ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.adjuntoUrl')" = "$PNG" ]; } && pass "una imagen PNG en base64 se guarda con su foto (201)" || fail "imagen PNG → $CODE"
MALIMG=""; for tipo in jpeg webp; do enviar "$RT" "{\"tipoSala\":\"global\",\"contenido\":\"foto $tipo\",\"adjuntoUrl\":\"data:image/$tipo;base64,AAAA\"}"; [ "$CODE" = "201" ] || MALIMG="$MALIMG [$tipo → $CODE]"; done
[ -z "$MALIMG" ] && pass "las imágenes JPEG y WEBP también se aceptan (201)" || fail "imágenes:$MALIMG"

echo "6. Criterio 6: pedir los mensajes de una conversación"
MAL=""; for q in "no-es-uuid" "%27%20OR%201%3D1%20--" "123" "GLOBAL"; do
  CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -H "Authorization: Bearer $RT" "$BASE_URL/api/chat/mensajes?sala=$q")"; [ "$CODE" = "400" ] || MAL="$MAL [$q → $CODE]"; done
[ -z "$MAL" ] && pass "una sala que no es «global» ni un identificador (no-es-uuid, una inyección, 123, GLOBAL) → 400 en vez de 500" || fail "sala inválida:$MAL"
CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -H "Authorization: Bearer $RT" "$BASE_URL/api/chat/mensajes?sala=global")"; [ "$CODE" = "200" ] && pass "«global» → 200" || fail "global → $CODE"
CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -H "Authorization: Bearer $RT" "$BASE_URL/api/chat/mensajes?sala=$ID_RT2")"; [ "$CODE" = "200" ] && pass "el identificador de un compañero → 200" || fail "compañero → $CODE"

echo "7. El acceso se controla antes que el contenido"
enviar "$ECA" '{"tipoSala":"xyz"}'; [ "$CODE" = "403" ] && pass "la ECA recibe 403 (no 400) aunque el mensaje sea inválido" || fail "ECA → $CODE"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"tipoSala":"xyz"}' "$BASE_URL/api/chat/mensajes")"; [ "$CODE" = "401" ] && pass "sin sesión responde 401" || fail "sin sesión → $CODE"

echo
echo "== Resultado: $OK OK, $KO con error"
[ "$KO" -eq 0 ]

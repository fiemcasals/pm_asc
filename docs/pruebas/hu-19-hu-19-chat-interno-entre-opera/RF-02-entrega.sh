#!/usr/bin/env bash
# HU-19 / RF-02 (REQ-1795778246174) — El hilo del chat muestra siempre los mensajes más nuevos y deja leer los anteriores.
#
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-02-entrega.sh
#
# Requiere `npm run db:up` y la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET). BASE_URL por defecto http://127.0.0.1:3050.
# Crea tres usuarios temporales y 450 mensajes privados (más 210 en el grupo general) y los borra al terminar.
# Lo que hace la pantalla (criterios 4 y 5: no te devuelve al final y el aviso «Mensajes nuevos ↓») está en RF-02-entrega.md, con capturas.

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
# pedir <token> <query> → código en $CODE, cuerpo en $TMP/r.json y el encabezado X-Hay-Anteriores en $HAY
pedir() { CODE="$(curl -s -o "$TMP/r.json" -D "$TMP/h.txt" -w '%{http_code}' -H "Authorization: Bearer $1" "$BASE_URL/api/chat/mensajes$2")"; HAY="$(grep -i '^x-hay-anteriores:' "$TMP/h.txt" | head -1 | tr -d '\r ' | cut -d: -f2)"; }
# rango de textos de la última respuesta: «primero…último (cantidad)»
resumen() { json "$TMP/r.json" 'b.length ? b[0].contenido + "…" + b[b.length-1].contenido + " (" + b.length + ")" : "(vacío)"'; }
# ¿la respuesta es m<desde>…m<hasta> seguidos y en orden?
es_rango() { json "$TMP/r.json" "b.length === ($2-$1+1) && b.every((m,i)=>m.contenido==='m'+($1+i))"; }
limpiar() {
  sql "select set_config('app.rol_actual','administrador',false); delete from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19h-%') or destinatario_id in (select id from usuarios where usuario like 'h19h-%')" >/dev/null
  sql "delete from usuarios where usuario like 'h19h-%'" >/dev/null; rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-19 / RF-02 contra $BASE_URL"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h19h-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('h19h-ana','Ana','rt_calle',null,'$HASH'),
  ('h19h-beto','Beto','rt_calle',null,'$HASH'),
  ('h19h-fir','Firmante','firmante',null,'$HASH')" >/dev/null
ANA="$(login h19h-ana)"; BETO="$(login h19h-beto)"; FIR="$(login h19h-fir)"
for t in "$ANA" "$BETO" "$FIR"; do
  { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario temporal: ¿está la API levantada en $BASE_URL?"; exit 1; }
done
ID_ANA="$(sql "select id from usuarios where usuario='h19h-ana'")"; ID_BETO="$(sql "select id from usuarios where usuario='h19h-beto'")"; ID_FIR="$(sql "select id from usuarios where usuario='h19h-fir'")"
# 450 mensajes entre Ana y Beto, uno por segundo hacia atrás desde ahora: «m1» el más viejo y «m450» el más nuevo, escribiendo uno y otro
sql "insert into chat_mensajes (emisor_id, destinatario_id, tipo_sala, contenido, creado_en)
     select case when g % 2 = 0 then '$ID_ANA'::uuid else '$ID_BETO'::uuid end, case when g % 2 = 0 then '$ID_BETO'::uuid else '$ID_ANA'::uuid end, 'directo', 'm' || g, now() - ((450 - g) * interval '1 second') from generate_series(1, 450) g" >/dev/null
# 210 mensajes en el grupo general, del Firmante
sql "insert into chat_mensajes (emisor_id, tipo_sala, contenido, creado_en)
     select '$ID_FIR'::uuid, 'global', 'g' || g, now() - ((210 - g) * interval '1 second') from generate_series(1, 210) g" >/dev/null

echo "1. Criterio 1: con más de 200 mensajes se ven los 200 más nuevos, de más viejo a más nuevo"
pedir "$ANA" "?sala=$ID_BETO"; PRIMERA="$(resumen)"
[ "$CODE" = "200" ] && [ "$(es_rango 251 450)" = "true" ] && pass "el chat privado de Ana con Beto (450 mensajes) trae m251…m450, 200 en orden (pide: $PRIMERA)" || fail "privado de Ana: $CODE $PRIMERA"
[ "$HAY" = "true" ] && pass "y avisa en el encabezado X-Hay-Anteriores que quedan anteriores" || fail "X-Hay-Anteriores = «$HAY»"
pedir "$BETO" "?sala=$ID_ANA"; [ "$(es_rango 251 450)" = "true" ] && pass "Beto ve exactamente lo mismo desde su lado" || fail "Beto ve: $(resumen)"
printf '{"tipoSala":"directo","destinatarioId":"%s","contenido":"m451 el mas nuevo"}' "$ID_BETO" > "$TMP/m.json"
curl -s -o /dev/null -X POST -H "Authorization: Bearer $ANA" -H 'Content-Type: application/json' -d @"$TMP/m.json" "$BASE_URL/api/chat/mensajes"
MAL=""; for par in "Ana:$ANA:$ID_BETO" "Beto:$BETO:$ID_ANA"; do IFS=: read -r nom tok sala <<< "$par"; pedir "$tok" "?sala=$sala"; [ "$(json "$TMP/r.json" 'b.length===200 && b[199].contenido==="m451 el mas nuevo"')" = "true" ] || MAL="$MAL [$nom ve $(resumen)]"; done
[ -z "$MAL" ] && pass "un mensaje enviado cuando ya hay más de 200 aparece al final del hilo de los dos" || fail "el mensaje nuevo no aparece:$MAL"
pedir "$BETO" "?sala=global"; [ "$(json "$TMP/r.json" 'b.length===200 && b[199].contenido==="g210" && b[0].contenido==="g11"')" = "true" ] && [ "$HAY" = "true" ] && pass "el grupo general (210 mensajes) trae g11…g210, 200 en orden, con anteriores" || fail "grupo: $(resumen) / anteriores=$HAY"
pedir "$FIR" "?sala=$ID_ANA"; [ "$(json "$TMP/r.json" 'b.length')" = "0" ] && pass "el Firmante no ve nada de la conversación privada de Ana y Beto" || fail "el Firmante ve $(resumen)"

echo "2. Criterio 2: el último mensaje que se ve es el que la lista de chats muestra como último"
curl -s -o "$TMP/c.json" -H "Authorization: Bearer $BETO" "$BASE_URL/api/chat/canales"
ULT_PRIV="$(json "$TMP/c.json" "(b.find(c=>c.id==='$ID_ANA')||{}).ultimoMensaje")"
[ "$ULT_PRIV" = "m451 el mas nuevo" ] && pass "la lista de Beto muestra «$ULT_PRIV» como último del chat con Ana, igual que el final del hilo" || fail "la lista muestra «$ULT_PRIV»"
ULT_GLOBAL="$(json "$TMP/c.json" "b[0].ultimoMensaje")"
[ "$ULT_GLOBAL" = "g210" ] && pass "y «$ULT_GLOBAL» como último del grupo, igual que el final del hilo" || fail "último del grupo en la lista: «$ULT_GLOBAL»"

echo "3. Criterio 3: pedir los anteriores con el id del más viejo que se ve"
pedir "$ANA" "?sala=$ID_BETO"; PRIMER_ID="$(json "$TMP/r.json" 'b[0].id')"
pedir "$ANA" "?sala=$ID_BETO&antes=$PRIMER_ID"; SEGUNDA_HAY="$HAY"; SEG_ID="$(json "$TMP/r.json" 'b[0].id')"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.length===200 && b[0].contenido==="m52" && b[199].contenido==="m251"')" = "true" ] && pass "con el id del más viejo que se ve (m252) trae los 200 anteriores: m52…m251" || fail "anteriores: $(resumen)"
[ "$SEGUNDA_HAY" = "true" ] && pass "y vuelve a avisar que quedan más" || fail "X-Hay-Anteriores = «$SEGUNDA_HAY»"
pedir "$ANA" "?sala=$ID_BETO&antes=$SEG_ID"
[ "$(es_rango 1 51)" = "true" ] && [ "$HAY" = "false" ] && pass "la tercera trae los últimos 51 (m1…m51) y avisa que ya no quedan anteriores" || fail "tercera página: $(resumen) / anteriores=$HAY"
# Sin repetir ni saltear: las tres páginas juntas son los 451 mensajes
pedir "$ANA" "?sala=$ID_BETO&antes=$PRIMER_ID"; json "$TMP/r.json" 'b.map(m=>m.contenido).join(",")' > "$TMP/p2.txt"
pedir "$ANA" "?sala=$ID_BETO&antes=$SEG_ID"; json "$TMP/r.json" 'b.map(m=>m.contenido).join(",")' > "$TMP/p3.txt"
pedir "$ANA" "?sala=$ID_BETO"; json "$TMP/r.json" 'b.map(m=>m.contenido).join(",")' > "$TMP/p1.txt"
TODO="$(cat "$TMP/p3.txt" "$TMP/p2.txt" "$TMP/p1.txt" | tr '\n' ',' | sed 's/,$//')"
[ "$(node -e 'const t=process.argv[1].split(",");const n=t.map(x=>x==="m451 el mas nuevo"?451:Number(x.slice(1)));console.log(n.length===451&&n.every((v,i)=>v===i+1))' "$TODO")" = "true" ] && pass "las tres páginas juntas son los 451 mensajes, en orden, sin repetir ni saltear ninguno" || fail "las páginas no encajan"
# Con exactamente 200 mensajes no hay anteriores: el grupo del Firmante tiene 210; un chat con 200 justos
sql "insert into chat_mensajes (emisor_id, destinatario_id, tipo_sala, contenido, creado_en)
     select '$ID_FIR'::uuid, '$ID_BETO'::uuid, 'directo', 'f' || g, now() - ((200 - g) * interval '1 second') from generate_series(1, 200) g" >/dev/null
pedir "$FIR" "?sala=$ID_BETO"; [ "$(json "$TMP/r.json" 'b.length')" = "200" ] && [ "$HAY" = "false" ] && pass "con exactamente 200 mensajes no avisa que haya anteriores" || fail "200 justos: $(json "$TMP/r.json" 'b.length') mensajes, anteriores=$HAY"

echo "4. Pedidos inválidos: 400 y no 500"
MAL=""; for q in "?sala=global&antes=abc" "?sala=global&antes=%27%20OR%201%3D1%20--" "?sala=global&limite=0" "?sala=global&limite=201" "?sala=global&limite=x" "?sala=global&limite=1.5"; do pedir "$ANA" "$q"; [ "$CODE" = "400" ] || MAL="$MAL [$q → $CODE]"; done
[ -z "$MAL" ] && pass "un «antes» que no es un identificador y un «limite» fuera de 1 a 200 responden 400" || fail "no responde 400:$MAL"
pedir "$ANA" "?sala=global&antes=00000000-0000-4000-8000-000000000000"; { [ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.length')" = "0" ] && [ "$HAY" = "false" ]; } && pass "un «antes» que no existe da una lista vacía y sin anteriores" || fail "antes inexistente: $CODE $(resumen)"
pedir "$ANA" "?sala=global&limite=5"; [ "$(json "$TMP/r.json" 'b.length')" = "5" ] && [ "$HAY" = "true" ] && pass "«limite=5» trae solo los 5 últimos" || fail "limite=5: $(resumen)"
CODIGO="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/chat/mensajes?sala=global")"; [ "$CODIGO" = "401" ] && pass "sin sesión sigue respondiendo 401" || fail "sin sesión → $CODIGO"

echo
echo "== Resultado: $OK OK, $KO con error"
[ "$KO" -eq 0 ]

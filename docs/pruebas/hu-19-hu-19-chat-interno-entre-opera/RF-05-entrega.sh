#!/usr/bin/env bash
# HU-19 / RF-05 (REQ-1795778246661) — Las fotos del chat son livianas: se reducen antes de enviarlas y la actualización del hilo no las vuelve a bajar.
#
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-05-entrega.sh            # una pasada
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-05-entrega.sh --carga 30 # además pide el hilo 30 veces y mide
#
# Requiere `npm run db:up` y la API levantada con este cambio (BASE_URL, por defecto http://127.0.0.1:3050). Si además la web compilada
# responde en WEB_URL (por defecto https://localhost:4173), corre RF-05-navegador.cjs con Playwright en Chrome: elige una foto de celular
# de 4000 × 3000, mide lo que se envía y lo que pesa cada actualización del hilo, y deja las capturas RF-05-paso-1.png a RF-05-paso-5.png.
# Crea usuarios temporales (un RT, un Firmante y una Secretaría) y los borra, con sus mensajes, al terminar.

set -u
CARGA=0
[ "${1:-}" = "--carga" ] && CARGA="${2:-30}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
WEB_URL="${WEB_URL:-https://localhost:4173}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
WEB="$RAIZ/apps/web"
TMP="$(mktemp -d)"
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
# enviar <token> <archivo con el cuerpo> → código en $CODE y respuesta en $TMP/r.json
enviar() { CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $1" -H 'Content-Type: application/json' --data-binary @"$2" "$BASE_URL/api/chat/mensajes")"; }
# foto <token o vacío> <ruta> → código en $CODE y bytes en $TMP/foto.bin
foto() { if [ -n "$1" ]; then CODE="$(curl -s -o "$TMP/foto.bin" -D "$TMP/h.txt" -w '%{http_code}' -H "Authorization: Bearer $1" "$BASE_URL$2")"; else CODE="$(curl -s -o "$TMP/foto.bin" -D "$TMP/h.txt" -w '%{http_code}' "$BASE_URL$2")"; fi; }
sha() { node -e 'console.log(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$1"; }
limpiar() {
  sql "select set_config('app.rol_actual','administrador',false); delete from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19f-%') or destinatario_id in (select id from usuarios where usuario like 'h19f-%')" >/dev/null
  sql "delete from usuarios where usuario like 'h19f-%'" >/dev/null; rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-19 / RF-05 contra $BASE_URL"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h19f-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('h19f-rt','Rita RT','rt_calle',null,'$HASH'),
  ('h19f-fir','Fermín Firmante','firmante',null,'$HASH'),
  ('h19f-sec','Sara Secretaría','secretaria',null,'$HASH')" >/dev/null
RT="$(login h19f-rt)"; FIR="$(login h19f-fir)"; SEC="$(login h19f-sec)"
for t in "$RT" "$FIR" "$SEC"; do { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario temporal: ¿está la API levantada en $BASE_URL?"; exit 1; }; done
ID_FIR="$(sql "select id from usuarios where usuario='h19f-fir'")"

# Una foto ya reducida de 300 KB (lo que manda la pantalla) y la misma en bytes, para comparar lo que devuelve la API
node -e '
const fs=require("fs"),c=require("crypto");const b=c.randomBytes(300*1024);fs.writeFileSync(process.argv[1]+"/foto.jpg",b);
const u="data:image/jpeg;base64,"+b.toString("base64");
fs.writeFileSync(process.argv[1]+"/grupo.json",JSON.stringify({tipoSala:"global",contenido:"",adjuntoUrl:u}));
fs.writeFileSync(process.argv[1]+"/privado.json",JSON.stringify({tipoSala:"directo",destinatarioId:process.argv[2],contenido:"",adjuntoUrl:u}));
fs.writeFileSync(process.argv[1]+"/pesada.json",JSON.stringify({tipoSala:"global",contenido:"x",adjuntoUrl:"data:image/jpeg;base64,"+c.randomBytes(600*1024+1).toString("base64")}));
fs.writeFileSync(process.argv[1]+"/sin-reducir.json",JSON.stringify({tipoSala:"global",contenido:"x",adjuntoUrl:"data:image/jpeg;base64,"+c.randomBytes(5*1024*1024).toString("base64")}));
' "$TMP" "$ID_FIR"
SHA_FOTO="$(sha "$TMP/foto.jpg")"

echo "1. Criterio 2: el hilo no lleva las fotos"
RUTAS=()
for i in 1 2 3 4 5; do enviar "$RT" "$TMP/grupo.json"; [ "$CODE" = "201" ] && RUTAS+=("$(json "$TMP/r.json" 'b.adjuntoUrl')"); done
[ "${#RUTAS[@]}" = "5" ] && echo "${RUTAS[0]}" | grep -Eq '^/api/chat/mensajes/[0-9a-f-]{36}/foto$' && pass "5 fotos de 300 KB enviadas; cada mensaje lleva solo la ruta de su foto (${RUTAS[0]})" || fail "no se pudieron enviar las 5 fotos (último código $CODE)"
CODE="$(curl -s -o "$TMP/hilo.json" -w '%{http_code}' -H "Authorization: Bearer $FIR" "$BASE_URL/api/chat/mensajes?sala=global")"
PESO="$(wc -c < "$TMP/hilo.json" | tr -d ' ')"
SUYAS="$(json "$TMP/hilo.json" 'b.filter(m=>m.emisorUsuario==="h19f-rt"&&(m.adjuntoUrl||"").endsWith("foto")).length')"
[ "$CODE" = "200" ] && [ "$SUYAS" = "5" ] && [ "$PESO" -lt 51200 ] && ! grep -q 'base64' "$TMP/hilo.json" && pass "la actualización del hilo con las 5 fotos pesa $PESO bytes ($((PESO/1024)) KB, menos de 50 KB) y no trae ninguna foto adentro" || fail "hilo: código $CODE, $PESO bytes, $SUYAS fotos del RT"

echo "2. Criterio 3: la foto la obtienen quien la envió y los demás del grupo, una vez y guardable"
for par in "RT:$RT" "Firmante:$FIR" "Secretaría:$SEC"; do
  nombre="${par%%:*}"; token="${par#*:}"; foto "$token" "${RUTAS[0]}"
  TIPO="$(grep -i '^content-type:' "$TMP/h.txt" | tr -d '\r' | cut -d' ' -f2)"; CACHE="$(grep -i '^cache-control:' "$TMP/h.txt" | tr -d '\r' | cut -d' ' -f2-)"
  [ "$CODE" = "200" ] && [ "$(sha "$TMP/foto.bin")" = "$SHA_FOTO" ] && [ "$TIPO" = "image/jpeg" ] && [ "$CACHE" = "private, max-age=31536000, immutable" ] \
    && pass "$nombre: 200, la misma foto byte a byte ($(wc -c < "$TMP/foto.bin" | tr -d ' ') bytes, $TIPO, «$CACHE»: el navegador la guarda y no la vuelve a pedir)" || fail "$nombre: $CODE $TIPO «$CACHE»"
done

echo "3. Criterio 4: solo quien puede leer el mensaje obtiene la foto"
foto "" "${RUTAS[0]}"; [ "$CODE" = "401" ] && pass "sin sesión → 401" || fail "sin sesión → $CODE"
enviar "$RT" "$TMP/privado.json"; PRIV="$(json "$TMP/r.json" 'b.adjuntoUrl')"
foto "$RT" "$PRIV"; C1="$CODE"; foto "$FIR" "$PRIV"; C2="$CODE"; foto "$SEC" "$PRIV"; C3="$CODE"
[ "$C1" = "200" ] && [ "$C2" = "200" ] && [ "$C3" = "404" ] && [ "$(sha "$TMP/foto.bin")" != "$SHA_FOTO" ] && pass "foto de un privado RT → Firmante: el RT 200, el Firmante 200, la Secretaría (tercera) 404 y no recibe la foto" || fail "privado: RT $C1, Firmante $C2, Secretaría $C3"

echo "4. Criterio 5: lo que pasa el tope no se guarda"
ANTES="$(sql "select count(*) from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19f-%')")"
enviar "$RT" "$TMP/pesada.json"; M1="$(json "$TMP/r.json" 'b.message')"; C1="$CODE"
enviar "$RT" "$TMP/sin-reducir.json"; C2="$CODE"
DESPUES="$(sql "select count(*) from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19f-%')")"
[ "$C1" = "400" ] && [ "$C2" = "400" ] && [ "$ANTES" = "$DESPUES" ] && echo "$M1" | grep -q "600 KB" && pass "una foto de 600 KB + 1 byte y una de 5 MB sin reducir → 400 «$M1», y no se guardó nada" || fail "tope: $C1 / $C2 «$M1» (mensajes $ANTES → $DESPUES)"

echo "5. Criterios 1 y 5 en la pantalla: las pruebas de la web"
(cd "$WEB" && NO_COLOR=1 npx vitest run src/chat/fotoReducida.test.ts src/chat/fotosDelChat.test.ts src/chat/foto.test.ts > "$TMP/v.txt" 2>&1)
R="$(grep -E '^ *Tests ' "$TMP/v.txt" | head -1 | sed 's/^ *//')"
echo "$R" | grep -q passed && ! echo "$R" | grep -q failed && pass "fotoReducida, fotosDelChat y foto: $R (1600 px de lado mayor, JPEG, menos de 500 KB, no es imagen, pasa el tope, una sola descarga por foto)" || fail "pruebas de la web: $R"

if [ "$CARGA" -gt 0 ]; then
  echo "6. Carga: $CARGA actualizaciones del hilo con las 5 fotos"
  MAX=0; LENTA=0; FALLAS=0
  for i in $(seq 1 "$CARGA"); do
    L="$(curl -s -o "$TMP/c.json" -w '%{http_code} %{size_download} %{time_total}' -H "Authorization: Bearer $FIR" "$BASE_URL/api/chat/mensajes?sala=global")"
    set -- $L; [ "$1" = "200" ] || FALLAS=$((FALLAS+1)); [ "$2" -gt "$MAX" ] && MAX="$2"
    MS="$(node -e 'console.log(Math.round(Number(process.argv[1])*1000))' "$3")"; [ "$MS" -gt "$LENTA" ] && LENTA="$MS"
  done
  [ "$FALLAS" = "0" ] && [ "$MAX" -lt 51200 ] && pass "$CARGA actualizaciones, $FALLAS fallidas; la más pesada $MAX bytes y la más lenta $LENTA ms (antes: más de 1,5 MB cada una con estas 5 fotos)" || fail "carga: $FALLAS fallidas, máximo $MAX bytes, la más lenta $LENTA ms"
fi

if curl -sk -o /dev/null --max-time 5 "$WEB_URL"; then
  echo "7. En el navegador (Playwright, Chrome): $WEB_URL"
  # Las fotos de las pruebas anteriores son bytes al azar (no se pueden dibujar): se borran para que en el navegador solo estén las de verdad
  sql "select set_config('app.rol_actual','administrador',false); delete from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19f-%')" >/dev/null
  if (cd "$RAIZ" && WEB_URL="$WEB_URL" RF05_RT=h19f-rt RF05_FIRMANTE=h19f-fir node "$AQUI/RF-05-navegador.cjs" > "$TMP/pw.txt" 2>&1); then
    pass "RF-05-navegador.cjs: $(grep -c '^OK' "$TMP/pw.txt") comprobaciones bien"; sed 's/^/        /' "$TMP/pw.txt"
  else fail "RF-05-navegador.cjs"; sed 's/^/        /' "$TMP/pw.txt"; fi
else
  echo "7. (la web no responde en $WEB_URL: no corro la prueba en el navegador)"
fi

echo
echo "== Resultado: $OK OK, $KO con error"
[ "$KO" -eq 0 ]

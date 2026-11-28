#!/usr/bin/env bash
# HU-19 / RF-07 (REQ-1795778246963) — La etiqueta de edificio del chat se elige para cada mensaje y la ven todos los que lo leen.
#
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-07-entrega.sh            # una pasada
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-07-entrega.sh --carga 30 # además manda 30 mensajes etiquetados y los lee otro
#
# Requiere `npm run db:up`, los datos de demo de HU-04 RF-02 y la API con este cambio (BASE_URL, por defecto http://127.0.0.1:3050; al arrancar
# aplica la migración 040). Usa rt.beto (DEMO Cabildo 1540 y DEMO Corrientes 100), rt.ana (solo DEMO Rivadavia 1234), demo.firmante y
# demo.secretaria, y un Firmante temporal sin edificios. Si la web compilada responde en WEB_URL (por defecto https://localhost:4173), corre
# RF-07-navegador.cjs con Playwright. Borra al terminar los mensajes que escribió (llevan una marca) y el usuario temporal.

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
MARCA="RF07-$(date +%s)"
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
# enviar <token> <cuerpo JSON> → código en $CODE y respuesta en $TMP/r.json
enviar() { printf '%s' "$2" > "$TMP/m.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $1" -H 'Content-Type: application/json' --data-binary @"$TMP/m.json" "$BASE_URL/api/chat/mensajes")"; }
# etiqueta <token> <id> → «edificio|máquina» del mensaje en el hilo del grupo, como lo ve ese usuario
etiqueta() { curl -s -o "$TMP/h.json" -H "Authorization: Bearer $1" "$BASE_URL/api/chat/mensajes?sala=global"; json "$TMP/h.json" "(b.find(m=>m.id===\"$2\")||{}).edificioNombre+\"|\"+(b.find(m=>m.id===\"$2\")||{}).maquinaRef"; }
edificios() { curl -s -o "$TMP/e.json" -H "Authorization: Bearer $1" "$BASE_URL/api/consorcios"; json "$TMP/e.json" 'b.map(e=>e.nombre).sort().join(", ")'; }
limpiar() {
  sql "select set_config('app.rol_actual','administrador',false); delete from chat_mensajes where contenido like '$MARCA%' or emisor_id in (select id from usuarios where usuario like 'h19g-%')" >/dev/null 2>&1
  sql "delete from usuarios where usuario like 'h19g-%'" >/dev/null 2>&1; rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-19 / RF-07 contra $BASE_URL"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h19g-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values ('h19g-fir','Firmante sin edificios','firmante',null,'$HASH')" >/dev/null
BETO="$(login rt.beto)"; ANA="$(login rt.ana)"; FIRD="$(login demo.firmante)"; SEC="$(login demo.secretaria)"; FIR0="$(login h19g-fir)"
for t in "$BETO" "$ANA" "$FIRD" "$SEC" "$FIR0"; do { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario (¿API en $BASE_URL y datos de demo de HU-04 RF-02?)"; exit 1; }; done
CABILDO="$(sql "select id from consorcios where nombre='DEMO Cabildo 1540'")"
[ -n "$CABILDO" ] || { echo "  ❌ no está DEMO Cabildo 1540: corré antes los datos de demo de HU-04 RF-02"; exit 1; }

echo "0. La migración 040 está aplicada"
[ "$(sql "select count(*) from information_schema.columns where table_name='chat_mensajes' and column_name='edificio_nombre'")" = "1" ] && [ "$(sql "select count(*) from schema_migrations where id='040_chat_edificio_nombre'" 2>/dev/null || echo 1)" != "0" ] && pass "chat_mensajes tiene la columna edificio_nombre (migración 040_chat_edificio_nombre)" || fail "falta la migración 040"

echo "1. Criterio 4: el selector ofrece a cada uno los edificios que puede ver (GET /api/consorcios)"
E="$(edificios "$BETO")"; [ "$E" = "DEMO Cabildo 1540, DEMO Corrientes 100" ] && pass "rt.beto (Técnico) ve sus asignados: $E" || fail "rt.beto ve: $E"
E="$(edificios "$ANA")"; [ "$E" = "DEMO Rivadavia 1234" ] && pass "rt.ana (Técnico) ve su asignado: $E" || fail "rt.ana ve: $E"
E="$(edificios "$FIRD")"; ESPERADO="$(sql "select string_agg(c.nombre, ', ' order by c.nombre) from roles_edificio r join consorcios c on c.id=r.consorcio_id where r.firmante_nombre='demo.firmante'")"
[ "$E" = "$ESPERADO" ] && pass "demo.firmante (Firmante) ve sus asignados: $E" || fail "demo.firmante ve «$E», esperado «$ESPERADO»"
N="$(json "$TMP/e.json" 'b.length' >/dev/null; curl -s -o "$TMP/e.json" -H "Authorization: Bearer $SEC" "$BASE_URL/api/consorcios"; json "$TMP/e.json" 'b.length')"; TOTAL="$(sql "select count(*) from consorcios")"
[ "$N" = "$TOTAL" ] && pass "demo.secretaria ve todos: $N de $TOTAL" || fail "demo.secretaria ve $N de $TOTAL"

echo "2. Criterio 2: la etiqueta la ven todos los que leen el mensaje"
enviar "$BETO" "{\"tipoSala\":\"global\",\"contenido\":\"$MARCA cables gastados\",\"consorcioId\":\"$CABILDO\",\"maquinaRef\":\"M1\"}"; ID="$(json "$TMP/r.json" 'b.id')"
[ "$CODE" = "201" ] && pass "rt.beto manda un mensaje con DEMO Cabildo 1540 y la máquina M1 → 201" || fail "envío de rt.beto → $CODE"
for par in "rt.beto:$BETO" "rt.ana (no asignado):$ANA" "Firmante sin edificios:$FIR0" "demo.secretaria:$SEC"; do
  nombre="${par%%:*}"; token="${par#*:}"; V="$(etiqueta "$token" "$ID")"
  [ "$V" = "DEMO Cabildo 1540|M1" ] && pass "$nombre ve «📍 DEMO Cabildo 1540 · Ascensor M1»" || fail "$nombre ve «$V»"
done
[ "$(sql "select edificio_nombre from chat_mensajes where id='$ID'")" = "DEMO Cabildo 1540" ] && pass "el nombre quedó guardado con el mensaje (chat_mensajes.edificio_nombre)" || fail "el nombre no quedó guardado"

echo "3. Criterios 1 y 3: cada mensaje lleva su propio edificio; la máquina va solo con edificio y hasta 40 caracteres"
enviar "$BETO" "{\"tipoSala\":\"global\",\"contenido\":\"$MARCA sin edificio\"}"; ID2="$(json "$TMP/r.json" 'b.id')"
[ "$(etiqueta "$ANA" "$ID2")" = "null|null" ] && pass "el mensaje siguiente, sin edificio, sale sin etiqueta" || fail "el mensaje sin edificio tiene etiqueta: $(etiqueta "$ANA" "$ID2")"
enviar "$BETO" "{\"tipoSala\":\"global\",\"contenido\":\"$MARCA solo maquina\",\"maquinaRef\":\"M2\"}"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.maquinaRef')" = "null" ] && pass "una máquina sin edificio no se guarda" || fail "máquina sin edificio: $CODE $(json "$TMP/r.json" 'b.maquinaRef')"
enviar "$BETO" "{\"tipoSala\":\"global\",\"contenido\":\"$MARCA larga\",\"consorcioId\":\"$CABILDO\",\"maquinaRef\":\"$(printf 'M%.0s' $(seq 1 41))\"}"
[ "$CODE" = "400" ] && pass "una máquina de 41 caracteres → 400 «$(json "$TMP/r.json" 'b.message')»" || fail "máquina de 41 caracteres → $CODE"
enviar "$ANA" "{\"tipoSala\":\"global\",\"contenido\":\"$MARCA ajeno\",\"consorcioId\":\"$CABILDO\"}"
[ "$CODE" = "400" ] && pass "rt.ana no puede etiquetar DEMO Cabildo 1540, que no ve → 400 «$(json "$TMP/r.json" 'b.message')»" || fail "rt.ana etiquetando un edificio ajeno → $CODE"

echo "4. Las pruebas de la web"
(cd "$WEB" && NO_COLOR=1 npx vitest run src/chat/etiquetaEdificio.test.ts > "$TMP/v.txt" 2>&1)
R="$(grep -E '^ *Tests ' "$TMP/v.txt" | head -1 | sed 's/^ *//')"
echo "$R" | grep -q passed && ! echo "$R" | grep -q failed && pass "etiquetaEdificio.test.ts: $R" || fail "etiquetaEdificio.test.ts: $R"

if [ "$CARGA" -gt 0 ]; then
  echo "5. Carga: $CARGA mensajes etiquetados de rt.beto leídos por rt.ana"
  BIEN=0; LENTA=0
  for i in $(seq 1 "$CARGA"); do
    T0=$(date +%s%3N); enviar "$BETO" "{\"tipoSala\":\"global\",\"contenido\":\"$MARCA carga $i\",\"consorcioId\":\"$CABILDO\",\"maquinaRef\":\"M$((i%9+1))\"}"; IDC="$(json "$TMP/r.json" 'b.id')"
    [ "$CODE" = "201" ] && [ "$(etiqueta "$ANA" "$IDC")" = "DEMO Cabildo 1540|M$((i%9+1))" ] && BIEN=$((BIEN+1))
    MS=$(( $(date +%s%3N) - T0 )); [ "$MS" -gt "$LENTA" ] && LENTA="$MS"
  done
  [ "$BIEN" = "$CARGA" ] && pass "$CARGA de $CARGA mensajes llegaron con su etiqueta a quien no tiene el edificio; la vuelta más lenta (enviar + leer) $LENTA ms" || fail "carga: $BIEN de $CARGA bien"
fi

if curl -sk -o /dev/null --max-time 5 "$WEB_URL"; then
  echo "6. En el navegador (Playwright, Chrome): $WEB_URL"
  if (cd "$RAIZ" && WEB_URL="$WEB_URL" RF07_MARCA="$MARCA" node "$AQUI/RF-07-navegador.cjs" > "$TMP/pw.txt" 2>&1); then
    pass "RF-07-navegador.cjs: $(grep -c '^OK' "$TMP/pw.txt") comprobaciones bien"; sed 's/^/        /' "$TMP/pw.txt"
  else fail "RF-07-navegador.cjs"; sed 's/^/        /' "$TMP/pw.txt"; fi
else
  echo "6. (la web no responde en $WEB_URL: no corro la prueba en el navegador)"
fi

echo
echo "== Resultado: $OK OK, $KO con error"
[ "$KO" -eq 0 ]

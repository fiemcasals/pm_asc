#!/usr/bin/env bash
# HU-19 / RF-06 (REQ-1795778246789) — El chat avisa en pantalla cuando un mensaje no se envió y muestra el estado real de la conexión.
#
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-06-entrega.sh            # una pasada
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-06-entrega.sh --carga 10 # además repite 10 veces la prueba en el navegador
#
# El cambio es todo de la pantalla. Corre las pruebas de la web y, si la web compilada responde en WEB_URL (por defecto https://localhost:4173,
# con la API detrás y `npm run db:up`), corre RF-06-navegador.cjs con Playwright en Chrome: corta la red, simula un error del servidor, provoca un
# rechazo real de la API y demora un envío para probar el doble envío. Crea un RT temporal y lo borra, con sus mensajes, al terminar.

set -u
CARGA=0
[ "${1:-}" = "--carga" ] && CARGA="${2:-10}"
WEB_URL="${WEB_URL:-https://localhost:4173}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
WEB="$RAIZ/apps/web"
CHAT="$WEB/src/chat"
TMP="$(mktemp -d)"
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
limpiar() {
  sql "select set_config('app.rol_actual','administrador',false); delete from chat_mensajes where emisor_id in (select id from usuarios where usuario like 'h19e-%')" >/dev/null 2>&1
  sql "delete from usuarios where usuario like 'h19e-%'" >/dev/null 2>&1; rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-19 / RF-06 (pantalla del chat)"

echo "1. Criterios 1 a 4: las pruebas de la web"
(cd "$WEB" && NO_COLOR=1 npx vitest run src/chat/envio.test.ts > "$TMP/v.txt" 2>&1)
R="$(grep -E '^ *Tests ' "$TMP/v.txt" | head -1 | sed 's/^ *//')"
echo "$R" | grep -q passed && ! echo "$R" | grep -q failed && pass "envio.test.ts: $R (sin red, error 5xx, rechazo 400 con su motivo, estado de la conexión, un solo envío a la vez)" || fail "envio.test.ts: $R"

echo "2. En el código de la pantalla"
V="$CHAT/ChatOperativoView.tsx"
! grep -q "'Equipo conectado'" "$V" && ! grep -q "· En línea" "$V" && grep -q 'data-testid="chat-estado-conexion"' "$V" && pass "la cabecera ya no tiene «Equipo conectado» ni «En línea» fijos: muestra textoDeConexion(conexion)" || fail "la cabecera sigue con texto fijo"
grep -q 'data-testid="chat-aviso-envio"' "$V" && grep -q 'data-testid="chat-btn-reintentar"' "$V" && pass "debajo de la caja de texto está el aviso del envío fallido con su botón «Reintentar»" || fail "falta el aviso del envío"

echo "3. Todo el chat de la web sigue andando"
(cd "$WEB" && NO_COLOR=1 npx vitest run src/chat > "$TMP/v2.txt" 2>&1)
R="$(grep -E '^ *Tests ' "$TMP/v2.txt" | head -1 | sed 's/^ *//')"
echo "$R" | grep -q passed && ! echo "$R" | grep -q failed && pass "src/chat completo: $R" || fail "src/chat: $R"

if curl -sk -o /dev/null --max-time 5 "$WEB_URL"; then
  echo "4. En el navegador (Playwright, Chrome): $WEB_URL"
  HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
  sql "delete from usuarios where usuario like 'h19e-%'" >/dev/null
  sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values ('h19e-rt','Elsa RT','rt_calle',null,'$HASH')" >/dev/null
  VUELTAS=$(( CARGA > 0 ? CARGA : 1 )); BIEN=0; LENTA=0
  for i in $(seq 1 "$VUELTAS"); do
    INICIO=$(date +%s%3N)
    if (cd "$RAIZ" && WEB_URL="$WEB_URL" RF06_RT=h19e-rt node "$AQUI/RF-06-navegador.cjs" > "$TMP/pw.txt" 2>&1); then BIEN=$((BIEN+1)); fi
    MS=$(( $(date +%s%3N) - INICIO )); [ "$MS" -gt "$LENTA" ] && LENTA="$MS"
    [ "$i" = "1" ] && cp "$TMP/pw.txt" "$TMP/pw-1.txt"
  done
  if [ "$BIEN" = "$VUELTAS" ]; then pass "RF-06-navegador.cjs: $(grep -c '^OK' "$TMP/pw-1.txt") comprobaciones bien"; sed 's/^/        /' "$TMP/pw-1.txt"
  else fail "RF-06-navegador.cjs: $BIEN de $VUELTAS vueltas bien"; sed 's/^/        /' "$TMP/pw.txt"; fi
  [ "$CARGA" -gt 0 ] && { [ "$BIEN" = "$VUELTAS" ] && pass "carga: $VUELTAS vueltas completas en el navegador, $((VUELTAS-BIEN)) con error; la más lenta $((LENTA/1000)) s" || fail "carga: $((VUELTAS-BIEN)) de $VUELTAS vueltas con error"; }
else
  echo "4. (la web no responde en $WEB_URL: no corro la prueba en el navegador)"
fi

echo
echo "== Resultado: $OK OK, $KO con error"
[ "$KO" -eq 0 ]

#!/usr/bin/env bash
# HU-19 / RF-08 (REQ-1795778247124) — Detalles del chat: hora en 24 horas con el día, y Escape cierra la foto agrandada.
#
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-08-entrega.sh
#
# No necesita la API ni la base: es todo de la pantalla. Corre las pruebas de la web que corresponden y comprueba en el código que el chat ya no use la
# hora del dispositivo. Lo que se VE (los separadores «Hoy», «Ayer» y la fecha, la hora de la lista de chats y la foto agrandada con su botón «Cerrar»)
# está en RF-08-entrega.md, con capturas hechas en un navegador de Tokio y en inglés (que sin este cambio mostraría «3:15 PM» y otro día).

set -u
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
WEB="$RAIZ/apps/web"
CHAT="$WEB/src/chat"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
vitest() { (cd "$WEB" && npx vitest run "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' > "$TMP/v.txt"); grep -E "^ *Tests " "$TMP/v.txt" | head -1; }

echo "== HU-19 / RF-08 (pantalla del chat)"

echo "1. Criterio 4: la prueba guardiana de formato de fechas de HU-12 RF-03 pasa"
R="$(vitest src/fechas/formato.test.ts)"
if echo "$R" | grep -q "passed" && ! echo "$R" | grep -q "failed"; then pass "fechas/formato.test.ts: $(echo "$R" | sed 's/^ *//')  (incluye «ninguna fecha con hora se formatea con toLocaleString o toLocaleTimeString»)"
else fail "fechas/formato.test.ts: $R $(grep -E "toLocale|ChatOperativoView" "$TMP/v.txt" | head -2)"; fi
USOS="$(grep -rnE "toLocale(Time|Date)?String\(" "$CHAT" --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l | tr -d ' ')"
[ "$USOS" = "0" ] && pass "ninguna parte del chat usa toLocaleTimeString / toLocaleString / toLocaleDateString" || fail "el chat usa $USOS veces el formato del dispositivo"

echo "2. Criterio 1: la hora, en 24 horas y con el formato común de la aplicación"
grep -q "{hora(m.creadoEn)}" "$CHAT/ChatOperativoView.tsx" && grep -q "{horaOFecha(c.ultimoMensajeHora)}" "$CHAT/ChatOperativoView.tsx" && pass "la hora de cada mensaje sale de hora() y la de la lista de chats de horaOFecha() (fechas/formato, hora de Buenos Aires)" || fail "la pantalla no usa hora()/horaOFecha()"
R="$(vitest src/chat/dias.test.ts src/fechas/formato-dia.test.ts)"
echo "$R" | grep -q "passed" && ! echo "$R" | grep -q "failed" && pass "las pruebas de la hora y el día (dias.test.ts, formato-dia.test.ts): $(echo "$R" | sed 's/^ *//') — 15:15 y nunca 03:15, 00:05 y nunca 24:05, Buenos Aires desde un navegador de Tokio" || fail "pruebas de hora y día: $R"

echo "3. Criterio 2: el día de los mensajes («Hoy», «Ayer» o la fecha)"
grep -q "conSeparadores(mensajes).map((elemento) => {" "$CHAT/ChatOperativoView.tsx" && grep -q 'data-testid="chat-separador-dia"' "$CHAT/ChatOperativoView.tsx" && pass "el hilo se arma con un separador delante del primer mensaje de cada día" || fail "el hilo no usa los separadores"
node -e '
const fs=require("fs");const s=fs.readFileSync(process.argv[1],"utf8");
const buscar=["etiquetaDeDia","horaOFecha","conSeparadores","diaAnterior"].filter(f=>!new RegExp("export function "+f).test(s));
process.exit(buscar.length?1:0)' "$CHAT/dias.ts" && pass "chat/dias.ts define etiquetaDeDia, horaOFecha, conSeparadores y diaAnterior" || fail "falta alguna función de chat/dias.ts"

echo "4. Criterio 3: la foto agrandada se cierra con Escape y con «Cerrar», y el foco vuelve a la miniatura"
V="$CHAT/ChatOperativoView.tsx"
{ grep -q 'role="dialog" aria-modal="true"' "$V" && grep -q "✕ Cerrar" "$V" && grep -q "document.addEventListener('keydown', alTeclear)" "$V" && grep -q "if (origen && origen.isConnected) origen.focus();" "$V"; } && pass "es un diálogo con botón «Cerrar», escucha Escape mientras está abierta y devuelve el foco a la miniatura" || fail "la foto agrandada no tiene el cierre esperado"
R="$(vitest src/chat/foto.test.ts)"
echo "$R" | grep -q "passed" && ! echo "$R" | grep -q "failed" && pass "las pruebas de la foto agrandada (foto.test.ts): $(echo "$R" | sed 's/^ *//')" || fail "pruebas de la foto: $R"

echo "5. Todo el chat y las fechas de la web siguen andando"
R="$(vitest src/chat src/fechas)"
echo "$R" | grep -q "passed" && ! echo "$R" | grep -q "failed" && pass "src/chat y src/fechas completos: $(echo "$R" | sed 's/^ *//')" || fail "src/chat y src/fechas: $R"

echo
echo "== Resultado: $OK OK, $KO con error"
[ "$KO" -eq 0 ]

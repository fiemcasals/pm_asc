#!/usr/bin/env bash
# HU-11 / RF-15 — WhatsApp y diagnóstico de seguridad con sesión: solo quien corresponde.
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-15-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea usuarios temporales (un RT, un Firmante y una ECA) y los borra al terminar. BASE_URL por defecto http://127.0.0.1:3050.
#
# NO manda ningún WhatsApp real: con proveedor configurado en la API (variables WHATSAPP_*) solo se comprueban los rechazos, que nunca llegan
# al proveedor; sin proveedor, lo que pasa el control queda en el historial como «no_configurado» y no sale nada. Lo que hace la pantalla
# (criterios 4 y 5) se prueba en las pruebas de la web y a mano: ver RF-15-entrega.md.

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
JSONH=(-H 'Content-Type: application/json')
AVISO='{"telefonoDestino":"+5491100000099","nombreEca":"ECA de prueba RF-15","consorcio":"Edificio de prueba","equipo":"M1 - prueba","estado":"Fuera de Servicio","detalle":"Prueba de acceso, no es un aviso real"}'
DISPARO='{"alertaId":"ALT-MAICON-001"}'
# Las cinco rutas: «metodo ruta cuerpo»
RUTAS=("POST /api/whatsapp/enviar-alerta $AVISO" "POST /api/whatsapp/formatear $AVISO" "POST /api/whatsapp/trigger-alerta-critica $DISPARO" "GET /api/whatsapp/estado -" "GET /api/seguridad/rls -")
llamar() { # llamar <token|-> <indice de ruta> → código en $CODE
  local def="${RUTAS[$2]}" m r c; m="${def%% *}"; def="${def#* }"; r="${def%% *}"; c="${def#* }"
  if [ "$c" = "-" ]; then http "$1" "$m" "$r"; else http "$1" "$m" "$r" "${JSONH[@]}" -d "$c"; fi
}
historial() { http "$SEC" GET /api/whatsapp/historial; json "$TMP/r.json" 'b.total'; }
# El historial de envíos se guarda en la base: se borran los intentos de la prueba (la aplicación no puede borrarlos; lo hace el dueño de la base).
limpiar() {
  sql "select set_config('app.rol_actual','administrador',false); delete from whatsapp_envios where registro->>'telefonoDestino' = '+5491100000099'" >/dev/null
  sql "delete from usuarios where usuario like 'h15w-%'" >/dev/null; rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-11 / RF-15 contra $BASE_URL"
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario like 'h15w-%'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('h15w-rt','RT','rt_calle',null,'$HASH'),
  ('h15w-fir','Firmante','firmante',null,'$HASH'),
  ('h15w-eca','ECA','eca','Conservación Porteña S.R.L.','$HASH')" >/dev/null
RT="$(login h15w-rt)"; FIR="$(login h15w-fir)"; ECA="$(login h15w-eca)"; SEC="$(login demo.secretaria)"; ADM="$(login demo.admin)"
for t in "$RT" "$FIR" "$ECA" "$SEC" "$ADM"; do
  { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario: corré antes RF-02-datos-demo.sh"; exit 1; }
done
http "$SEC" GET /api/whatsapp/estado; CONFIGURADO="$(json "$TMP/r.json" 'b.configurado')"
[ "$CONFIGURADO" = "true" ] && echo "   (la API tiene un proveedor de WhatsApp configurado: no se manda nada, solo se comprueban los rechazos)"
BASE_HIST="$(historial)"

echo "1. Criterio 1: sin sesión, 401 (y no se manda nada)"
MAL=""; for i in 0 1 2 3 4; do llamar - "$i"; [ "$CODE" = "401" ] || MAL="$MAL [${RUTAS[$i]%% -*} → $CODE]"; done
[ -z "$MAL" ] && pass "enviar-alerta, formatear, trigger-alerta-critica, estado y seguridad/rls responden 401 sin sesión" || fail "sin sesión:$(echo "$MAL" | cut -c1-300)"
MAL=""; for i in 0 1 2 3 4; do llamar "token.inventado.x" "$i"; [ "$CODE" = "401" ] || MAL="$MAL [$i → $CODE]"; done
[ -z "$MAL" ] && pass "con un token inventado también dan 401" || fail "token inventado:$MAL"
[ "$(historial)" = "$BASE_HIST" ] && pass "el historial de envíos no cambió: no se intentó mandar nada" || fail "el historial cambió sin sesión ($BASE_HIST → $(historial))"

echo "2. Criterio 2: la Secretaría y el Administrador usan WhatsApp; solo el Administrador ve el diagnóstico de RLS"
MAL=""; for t in "$RT" "$FIR" "$ECA"; do for i in 0 1 2 3; do llamar "$t" "$i"; [ "$CODE" = "403" ] || MAL="$MAL [$i → $CODE]"; done; done
[ -z "$MAL" ] && pass "el RT, el Firmante y la ECA reciben 403 en enviar-alerta, formatear, trigger-alerta-critica y estado" || fail "403:$MAL"
[ "$(historial)" = "$BASE_HIST" ] && pass "y el historial de envíos sigue igual: ninguno llegó a intentar el envío" || fail "el historial cambió con roles sin permiso"
MAL=""; for t in "$SEC" "$RT" "$FIR" "$ECA"; do llamar "$t" 4; [ "$CODE" = "403" ] || MAL="$MAL [rls → $CODE]"; done
[ -z "$MAL" ] && pass "la Secretaría, el RT, el Firmante y la ECA reciben 403 en el diagnóstico de RLS" || fail "rls:$MAL"
llamar "$ADM" 4; { [ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'typeof b.usuarioActual')" = "string" ]; } && pass "el Administrador ve el diagnóstico de RLS (200)" || fail "Administrador rls → $CODE $(head -c 150 "$TMP/r.json")"
MAL=""; for t in "$SEC" "$ADM"; do for i in 1 3; do llamar "$t" "$i"; { [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; } || MAL="$MAL [$i → $CODE]"; done; done
[ -z "$MAL" ] && pass "la Secretaría y el Administrador usan formatear y estado (sin mandar nada)" || fail "formatear/estado:$MAL"
if [ "$CONFIGURADO" = "true" ]; then
  echo "   (enviar-alerta y trigger-alerta-critica no se prueban con permiso: hay proveedor y saldría un mensaje)"
else
  MAL=""; for t in "$SEC" "$ADM"; do for i in 0 2; do llamar "$t" "$i"; { [ "$CODE" != "401" ] && [ "$CODE" != "403" ]; } || MAL="$MAL [$i → $CODE]"; done; done
  [ -z "$MAL" ] && pass "la Secretaría y el Administrador pasan el control en enviar-alerta y trigger-alerta-critica (sin proveedor no sale ningún mensaje)" || fail "enviar/trigger con permiso:$MAL"
fi

echo "3. Criterio 3: los webhooks siguen sin sesión y rechazan lo que no viene firmado"
http - POST /api/whatsapp/webhook/meta "${JSONH[@]}" -d '{"entry":[]}'
{ [ "$CODE" = "401" ] && [ "$(json "$TMP/r.json" 'b.message')" = "Firma del proveedor inválida: no se cambió ningún registro." ]; } && pass "Meta sin firma → 401 por la firma del proveedor (no por la sesión)" || fail "webhook Meta sin firma → $CODE $(head -c 150 "$TMP/r.json")"
http - POST /api/whatsapp/webhook/twilio -d 'MessageSid=SMrf15&MessageStatus=delivered'
{ [ "$CODE" = "401" ] && [ "$(json "$TMP/r.json" 'b.message')" = "Firma del proveedor inválida: no se cambió ningún registro." ]; } && pass "Twilio sin firma → 401 por la firma del proveedor (no por la sesión)" || fail "webhook Twilio sin firma → $CODE $(head -c 150 "$TMP/r.json")"
http - GET "/api/whatsapp/webhook/meta?hub.mode=subscribe&hub.verify_token=token-incorrecto&hub.challenge=123"
{ [ "$CODE" = "403" ] && [ "$(json "$TMP/r.json" 'b.message')" = "Token de verificación inválido." ]; } && pass "la verificación de Meta con un token incorrecto → 403 (la pide el proveedor, sin sesión)" || fail "verificación Meta → $CODE $(head -c 150 "$TMP/r.json")"

echo "4 y 5. Criterios 4 y 5 (pantalla): las pruebas de la web"
if command -v npx >/dev/null 2>&1; then
  RES="$(cd "$RAIZ/apps/web" && npx vitest run src/eca src/avisos 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Tests ')"
  echo "$RES" | grep -q "failed" && fail "pruebas del botón de WhatsApp y de la bandeja de avisos en la web: $RES" || { [ -n "$RES" ] && pass "pruebas del portal de la ECA y de la bandeja de avisos en la web en verde ($(echo "$RES" | xargs))" || fail "no pude correr las pruebas de la web"; }
else
  echo "   (sin npx: no se corrieron las pruebas de la web)"
fi

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

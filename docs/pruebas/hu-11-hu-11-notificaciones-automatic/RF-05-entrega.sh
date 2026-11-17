#!/usr/bin/env bash
# HU-11 / RF-05 — Ningún aviso de falla crítica sale solo: queda «Pendiente de revisión» hasta que la Secretaría lo aprueba.
#
#   bash docs/pruebas/hu-11-hu-11-aviso-por-whatsapp-y-pdf-l/RF-05-entrega.sh
#
# Requiere la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET), `npm run db:up` y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Entra como demo.secretaria y crea un RT temporal (demo.rt.avisos) para probar el 403; lo borra al terminar.
# La API de desarrollo no tiene proveedor de WhatsApp ni SMTP: al aprobar, los envíos se intentan y quedan registrados como «no salió»
# (el aviso queda «Falló el envío», con la aprobación guardada); con proveedor configurado pasa a «Enviado».
# BASE_URL por defecto http://127.0.0.1:3050 (la API directa).

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
TMP="$(mktemp -d)"
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
http() { # http <token|-> <metodo> <ruta> [cuerpo] → código en $CODE, cuerpo en $TMP/r.json
  local auth=(); [ "$1" != "-" ] && auth=(-H "Authorization: Bearer $1")
  if [ -n "${4:-}" ]; then printf '%s' "$4" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" "${auth[@]}" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" "${auth[@]}" "$BASE_URL$3")"; fi
}
limpiar() { sql "delete from usuarios where usuario='demo.rt.avisos'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-11 / RF-05 contra $BASE_URL"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario='demo.rt.avisos'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.avisos','demo.rt.avisos','rt_calle','$HASH')" >/dev/null
SEC="$(login demo.secretaria)"; RT="$(login demo.rt.avisos)"
{ [ -n "$SEC" ] && [ "$SEC" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }

echo "1. Al registrarse una falla crítica no sale nada: el aviso queda «Pendiente de revisión» en la bandeja"
http - POST /api/fallas-criticas/informes '{"maquinaId":"MAQ-CORRIENTES-M1","inspector":"rt1","fallasCriticas":["BOTON_PARE_FALLA"]}'
ID="$(json "$TMP/r.json" 'b.informe.id')"
[ "$CODE" = "201" ] && [ -n "$ID" ] && pass "informe con falla crítica registrado ($ID)" || { fail "informe → $CODE $(cat "$TMP/r.json" | head -c 200)"; exit 1; }
http "$SEC" GET "/api/whatsapp/historial?alertaId=$ID"
[ "$(json "$TMP/r.json" 'b.total')" = "0" ] && pass "no hay ningún intento de WhatsApp para esa falla" || fail "se intentó enviar sin aprobación: $(cat "$TMP/r.json" | head -c 200)"
http "$SEC" GET "/api/avisos?estado=Pendiente%20de%20revisi%C3%B3n"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.some(a=>a.alertaId==="'$ID'"&&a.estado==="Pendiente de revisión"&&a.envios.length===0&&a.aprobadoPor===null)')" = "true" ] && pass "el aviso figura «Pendiente de revisión», sin envíos ni aprobación" || fail "bandeja: $(cat "$TMP/r.json" | head -c 300)"
AV="$(json "$TMP/r.json" 'b.find(a=>a.alertaId==="'$ID'").id')"

echo "2. El disparo de un aviso no aprobado responde 409 con el motivo"
http "$SEC" POST /api/whatsapp/trigger-alerta-critica "{\"alertaId\":\"$ID\"}"
[ "$CODE" = "409" ] && grep -q "pendiente de revisión" "$TMP/r.json" && pass "trigger-alerta-critica → 409 «pendiente de revisión»" || fail "trigger → $CODE $(cat "$TMP/r.json" | head -c 200)"
http "$SEC" GET "/api/whatsapp/historial?alertaId=$ID"
[ "$(json "$TMP/r.json" 'b.total')" = "0" ] && pass "sigue sin haber envíos" || fail "hubo envíos"

echo "3. Sólo la Secretaría y el Administrador ven la bandeja y aprueban"
http "$RT" GET /api/avisos; [ "$CODE" = "403" ] && pass "el RT no ve la bandeja (403)" || fail "RT bandeja → $CODE"
http "$RT" POST "/api/avisos/$AV/aprobar"; [ "$CODE" = "403" ] && pass "el RT no aprueba (403)" || fail "RT aprueba → $CODE"
http - GET /api/avisos; [ "$CODE" = "401" ] && pass "sin sesión → 401" || fail "sin sesión → $CODE"

echo "4. «Aprobar y enviar»: WhatsApp a la ECA y al Firmante y correo a la ECA, a nombre de quien aprueba"
http "$SEC" POST "/api/avisos/$AV/aprobar" '{}'
[ "$CODE" = "201" ] && pass "aprobar → 201" || fail "aprobar → $CODE $(cat "$TMP/r.json" | head -c 300)"
[ "$(json "$TMP/r.json" 'b.aprobadoPor+"|"+(b.aprobadoEn?"con fecha":"sin fecha")')" = "demo.secretaria|con fecha" ] && pass "queda quién aprobó (demo.secretaria) y cuándo" || fail "aprobación: $(cat "$TMP/r.json" | head -c 300)"
[ "$(json "$TMP/r.json" 'b.envios.map(e=>e.canal).join(",")')" = "whatsapp_eca,whatsapp_firmante,email_eca" ] && pass "se intentaron los 3 envíos (WhatsApp ECA, WhatsApp Firmante, correo ECA)" || fail "envíos: $(cat "$TMP/r.json" | head -c 300)"
ESTADO="$(json "$TMP/r.json" 'b.estado')"
case "$ESTADO" in
  "Enviado") pass "estado «Enviado» (hay proveedor de WhatsApp configurado)";;
  "Falló el envío") pass "estado «Falló el envío»: la API de desarrollo no tiene proveedor de WhatsApp, y no se simula la entrega";;
  *) fail "estado inesperado: $ESTADO";;
esac
http "$SEC" GET "/api/whatsapp/historial?alertaId=$ID"
[ "$(json "$TMP/r.json" 'b.total')" = "2" ] && [ "$(json "$TMP/r.json" 'b.registros.every(r=>r.aprobadoPor==="demo.secretaria"&&r.aprobadoEn)')" = "true" ] && pass "el historial de envíos registra quién aprobó y cuándo (2 registros)" || fail "historial: $(cat "$TMP/r.json" | head -c 300)"
http "$SEC" GET "/api/avisos?estado=Pendiente%20de%20revisi%C3%B3n"
[ "$(json "$TMP/r.json" 'b.some(a=>a.alertaId==="'$ID'")')" = "false" ] && pass "ya no está entre los pendientes" || fail "sigue pendiente"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

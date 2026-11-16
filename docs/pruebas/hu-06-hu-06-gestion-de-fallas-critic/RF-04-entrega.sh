#!/usr/bin/env bash
# HU-06 / RF-04 — La alerta de Falla Crítica llega al Firmante del edificio y se registra quién la abrió primero (API).
#
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-04-entrega.sh
#
# Requiere `npm run db:up`, la API levantada y los datos demo de HU-04 (RF-02-datos-demo.sh crea demo.secretaria). Crea dos Firmantes de prueba
# (`gonza`, el de las máquinas de ejemplo, y `otro.firmante`) y los borra al terminar. Los informes de fallas son datos EN MEMORIA de la API:
# el de esta prueba queda hasta que se reinicie (Ctrl+C y de nuevo npm run dev). Corré el script una sola vez por arranque.
# La alarma que se repite hasta abrir la alerta es de pantalla: se prueba a mano (ver RF-04-alarma-y-apertura.md). BASE_URL por defecto http://127.0.0.1:3050.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"; trap 'limpiar; rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
limpiar() { sql "delete from usuarios where usuario in ('gonza','otro.firmante')" >/dev/null; sql "delete from intentos_login where usuario in ('gonza','otro.firmante')" >/dev/null; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
api() { # api <token> <metodo> <ruta> → $CODE y $TMP/r.json
  CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" "$BASE_URL$3")"
}

echo "== HU-06 / RF-04 contra $BASE_URL"
limpiar
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
for u in gonza otro.firmante; do sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('$u','$u','firmante','$HASH')" >/dev/null; done
SEC="$(login demo.secretaria)"; GONZA="$(login gonza)"; OTRO="$(login otro.firmante)"
for t in "$SEC" "$GONZA" "$OTRO"; do [ -n "$t" ] && [ "$t" != "undefined" ] || { echo "  ❌ no pude ingresar (¿corriste RF-02-datos-demo.sh?)"; exit 1; }; done

echo "1. La alerta la ve el Firmante asignado al edificio"
printf '{"maquinaId":"MAQ-CORRIENTES-M1","inspector":"Ing. Prueba","fallasCriticas":["PARACAIDAS_ANOMALIA"]}' > "$TMP/b.json"
curl -s -o "$TMP/inf.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL/api/fallas-criticas/informes"
ID="$(json "$TMP/inf.json" 'b.informe.id')"; [ -n "$ID" ] && [ "$ID" != "undefined" ] && pass "se registra una Falla Crítica en el edificio de gonza ($ID)" || fail "no se pudo registrar el informe: $(head -c 200 "$TMP/inf.json")"
api "$GONZA" GET /api/fallas-criticas/informes
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.some(e=>e.informeId==="'$ID'"&&e.firmanteUsername==="gonza")')" = "true" ] && pass "gonza (el Firmante asignado) la ve en su lista" || fail "gonza no la ve: $CODE $(head -c 200 "$TMP/r.json")"
api "$OTRO" GET /api/fallas-criticas/informes
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.some(e=>e.informeId==="'$ID'")')" = "false" ] && pass "otro.firmante (de otro edificio) no la ve" || fail "otro.firmante ve la alerta: $CODE"
api "$SEC" GET /api/fallas-criticas/informes
[ "$(json "$TMP/r.json" 'b.some(e=>e.informeId==="'$ID'")')" = "true" ] && pass "la Secretaría la ve" || fail "la Secretaría no la ve"

echo "2. La alerta registra qué usuario la abrió primero, con fecha y hora"
[ "$(json "$TMP/r.json" 'b.find(e=>e.informeId==="'$ID'").abiertaPor')" = "null" ] && pass "mientras nadie la abre, abiertaPor es null (la alarma sigue sonando)" || fail "ya figura abierta"
api "$OTRO" POST "/api/fallas-criticas/informes/$ID/abrir"
[ "$CODE" = "403" ] && pass "otro.firmante intenta abrirla → 403" || fail "otro.firmante abre → $CODE"
api "$SEC" POST "/api/fallas-criticas/informes/$ID/abrir"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.abiertaPor+"|"+b.primera')" = "demo.secretaria|true" ] && pass "la Secretaría la abre → queda registrada a nombre de demo.secretaria" || fail "abrir → $CODE $(head -c 200 "$TMP/r.json")"
FECHA="$(json "$TMP/r.json" 'b.abiertaEn')"
api "$GONZA" POST "/api/fallas-criticas/informes/$ID/abrir"
[ "$(json "$TMP/r.json" 'b.abiertaPor+"|"+b.primera+"|"+(b.abiertaEn==="'$FECHA'")')" = "demo.secretaria|false|true" ] && pass "una segunda apertura (de gonza) no cambia al primero ni su hora" || fail "segunda apertura: $(head -c 200 "$TMP/r.json")"
api "$GONZA" GET /api/fallas-criticas/informes
[ "$(json "$TMP/r.json" 'b.find(e=>e.informeId==="'$ID'").abiertaPor')" = "demo.secretaria" ] && pass "la lista muestra quién la abrió primero (y por eso la alarma deja de sonar)" || fail "la lista no muestra la apertura"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/fallas-criticas/informes/$ID/abrir")"
[ "$CODE" = "401" ] && pass "sin sesión no se puede abrir (401)" || fail "sin sesión → $CODE"

echo; echo "Limpiando los Firmantes de prueba… (reiniciá la API para quitar el informe de ejemplo)"
echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

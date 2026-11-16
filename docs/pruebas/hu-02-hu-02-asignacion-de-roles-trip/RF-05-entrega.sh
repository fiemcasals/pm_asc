#!/usr/bin/env bash
# HU-02 / RF-05 — El teléfono y el email del RT de Calle viven en su usuario y la reasignación los copia a la terna.
#
#   bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-05-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos
# de demostración de HU-04: bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Entra como demo.admin (Administrador) y demo.secretaria; no deja datos: al terminar devuelve el contacto de los RT.
# BASE_URL por defecto http://127.0.0.1:3050 (la API directa).

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
FECHA="2026-11-25"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
http() { # http <token> <metodo> <ruta> [cuerpo] → código en $CODE, cuerpo en $TMP/r.json
  if [ -n "${4:-}" ]; then printf '%s' "$4" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" "$BASE_URL$3")"; fi
}

echo "== HU-02 / RF-05 contra $BASE_URL"
ADMIN="$(login demo.admin)"; SEC="$(login demo.secretaria)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
ID() { sql "select id from usuarios where usuario='$1'"; }
EDIF="$(sql "select id from consorcios where nombre='DEMO Rivadavia 1234'")"
[ -n "$EDIF" ] || { echo "  ❌ falta el edificio DEMO Rivadavia 1234: corré RF-02-datos-demo.sh"; exit 1; }
sql "update roles_edificio set rt_calle_nombre='rt.ana', rt_calle_telefono='11 0000-0000', rt_calle_email='viejo@rt.com' where consorcio_id='$EDIF'" >/dev/null
sql "delete from reasignaciones_rt where consorcio_id='$EDIF'" >/dev/null

echo "1. El Administrador carga y edita el contacto de un RT"
http "$ADMIN" PUT "/api/usuarios/$(ID rt.diego)/contacto" '{"telefono":"11 7777-0001","email":"diego@demo.com"}'
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.telefono+"|"+b.email')" = "11 7777-0001|diego@demo.com" ] && pass "PUT contacto → 200 y lo devuelve" || fail "PUT contacto → $CODE $(cat "$TMP/r.json")"
http "$ADMIN" GET "/api/usuarios/$(ID rt.diego)"
[ "$(json "$TMP/r.json" 'b.telefono+"|"+b.email')" = "11 7777-0001|diego@demo.com" ] && pass "GET del usuario lo devuelve" || fail "GET: $(cat "$TMP/r.json")"
http "$ADMIN" PUT "/api/usuarios/$(ID rt.diego)/contacto" '{"email":"no-es-un-email"}'
[ "$CODE" = "400" ] && pass "un email inválido → 400" || fail "email inválido → $CODE"
http "$ADMIN" PUT "/api/usuarios/$(ID demo.secretaria)/contacto" '{"telefono":"1"}'
[ "$CODE" = "409" ] && pass "a un usuario que no es rt_calle → 409" || fail "no rt_calle → $CODE"
http "$SEC" PUT "/api/usuarios/$(ID rt.diego)/contacto" '{"telefono":"1"}'
[ "$CODE" = "403" ] && pass "la Secretaría no puede (403)" || fail "Secretaría → $CODE"

echo "2. Al reasignar, la terna toma el contacto del RT nuevo"
http "$SEC" POST "/api/semaforo/$EDIF/reasignacion" "{\"rtAnterior\":\"rt.ana\",\"rtNuevo\":\"rt.diego\",\"fecha\":\"$FECHA\"}"
[ "$CODE" = "201" ] && pass "reasignación rt.ana → rt.diego → 201" || fail "reasignación → $CODE $(cat "$TMP/r.json")"
[ "$(sql "select rt_calle_nombre||'|'||rt_calle_telefono||'|'||rt_calle_email from roles_edificio where consorcio_id='$EDIF'")" = "rt.diego|11 7777-0001|diego@demo.com" ] && pass "la terna quedó con el teléfono y el email de rt.diego (no los de rt.ana ni vacíos)" || fail "terna distinta"

echo "3. Un RT sin teléfono ni email no puede recibir el edificio"
sql "update usuarios set telefono=null, email=null where usuario='rt.carla'" >/dev/null
http "$SEC" POST "/api/semaforo/$EDIF/reasignacion" "{\"rtAnterior\":\"rt.diego\",\"rtNuevo\":\"rt.carla\",\"fecha\":\"$FECHA\"}"
[ "$CODE" = "409" ] && pass "→ 409: $(json "$TMP/r.json" 'b.message')" || fail "sin contacto → $CODE"
[ "$(sql "select rt_calle_nombre from roles_edificio where consorcio_id='$EDIF'")" = "rt.diego" ] && [ "$(sql "select count(*) from reasignaciones_rt where consorcio_id='$EDIF'")" = "1" ] && pass "no cambió nada: sigue rt.diego y hay 1 solo registro" || fail "el rechazo dejó cambios"

echo "Dejando los datos como estaban…"
sql "update usuarios set telefono='11 4444-carla', email='rt.carla@demo.com' where usuario='rt.carla'" >/dev/null
sql "update usuarios set telefono='11 4444-diego', email='rt.diego@demo.com' where usuario='rt.diego'" >/dev/null
sql "delete from reasignaciones_rt where consorcio_id='$EDIF'" >/dev/null
sql "update roles_edificio set rt_calle_nombre='rt.ana', rt_calle_telefono='11 5555-0000', rt_calle_email=null where consorcio_id='$EDIF'" >/dev/null

echo; echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

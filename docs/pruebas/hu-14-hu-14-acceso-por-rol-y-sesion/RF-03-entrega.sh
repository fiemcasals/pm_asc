#!/usr/bin/env bash
# HU-14 / RF-03 (REQ-1795263644283) — Un Firmante y un usuario de ECA con sesión en los datos de demo.
#
#   bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-03-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y docker.
# OJO: empieza con `RF-02-datos-demo.sh --limpiar`, que borra los edificios DEMO y las cuentas demo.* y rt.*, y los vuelve a crear.
# Son datos de demostración: no toca otros edificios ni otras cuentas.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
DEMO="$(cd "$(dirname "$0")/../hu-04-hu-04-semaforo-de-control-mens" && pwd)/RF-02-datos-demo.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { # login <usuario> → token (vacío si falla)
  printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"
  curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"
  json "$TMP/lr.json" 'b.accessToken||""'
}
get() { curl -s -o "$TMP/r.json" -w '%{http_code}' -H "Authorization: Bearer $1" "$BASE_URL$2"; }
contar() { sql "select (select count(*) from usuarios where usuario like 'demo.%' or usuario like 'rt.%')||'/'||(select count(*) from consorcios where nombre like 'DEMO %')"; }

echo "== HU-14 / RF-03 contra $BASE_URL"
echo "Preparando los datos de demo desde cero…"
BASE_URL="$BASE_URL" bash "$DEMO" --limpiar >/dev/null
BASE_URL="$BASE_URL" bash "$DEMO" > "$TMP/demo1.txt" 2>&1 || { cat "$TMP/demo1.txt"; fail "el script de datos de demo falló"; exit 1; }

echo "1. Existen un Firmante y un usuario de ECA que ingresan con la clave de demo"
TF="$(login demo.firmante)"; [ -n "$TF" ] && pass "demo.firmante ingresa" || fail "demo.firmante no ingresa: $(cat "$TMP/lr.json")"
TE="$(login demo.eca)"; [ -n "$TE" ] && pass "demo.eca ingresa" || fail "demo.eca no ingresa: $(cat "$TMP/lr.json")"
[ "$(sql "select rol from usuarios where usuario='demo.firmante'")" = "firmante" ] && pass "demo.firmante tiene rol firmante" || fail "rol de demo.firmante"
[ "$(sql "select rol||'/'||eca from usuarios where usuario='demo.eca'")" = "eca/ECA Demo" ] && pass "demo.eca tiene rol eca y su ECA es «ECA Demo»" || fail "rol o ECA de demo.eca"

echo "2. El Firmante de demo ve las máquinas de los edificios cuya terna lo nombra, y no las de otros"
TS="$(login demo.secretaria)"
code="$(get "$TS" /api/consorcios)"; cp "$TMP/r.json" "$TMP/cons.json"
code="$(get "$TF" /api/firmante/maquinas)"
if [ "$code" = "200" ]; then
  vistos="$(node -e '
    const f=require("fs");const m=JSON.parse(f.readFileSync(process.argv[1]));const c=JSON.parse(f.readFileSync(process.argv[2]));
    const nombre=id=>(c.find(x=>x.id===id)||{}).nombre||"(sin edificio de la base)";
    console.log([...new Set(m.map(x=>nombre(x.consorcioId)))].sort().join(" | "))' "$TMP/r.json" "$TMP/cons.json")"
  esperado="DEMO Cabildo 1540 | DEMO Corrientes 100 | DEMO Rivadavia 1234"
  [ "$vistos" = "$esperado" ] && pass "ve sólo sus 3 edificios: $vistos" || fail "ve: «$vistos» (se esperaba «$esperado»)"
  n="$(json "$TMP/r.json" 'b.length')"; [ "$n" = "6" ] && pass "son 6 máquinas (2 por edificio)" || fail "ve $n máquinas (se esperaban 6)"
else
  fail "GET /api/firmante/maquinas → HTTP $code"
fi

echo "3. El usuario de ECA de demo ve sólo los edificios de su ECA"
code="$(get "$TE" /api/eca/maquinas)"
if [ "$code" = "200" ]; then
  ecas="$(json "$TMP/r.json" '[...new Set(b.map(m=>m.eca))].join(",")')"
  n="$(json "$TMP/r.json" 'b.length')"
  [ "$ecas" = "ECA Demo" ] && [ "$n" = "6" ] && pass "ve 6 máquinas, todas de «ECA Demo»" || fail "ve $n máquinas de: $ecas"
  code="$(get "$TE" "/api/eca/maquinas?eca=ECA%20Otra")"
  n="$(json "$TMP/r.json" 'b.filter(m=>m.eca==="ECA Otra").length')"
  [ "$n" = "0" ] && pass "pedir «ECA Otra» no le muestra nada de esa ECA" || fail "con ?eca=ECA Otra ve $n máquinas de esa ECA"
else
  fail "GET /api/eca/maquinas → HTTP $code"
fi

echo "4. Correr el script dos veces no duplica ni falla"
antes="$(contar)"
BASE_URL="$BASE_URL" bash "$DEMO" > "$TMP/demo2.txt" 2>&1; salida=$?
[ "$salida" = "0" ] && pass "la segunda corrida termina bien" || fail "la segunda corrida terminó con código $salida: $(cat "$TMP/demo2.txt")"
despues="$(contar)"
[ "$antes" = "$despues" ] && pass "cuentas/edificios: $antes antes y $despues después" || fail "cuentas/edificios: $antes antes y $despues después"

echo
echo "== Resultado: $OK bien, $KO mal"
[ "$KO" -eq 0 ]

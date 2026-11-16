#!/usr/bin/env bash
# HU-06 / RF-05 — Estado del ascensor: el RT lo marca y el Firmante lo confirma (API).
#
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-05-entrega.sh
#
# Requiere `npm run db:up`, la API levantada y los datos demo de HU-04 (RF-02-datos-demo.sh crea demo.secretaria y los RT). Le pone una clave
# temporal a `rt.beto` (el RT) y crea dos Firmantes de prueba (`gonza`, el de las máquinas de ejemplo, y `otro.firmante`); al terminar se la saca y
# los borra. El estado de las máquinas es de ejemplo EN MEMORIA: queda hasta reiniciar la API (Ctrl+C y de nuevo npm run dev). Corré el script una
# sola vez por arranque. BASE_URL por defecto http://127.0.0.1:3050.

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
limpiar() {
  sql "delete from usuarios where usuario in ('gonza','otro.firmante')" >/dev/null
  sql "delete from intentos_login where usuario in ('gonza','otro.firmante','rt.beto')" >/dev/null
  sql "update usuarios set password_hash='sin-login' where usuario='rt.beto'" >/dev/null
}
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
api() { # api <token> <metodo> <ruta> [cuerpo] → $CODE y $TMP/r.json
  if [ -n "${4:-}" ]; then printf '%s' "$4" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d '{}' "$BASE_URL$3")"; fi
}
FOTO='data:image/jpeg;base64,AAAA'; M=MAQ-CORRIENTES-M1

echo "== HU-06 / RF-05 contra $BASE_URL"
limpiar
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "update usuarios set password_hash='$HASH' where usuario='rt.beto'" >/dev/null
for u in gonza otro.firmante; do sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('$u','$u','firmante','$HASH')" >/dev/null; done
RT="$(login rt.beto)"; SEC="$(login demo.secretaria)"; GONZA="$(login gonza)"; OTRO="$(login otro.firmante)"
for t in "$RT" "$SEC" "$GONZA" "$OTRO"; do [ -n "$t" ] && [ "$t" != "undefined" ] || { echo "  ❌ no pude ingresar (¿corriste RF-02-datos-demo.sh?)"; exit 1; }; done
estado_eca() { curl -s -o "$TMP/m.json" -H "Authorization: Bearer $SEC" "$BASE_URL/api/eca/maquinas?eca=porte%C3%B1a"; json "$TMP/m.json" 'b.find(m=>m.id==="'$M'").estadoOperativo+"|"+b.find(m=>m.id==="'$M'").confirmacionEstado'; }

echo "1. El RT marca el estado: queda pendiente de confirmación y se avisa a la Secretaría y al Firmante"
api "$RT" POST /api/paradas "{\"maquinaId\":\"$M\",\"estado\":\"Reparación Urgente\",\"causa\":\"Ruido fuerte al subir\",\"fotos\":[\"$FOTO\"]}"
ID="$(json "$TMP/r.json" 'b.id')"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.estado+"|"+b.avisadoA[0]')" = "Reparación Urgente — Pendiente de confirmación|secretaria" ] && pass "el RT marca «Reparación Urgente» → 201, queda «Pendiente de confirmación» y se avisa a la Secretaría y al Firmante" || fail "marcar → $CODE $(head -c 200 "$TMP/r.json")"
[ "$(estado_eca)" = "Reparación Urgente|Pendiente de confirmación" ] && pass "el portal de la ECA ya muestra el estado, pendiente de confirmación" || fail "estado en el portal de la ECA: $(estado_eca)"

echo "2. Sólo el Firmante asignado al edificio confirma o rechaza"
api "$SEC" POST "/api/paradas/$ID/confirmar"; [ "$CODE" = "403" ] && pass "la Secretaría intenta confirmar → 403" || fail "Secretaría confirma → $CODE"
api "$RT" POST "/api/paradas/$ID/confirmar";  [ "$CODE" = "403" ] && pass "el RT intenta confirmar → 403" || fail "RT confirma → $CODE"
api "$OTRO" POST "/api/paradas/$ID/confirmar"; [ "$CODE" = "403" ] && pass "otro.firmante (de otro edificio) intenta confirmar → 403" || fail "otro firmante confirma → $CODE"
api "$GONZA" POST "/api/paradas/$ID/confirmar"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.estado')" = "Reparación Urgente — Confirmado" ] && pass "gonza (el Firmante asignado) confirma → «Reparación Urgente — Confirmado»" || fail "gonza confirma → $CODE $(head -c 200 "$TMP/r.json")"

echo "3. El estado confirmado se ve en el portal de la ECA"
[ "$(estado_eca)" = "Reparación Urgente|Confirmado" ] && pass "el portal de la ECA muestra el estado confirmado" || fail "estado confirmado: $(estado_eca)"

echo "4. Volver a «Normal» exige una nueva inspección del RT con al menos una foto"
api "$RT" POST "/api/paradas/maquinas/$M/normalizar" '{}'; [ "$CODE" = "400" ] && pass "sin foto → 400" || fail "sin foto → $CODE"
api "$SEC" POST "/api/paradas/maquinas/$M/normalizar" "{\"fotos\":[\"$FOTO\"]}"; [ "$CODE" = "403" ] && pass "la Secretaría no puede volver el equipo a Normal → 403" || fail "Secretaría normaliza → $CODE"
api "$RT" POST "/api/paradas/maquinas/$M/normalizar" "{\"fotos\":[\"$FOTO\"]}"
[ "$CODE" = "200" ] && [ "$(estado_eca | cut -d'|' -f1)" = "Normal" ] && pass "con una foto vuelve a Normal (200) y el portal de la ECA lo muestra" || fail "normalizar → $CODE; estado: $(estado_eca)"

echo; echo "Limpiando la clave temporal del RT y los Firmantes de prueba… (reiniciá la API para dejar las máquinas de ejemplo como estaban)"
echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

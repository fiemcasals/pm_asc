#!/usr/bin/env bash
# HU-10 / RF-04 — Recordatorio a la ECA a las 24 h y aviso a la Secretaría a las 48 h sin acuse de recibo.
#
#   bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-04-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos demo de
# HU-04 (bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh, que crea demo.secretaria).
# Las alertas de ejemplo se detectaron el 6/11/2026: ya pasaron las 24 h y las 48 h. Para probar «acuse antes», se registra un
# acuse de ALT-MAICON-002 a las 2 h de detectada. Al terminar se borran los avisos y ese acuse. BASE_URL por defecto http://127.0.0.1:3050.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
TMP="$(mktemp -d)"; trap 'limpiar; rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
limpiar() { sql "delete from alertas_avisos where alerta_id in ('ALT-CP-001','ALT-MAICON-001','ALT-MAICON-002')" >/dev/null; sql "delete from acuses_recibo_legal where usuario = 'RF04.entrega'" >/dev/null; }

printf '{"usuario":"demo.secretaria","password":"Demo-Clave-2026"}' > "$TMP/l.json"
curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"
SEC="$(json "$TMP/lr.json" 'b.accessToken')"
[ -n "$SEC" ] && [ "$SEC" != "undefined" ] || { echo "  ❌ no pude ingresar como demo.secretaria: corré antes RF-02-datos-demo.sh"; exit 1; }

echo "== HU-10 / RF-04 contra $BASE_URL"
limpiar
sql "delete from acuses_recibo_legal where alerta_id = 'ALT-MAICON-002'" >/dev/null
sql "insert into acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, fecha_hora, tipo_alerta) values ('ALT-MAICON-002','MAQ-SANTAFE-M2','MAICON Mantenimiento','RF04.entrega','2026-11-06T09:45:00Z','Falla')" >/dev/null

echo "1. Una alerta sin acuse: recordatorio a la ECA (24 h) y aviso a la Secretaría (48 h)"
curl -s -o "$TMP/cp.json" "$BASE_URL/api/eca/alertas?eca=porte%C3%B1a"
[ "$(json "$TMP/cp.json" 'b.alertas.find(a=>a.alerta.id==="ALT-CP-001").alerta.historial.map(e=>e.tipo).join(",")')" = "recordatorio_eca_24h,aviso_secretaria_48h" ] && pass "ALT-CP-001 (Conservación Porteña): historial con el recordatorio y el aviso" || fail "historial CP: $(head -c 300 "$TMP/cp.json")"
[ "$(json "$TMP/cp.json" 'b.alertas.find(a=>a.alerta.id==="ALT-CP-001").alerta.historial[0].edificio')" = "Consorcio Corrientes 1234" ] && pass "el registro lleva el edificio y la ECA" || fail "edificio del registro"
curl -s -o "$TMP/ma.json" "$BASE_URL/api/eca/alertas?eca=maicon"
[ "$(json "$TMP/ma.json" 'b.alertas.find(a=>a.alerta.id==="ALT-MAICON-001").alerta.historial.length')" = "2" ] && pass "ALT-MAICON-001 (sin acuse): también tiene los dos" || fail "historial MAICON-001"

echo "2. Si la ECA acusa recibo antes, no se manda nada"
[ "$(json "$TMP/ma.json" 'b.alertas.find(a=>a.alerta.id==="ALT-MAICON-002").alerta.historial.length')" = "0" ] && pass "ALT-MAICON-002 (acusada a las 2 h): sin recordatorio ni aviso" || fail "MAICON-002 tiene avisos"

echo "3. La Secretaría ve el aviso con el edificio y la ECA"
CODE="$(curl -s -o "$TMP/av.json" -w '%{http_code}' -H "Authorization: Bearer $SEC" "$BASE_URL/api/eca/avisos-secretaria")"
[ "$CODE" = "200" ] && [ "$(json "$TMP/av.json" 'b.map(a=>a.alertaId).sort().join(",")')" = "ALT-CP-001,ALT-MAICON-001" ] && pass "avisos de ALT-CP-001 y ALT-MAICON-001 (no el de la alerta acusada)" || fail "avisos: $CODE $(head -c 300 "$TMP/av.json")"
[ "$(json "$TMP/av.json" 'b.find(a=>a.alertaId==="ALT-MAICON-001").eca+"|"+b.find(a=>a.alertaId==="ALT-MAICON-001").edificio')" = "MAICON Mantenimiento|Consorcio Santa Fe 3200" ] && pass "cada aviso lleva la ECA y el edificio" || fail "datos del aviso"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/eca/avisos-secretaria")"
[ "$CODE" = "401" ] && pass "sin sesión → 401" || fail "sin sesión → $CODE"

echo "4. Cada recordatorio y aviso se registra una sola vez"
curl -s -o /dev/null "$BASE_URL/api/eca/alertas?eca=porte%C3%B1a"; curl -s -o /dev/null -H "Authorization: Bearer $SEC" "$BASE_URL/api/eca/avisos-secretaria"; curl -s -o /dev/null "$BASE_URL/api/eca/alertas?eca=maicon"
[ "$(sql "select count(*) from alertas_avisos where alerta_id in ('ALT-CP-001','ALT-MAICON-001','ALT-MAICON-002')")" = "4" ] && pass "tras abrir todo varias veces hay 4 registros en la base (2 por alerta sin acuse)" || fail "cantidad de registros"
OUT="$(sql "insert into alertas_avisos (alerta_id, tipo, eca, edificio, mensaje) values ('ALT-CP-001','aviso_secretaria_48h','X','Y','Z')" 2>&1)"
echo "$OUT" | grep -q "alertas_avisos_unico" && pass "la base rechaza un segundo aviso de la misma alerta (restricción de unicidad)" || fail "el duplicado no fue rechazado: $OUT"

echo; echo "Limpiando los avisos y el acuse de prueba…"
echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

#!/usr/bin/env bash
# HU-07 / RF-04 — El recargo del 45 % se suma una sola vez por máquina no inspeccionada y un Administrador puede anularlo.
#
#   bash docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-04-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos demo de
# HU-04: bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh (crea demo.admin y demo.secretaria).
# Usa el edificio «DEMO Corrientes 100» y le borra las visitas fallidas y las anulaciones al terminar.
# BASE_URL por defecto http://127.0.0.1:3050.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
TMP="$(mktemp -d)"; trap 'limpiar; rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
api() { # api <token> <metodo> <ruta> [cuerpo] → $CODE y $TMP/r.json
  if [ -n "${4:-}" ]; then printf '%s' "$4" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" "$BASE_URL$3")"; fi
}
limpiar() { [ -n "${ID:-}" ] && { sql "delete from recargos_anulados where consorcio_id='$ID'" >/dev/null; sql "delete from visitas_fallidas where consorcio_id='$ID'" >/dev/null; }; }

echo "== HU-07 / RF-04 contra $BASE_URL"
ADMIN="$(login demo.admin)"; SEC="$(login demo.secretaria)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
ID="$(sql "select id from consorcios where nombre='DEMO Corrientes 100'")"
[ -n "$ID" ] || { echo "  ❌ falta el edificio DEMO Corrientes 100"; exit 1; }
limpiar
api "$ADMIN" GET "/api/consorcios/$ID"; M1="$(json "$TMP/r.json" 'b.maquinas[0].id')"; M2="$(json "$TMP/r.json" 'b.maquinas[1].id')"
MES="$(date +%Y-%m)"; SIG="$(node -e 'const d=new Date();d.setMonth(d.getMonth()+1);console.log(d.toISOString().slice(0,7))')"
liq() { api "$ADMIN" POST /api/visitas-fallidas/liquidar-maquina "{\"consorcioId\":\"$ID\",\"maquinaId\":\"$1\",\"referenciaAgc\":\"$2\",\"periodo\":\"$3\",\"montoBase\":100000}"; }

echo "1. Tres visitas fallidas (en tres días distintos): el recargo del 45 % se suma en la liquidación de ese mes, por cada máquina"
# Desde HU-07 RF-05 entre dos visitas fallidas pasa al menos 1 día: las 2 primeras se cargan con fecha de hace 2 y 1 días; la 3.ª, hoy, por la API.
for d in 2 1; do sql "insert into visitas_fallidas (id, consorcio_id, consorcio_nombre, direccion, numero_advertencia, motivo, foto_frente_url, gps_latitud, gps_longitud, gps_precision, gps_timestamp, inspector, fecha_hora) values ('VF-RF04-$d', '$ID', 'DEMO Corrientes 100', 'Av. Corrientes 100', $((3-d)), 'demo', 'https://f/$d.jpg', -34.6, -58.4, 5, now() - interval '$d days', 'demo', now() - interval '$d days')" >/dev/null; done
api "$SEC" POST /api/visitas-fallidas "{\"consorcioId\":\"$ID\",\"fotoFrenteUrl\":\"https://f/3.jpg\",\"gps\":{\"latitud\":-34.6,\"longitud\":-58.4}}"
[ "$CODE" = "201" ] && pass "la 3.ª visita fallida se registra → 201" || fail "3.ª visita → $CODE"
liq "$M1" M1 "$MES"; [ "$(json "$TMP/r.json" 'b.recargoAplicado+"|"+b.montoRecargo')" = "true|45000" ] && pass "máquina M1, $MES: recargo de \$45.000 sobre \$100.000" || fail "M1 $MES: $(cat "$TMP/r.json" | head -c 200)"
liq "$M2" M2 "$MES"; [ "$(json "$TMP/r.json" 'b.recargoAplicado')" = "true" ] && pass "máquina M2, $MES: también lleva recargo" || fail "M2 $MES"

echo "2. Los meses posteriores no vuelven a sumarlo, aunque el edificio siga bloqueado"
liq "$M1" M1 "$SIG"; [ "$(json "$TMP/r.json" 'b.bloqueadoPorTerceraVisita+"|"+b.recargoAplicado+"|"+b.recargoNoAplicadoPor')" = "true|false|otro_periodo" ] && pass "$SIG: sigue bloqueado pero sin recargo (otro_periodo)" || fail "$SIG: $(cat "$TMP/r.json" | head -c 200)"
liq "$M1" M1 2030-01; [ "$(json "$TMP/r.json" 'b.recargoAplicado')" = "false" ] && pass "2030-01: sin recargo" || fail "2030-01"

echo "3. Sólo un Administrador anula el recargo, con motivo; queda registrado"
api "$SEC" POST /api/visitas-fallidas/recargos/anular "{\"consorcioId\":\"$ID\",\"maquinaId\":\"$M1\",\"motivo\":\"quiero anularlo\"}"
[ "$CODE" = "403" ] && pass "la Secretaría intenta anular → 403" || fail "Secretaría → $CODE"
api "$ADMIN" POST /api/visitas-fallidas/recargos/anular "{\"consorcioId\":\"$ID\",\"maquinaId\":\"$M1\",\"motivo\":\"   \"}"
[ "$CODE" = "400" ] && pass "sin motivo → 400" || fail "sin motivo → $CODE"
api "$ADMIN" POST /api/visitas-fallidas/recargos/anular "{\"consorcioId\":\"$ID\",\"maquinaId\":\"$M1\",\"motivo\":\"Visita fallida cargada por error\"}"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.usuario+"|"+b.motivo')" = "demo.admin|Visita fallida cargada por error" ] && pass "el Administrador anula con motivo → 201, registrado a nombre de demo.admin" || fail "Administrador → $CODE $(cat "$TMP/r.json")"
[ "$(sql "select usuario||'|'||motivo from recargos_anulados where consorcio_id='$ID' and maquina_id='$M1'")" = "demo.admin|Visita fallida cargada por error" ] && pass "en la base queda la anulación con usuario, fecha y motivo" || fail "no está en la base"
liq "$M1" M1 "$MES"; [ "$(json "$TMP/r.json" 'b.recargoAplicado+"|"+b.montoRecargo+"|"+b.recargoNoAplicadoPor')" = "false|0|anulado" ] && pass "la liquidación de M1 deja de incluir el recargo (anulado)" || fail "M1 anulada: $(cat "$TMP/r.json" | head -c 200)"
liq "$M2" M2 "$MES"; [ "$(json "$TMP/r.json" 'b.recargoAplicado')" = "true" ] && pass "M2 sigue con su recargo (la anulación es por máquina)" || fail "M2 tras anular M1"
api "$ADMIN" POST /api/visitas-fallidas/recargos/anular "{\"consorcioId\":\"$ID\",\"maquinaId\":\"$M1\",\"motivo\":\"otra vez\"}"
[ "$CODE" = "409" ] && pass "anular dos veces la misma máquina → 409" || fail "doble anulación → $CODE"

echo; echo "Limpiando las visitas y anulaciones del edificio demo…"
echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

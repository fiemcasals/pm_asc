#!/usr/bin/env bash
# HU-05 / RF-01 — API de monitoreo del backoffice: GET /api/backoffice/monitoreo y POST /api/backoffice/remito-eca.
#
#   bash docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-01-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Entra como demo.secretaria y un RT temporal (demo.rt.backoffice, se borra). Deja la base sin los remitos que registra.
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
http() { # http <token> <metodo> <ruta> [cuerpo] → código en $CODE, cuerpo en $TMP/r.json
  if [ -n "${4:-}" ]; then printf '%s' "$4" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" "$BASE_URL$3")"; fi
}
limpiar() { sql "delete from remitos_eca where enviado_por = 'demo.secretaria'; delete from usuarios where usuario='demo.rt.backoffice'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-05 / RF-01 contra $BASE_URL"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from remitos_eca where enviado_por = 'demo.secretaria'; delete from usuarios where usuario='demo.rt.backoffice'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.backoffice','demo.rt.backoffice','rt_calle','$HASH')" >/dev/null
SEC="$(login demo.secretaria)"; RT="$(login demo.rt.backoffice)"
{ [ -n "$SEC" ] && [ "$SEC" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
URL="/api/backoffice/monitoreo"

echo "1. GET /api/backoffice/monitoreo: listado paginado y filtrable, con el estado de la visita"
http "$SEC" GET "$URL"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.total+"|"+b.pagina+"|"+b.porPagina+"|"+b.totalPaginas')" = "5|1|20|1" ] && pass "200 con total 5, página 1 de 1 (20 por página)" || fail "listado → $CODE $(head -c 300 "$TMP/r.json")"
[ "$(json "$TMP/r.json" 'b.items.map(f=>f.maquinaId).join(",")')" = "MAQ-CALLAO-M1,MAQ-SANTAFE-M2,MAQ-SANTAFE-M1,MAQ-CORRIENTES-M1,MAQ-CORRIENTES-M2" ] && pass "lo más reciente primero y el equipo sin visita al final" || fail "orden: $(json "$TMP/r.json" 'b.items.map(f=>f.maquinaId).join(",")')"
[ "$(json "$TMP/r.json" 'const f=b.items[0];[f.direccion,f.eca,f.inspector,f.estadoVisita,f.firmante].join("|")')" = "Av. Callao 850, CABA|Elevadores San Martín|germanG|Advertencia|gonza" ] && pass "cada fila trae dirección, ECA, inspector, estado de visita y firmante" || fail "fila"
http "$SEC" GET "$URL?direccion=CORRI%C3%89NTES"; [ "$(json "$TMP/r.json" 'b.total')" = "2" ] && pass "filtro por dirección (sin importar mayúsculas ni tildes): 2 de Corrientes" || fail "dirección"
http "$SEC" GET "$URL?eca=porte%C3%B1a"; [ "$(json "$TMP/r.json" 'b.total')" = "2" ] && pass "filtro por ECA: 2 de Conservación Porteña" || fail "eca"
http "$SEC" GET "$URL?inspector=german"; [ "$(json "$TMP/r.json" 'b.total+"|"+b.items[0].inspector')" = "1|germanG" ] && pass "filtro por inspector: 1 (germanG)" || fail "inspector"
http "$SEC" GET "$URL?estado=Recorrida"; [ "$(json "$TMP/r.json" 'b.total')" = "3" ] && pass "filtro por estado de visita Recorrida: 3" || fail "estado"
http "$SEC" GET "$URL?eca=maicon&estado=Recorrida"; [ "$(json "$TMP/r.json" 'b.total')" = "2" ] && pass "los filtros se combinan: MAICON y Recorrida → 2" || fail "combinados"
http "$SEC" GET "$URL?porPagina=2&pagina=3"; [ "$(json "$TMP/r.json" 'b.items.length+"|"+b.totalPaginas')" = "1|3" ] && pass "paginación: con 2 por página son 3 páginas y la tercera trae 1" || fail "paginación"
http "$SEC" GET "$URL?estado=Aprobada"; [ "$CODE" = "400" ] && pass "un estado que no existe → 400" || fail "estado inválido → $CODE"
http "$SEC" GET "$URL?porPagina=500"; [ "$CODE" = "400" ] && pass "porPagina mayor que 100 → 400" || fail "porPagina → $CODE"
http "$RT" GET "$URL"; [ "$CODE" = "403" ] && pass "el RT no ve el monitoreo (403)" || fail "RT → $CODE"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL$URL")" = "401" ] && pass "sin sesión → 401" || fail "sin sesión"

echo "2. POST /api/backoffice/remito-eca: registra el envío del remito digital a la ECA"
http "$SEC" POST /api/backoffice/remito-eca '{"maquinaId":"MAQ-SANTAFE-M1"}'
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.visitaId+"|"+b.eca+"|"+b.enviadoPor')" = "VIS-2026-11-301|MAICON Mantenimiento|demo.secretaria" ] && pass "201: queda la visita, la ECA y quién lo mandó" || fail "remito → $CODE $(head -c 300 "$TMP/r.json")"
[ "$(sql "select enviado_por||'|'||(enviado_en > now() - interval '5 minutes') from remitos_eca where visita_id='VIS-2026-11-301'")" = "demo.secretaria|true" ] && pass "quedó guardado en la base con la fecha y hora" || fail "no está en la base"
http "$SEC" GET "$URL?direccion=santa%20fe"
[ "$(json "$TMP/r.json" 'b.items.find(f=>f.maquinaId==="MAQ-SANTAFE-M1").remito.enviadoPor')" = "demo.secretaria" ] && pass "la fila del listado muestra el remito enviado" || fail "la fila no lo muestra"
http "$SEC" POST /api/backoffice/remito-eca '{"maquinaId":"MAQ-SANTAFE-M1"}'; [ "$CODE" = "409" ] && grep -q "ya se mandó" "$TMP/r.json" && pass "el mismo remito no se manda dos veces (409 con el envío anterior)" || fail "duplicado → $CODE"
http "$SEC" POST /api/backoffice/remito-eca '{"maquinaId":"MAQ-CORRIENTES-M2"}'; [ "$CODE" = "409" ] && pass "un equipo «Pendiente de Visita» no tiene remito (409)" || fail "sin visita → $CODE"
http "$SEC" POST /api/backoffice/remito-eca '{"maquinaId":"NO-EXISTE"}'; [ "$CODE" = "404" ] && pass "un equipo que no existe → 404" || fail "inexistente → $CODE"
http "$SEC" POST /api/backoffice/remito-eca '{}'; [ "$CODE" = "400" ] && pass "sin maquinaId → 400" || fail "sin maquinaId → $CODE"
http "$RT" POST /api/backoffice/remito-eca '{"maquinaId":"MAQ-CALLAO-M1"}'; [ "$CODE" = "403" ] && pass "el RT no registra remitos (403)" || fail "RT remito → $CODE"
ERR="$(printf "begin; set local role ascensores_app; select set_config('app.rol_actual','administrador',true); update remitos_eca set enviado_por='otro'; rollback;" | docker exec -i "$DB_CONTAINER" psql -U ascensores -d ascensores 2>&1)"
echo "$ERR" | grep -q "permission denied" && pass "el remito enviado no se edita desde la aplicación (la base lo rechaza)" || fail "UPDATE: $ERR"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

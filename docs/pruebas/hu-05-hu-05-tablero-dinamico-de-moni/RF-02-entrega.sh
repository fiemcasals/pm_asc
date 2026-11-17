#!/usr/bin/env bash
# HU-05 / RF-02 — Tablero dinámico de monitoreo (backoffice): lo que la pantalla le pide a la API.
#
#   bash docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-02-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# La tabla, los filtros en tiempo real, el visor y los botones son de la pantalla (probados en apps/web/src/backoffice/monitoreo.test.ts y en
# el navegador: Secretaría › pestaña «Monitoreo»). Acá se verifica lo que la API le da al visor y las acciones: GET .../visitas/:maquinaId,
# POST .../remito-eca y POST .../reclamo-admin. Deja la base sin los remitos ni reclamos que registra. BASE_URL por defecto http://127.0.0.1:3050.

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
limpiar() { sql "delete from remitos_eca where enviado_por = 'demo.secretaria'; delete from reclamos_admin where reclamado_por = 'demo.secretaria'; delete from usuarios where usuario='demo.rt.tablero'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-05 / RF-02 contra $BASE_URL"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from remitos_eca where enviado_por = 'demo.secretaria'; delete from reclamos_admin where reclamado_por = 'demo.secretaria'; delete from usuarios where usuario='demo.rt.tablero'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.tablero','demo.rt.tablero','rt_calle','$HASH')" >/dev/null
SEC="$(login demo.secretaria)"; RT="$(login demo.rt.tablero)"
{ [ -n "$SEC" ] && [ "$SEC" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }

echo "1. La tabla: columnas y datos de cada fila (dirección, inspector, estado, fecha/hora, checklist, firmante, acciones)"
http "$SEC" GET "/api/backoffice/monitoreo"
[ "$(json "$TMP/r.json" 'const f=b.items.find(x=>x.maquinaId==="MAQ-SANTAFE-M1");[f.direccion,f.inspector,f.estadoVisita,f.fecha,f.itemsChecklist,f.fotos,f.firmante,f.autorizada,f.remito,f.reclamo].join("|")')" = "Av. Santa Fe 3200, CABA|dev-ma-2|Recorrida|2026-11-05T09:00:00.000Z|4|2|gonza|false||" ] && pass "cada fila trae dirección, inspector, estado, fecha y hora, 4 ítems de checklist y 2 fotos, firmante y su autorización" || fail "fila: $(json "$TMP/r.json" 'JSON.stringify(b.items.find(x=>x.maquinaId==="MAQ-SANTAFE-M1"))')"
[ "$(json "$TMP/r.json" 'b.items.map(f=>f.estadoVisita).join(",")')" = "Advertencia,Recorrida,Recorrida,Recorrida,Pendiente de Visita" ] && pass "los estados que decide la acción: Advertencia, Recorrida y Pendiente de Visita" || fail "estados"

echo "2. El visor de fotos e informe"
http "$SEC" GET "/api/backoffice/visitas/MAQ-SANTAFE-M1"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.fotos.map(f=>f.etiqueta).join(",")+"|"+b.checklist.length+"|"+b.checklist[0].estado')" = "Cables,Frente del edificio|4|Critico" ] && pass "el detalle trae las fotos (cables y frente) y los 4 ítems de checklist con su estado" || fail "detalle → $CODE $(head -c 300 "$TMP/r.json")"
http "$SEC" GET "/api/backoffice/visitas/MAQ-SANTAFE-M2"
[ "$(json "$TMP/r.json" 'b.fotos.map(f=>f.etiqueta).join(",")')" = "Frente del edificio,Cabina trabada" ] && pass "una foto vacía no cuenta y la de la cabina trabada se suma" || fail "fotos de Santa Fe M2"
http "$SEC" GET "/api/backoffice/visitas/MAQ-CALLAO-M1"
[ "$(json "$TMP/r.json" 'b.fotos.length+"|"+b.checklist.length')" = "0|0" ] && pass "una visita sin fotos ni checklist trae listas vacías" || fail "Callao"
http "$SEC" GET "/api/backoffice/visitas/NO-EXISTE"; [ "$CODE" = "404" ] && pass "un equipo que no existe → 404" || fail "inexistente → $CODE"
http "$RT" GET "/api/backoffice/visitas/MAQ-SANTAFE-M1"; [ "$CODE" = "403" ] && pass "el RT no ve el visor (403)" || fail "RT → $CODE"

echo "3. «Enviar Remito a ECA» (visita Recorrida)"
http "$SEC" POST /api/backoffice/remito-eca '{"maquinaId":"MAQ-CORRIENTES-M1"}'
[ "$CODE" = "201" ] && pass "el remito de una visita Recorrida se registra (201)" || fail "remito → $CODE $(head -c 200 "$TMP/r.json")"
http "$SEC" GET "/api/backoffice/monitoreo?direccion=corrientes"
[ "$(json "$TMP/r.json" 'b.items.find(x=>x.maquinaId==="MAQ-CORRIENTES-M1").remito.enviadoPor')" = "demo.secretaria" ] && pass "la fila pasa a mostrar «Remito enviado» con quién lo mandó (la pantalla ya no ofrece el botón)" || fail "la fila no muestra el remito"
http "$SEC" POST /api/backoffice/remito-eca '{"maquinaId":"MAQ-CORRIENTES-M1"}'; [ "$CODE" = "409" ] && pass "mandarlo de nuevo → 409" || fail "repetido → $CODE"

echo "4. «Reclamar a Admin» (visita con Advertencia)"
http "$SEC" POST /api/backoffice/reclamo-admin '{"maquinaId":"MAQ-CALLAO-M1"}'
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.administracion+"|"+b.reclamadoPor')" = "Administraciones Centro|demo.secretaria" ] && pass "el reclamo se registra a la administración del consorcio, a nombre de quien lo hizo" || fail "reclamo → $CODE $(head -c 200 "$TMP/r.json")"
[ "$(sql "select reclamado_por||'|'||(reclamado_en > now() - interval '5 minutes') from reclamos_admin where visita_id='VIS-2026-11-201'")" = "demo.secretaria|true" ] && pass "quedó guardado en la base con la fecha y hora" || fail "no está en la base"
http "$SEC" GET "/api/backoffice/monitoreo?direccion=callao"
[ "$(json "$TMP/r.json" 'b.items[0].reclamo.administracion')" = "Administraciones Centro" ] && pass "la fila pasa a mostrar «Reclamo enviado»" || fail "la fila no muestra el reclamo"
http "$SEC" POST /api/backoffice/reclamo-admin '{"maquinaId":"MAQ-CALLAO-M1"}'; [ "$CODE" = "409" ] && pass "reclamarlo de nuevo → 409" || fail "reclamo repetido → $CODE"
http "$SEC" POST /api/backoffice/reclamo-admin '{"maquinaId":"MAQ-SANTAFE-M1"}'; [ "$CODE" = "409" ] && pass "una visita Recorrida no se reclama (409): el botón sólo aparece con Advertencia" || fail "reclamo a Recorrida → $CODE"
http "$SEC" POST /api/backoffice/reclamo-admin '{"maquinaId":"MAQ-CORRIENTES-M2"}'; [ "$CODE" = "409" ] && pass "un equipo Pendiente de Visita no tiene acción (409)" || fail "pendiente → $CODE"
http "$SEC" POST /api/backoffice/remito-eca '{"maquinaId":"MAQ-CALLAO-M1"}'; [ "$CODE" = "201" ] && pass "(el remito de la visita con advertencia no se frena en la API; la pantalla sólo ofrece el reclamo)" || fail "remito Callao → $CODE"
http "$RT" POST /api/backoffice/reclamo-admin '{"maquinaId":"MAQ-CALLAO-M1"}'; [ "$CODE" = "403" ] && pass "el RT no reclama (403)" || fail "RT reclamo → $CODE"
ERR="$(printf "begin; set local role ascensores_app; select set_config('app.rol_actual','administrador',true); delete from reclamos_admin; rollback;" | docker exec -i "$DB_CONTAINER" psql -U ascensores -d ascensores 2>&1)"
echo "$ERR" | grep -q "permission denied" && pass "el reclamo registrado no se borra desde la aplicación (la base lo rechaza)" || fail "DELETE: $ERR"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

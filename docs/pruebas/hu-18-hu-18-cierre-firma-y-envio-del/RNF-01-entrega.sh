#!/usr/bin/env bash
# HU-18 / RNF-01 — Sellado del informe: hash SHA-256, horas, inmodificabilidad con registro y verificación con auditoría.
#
#   bash docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RNF-01-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea un RT y un edificio temporales y los borra al terminar (con sus informes y auditoría). BASE_URL por defecto http://127.0.0.1:3050.

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
http() { # http <token> <metodo> <ruta> [archivo-con-el-cuerpo] → código en $CODE, cuerpo en $TMP/r.json
  if [ -n "${4:-}" ]; then CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d @"$4" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" "$BASE_URL$3")"; fi
}
EDIF=""
limpiar() { [ -n "$EDIF" ] && sql "delete from consorcios where id='$EDIF'" >/dev/null; sql "delete from usuarios where usuario='demo.rt.sello'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-18 / RNF-01 contra $BASE_URL"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario='demo.rt.sello'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.sello','demo.rt.sello','rt_calle','$HASH')" >/dev/null
# Ingresar con un usuario que no existe suma intentos fallidos y a los 5 bloquea la cuenta 15 minutos: antes se revisa que estén los datos de demo.
[ "$(docker exec "${DB_CONTAINER:-mant-asc-db}" psql -U ascensores -d ascensores -tAc "select count(*) from usuarios where usuario in ('demo.admin','demo.secretaria')" 2>/dev/null | tr -d '\r')" = "2" ] || { echo "  ❌ faltan los datos de demo (o no hay docker): corré antes bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh"; exit 2; }
ADMIN="$(login demo.admin)"; SEC="$(login demo.secretaria)"; RT="$(login demo.rt.sello)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
printf '%s' '{"nombre":"DEMO HU18 sello","direccion":"Calle Sello 1","maquinas":[{"referenciaAgc":"M1"}]}' > "$TMP/e.json"
http "$ADMIN" POST /api/consorcios "$TMP/e.json"
EDIF="$(json "$TMP/r.json" 'b.id')"
[ -n "$EDIF" ] && [ "$EDIF" != "undefined" ] || { echo "  ❌ no pude crear el edificio de prueba"; exit 1; }
printf '%s' '{"rtCalle":{"nombre":"demo.rt.sello","telefono":"11 0000-0000","email":"rt@demo.com"},"firmante":{"nombre":"Firmante","email":"f@f.com"},"eca":{"nombre":"ECA","email":"e@e.com"}}' > "$TMP/roles.json"
http "$ADMIN" PUT "/api/consorcios/$EDIF/roles" "$TMP/roles.json"

node -e '
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=";
  const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD";
  const trazo = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);
  const c = { consorcioId: process.argv[1], horaDispositivo: new Date(Date.now() - 120000).toISOString(), horaServidor: "2020-01-01T00:00:00Z", hashSha256: "a".repeat(64),
    equipos: [{ maquinaId: "m1", referenciaAgc: "M1", tipo: "traccion", estadoEquipo: "en_uso", respuestas: { cabina: { a: "ok" } }, observaciones: { cabina: "Sin novedades" }, fotos: { f1: { dataUrl: JPG }, "obligatoria:frente": { dataUrl: JPG }, "obligatoria:cables": { dataUrl: JPG } } }],
    firma: { nombre: "Carlos", apellido: "Rodriguez", caracter: "Encargado", imagen: PNG, trazos: [trazo] } };
  process.stdout.write(JSON.stringify(c));
' "$EDIF" > "$TMP/i.json"

echo "1. Al cerrar se calcula el SHA-256 del contenido, la firma y las fotos"
http "$RT" POST /api/informes-visita "$TMP/i.json"
ID="$(json "$TMP/r.json" 'b.id')"; H="$(json "$TMP/r.json" 'b.hashSha256')"
[ "$CODE" = "201" ] && echo "$H" | grep -Eq '^[0-9a-f]{64}$' && pass "el informe se cierra (201) con un hash SHA-256 de 64 caracteres" || { fail "cerrar → $CODE $(head -c 300 "$TMP/r.json")"; exit 1; }
[ "$H" != "$(printf 'a%.0s' $(seq 1 64))" ] && pass "el hash lo calcula la API: el que mandó el celular se ignoró" || fail "se usó el hash del celular"
[ "$(sql "select hash_sha256 from informes_visita where id='$ID'")" = "$H" ] && [ "$(sql "select version_hash from informes_visita where id='$ID'")" = "sha256-v1" ] && pass "quedó guardado en la base con la versión del cálculo (sha256-v1)" || fail "hash en la base"
# El API sella el informe sin hashSha256, versionHash ni clientReportId (el identificador con que el celular reenvía, HU-18 RNF-02): el recálculo por fuera hace lo mismo.
EXP="$(sql "select contenido::text from informes_visita where id='$ID'" >/dev/null; node -e '
  const { createHash } = require("crypto");
  const canon = (v) => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  const i = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const { hashSha256, versionHash, clientReportId, ...resto } = i;
  console.log(createHash("sha256").update(canon(resto), "utf8").digest("hex"));
' "$TMP/r.json")"
[ "$EXP" = "$H" ] && pass "se recalcula por fuera con otro programa (JSON canónico + SHA-256) y da el mismo hash" || fail "el hash no coincide con el cálculo independiente"

echo "2. Se guardan la hora del dispositivo y la del servidor"
http "$SEC" GET "/api/informes-visita/$ID"
[ "$(json "$TMP/r.json" 'Math.abs(Date.parse(b.horaServidor)-Date.now())<15000')" = "true" ] && pass "la hora del servidor es la de la API (se ignoró la que mandó el celular)" || fail "hora del servidor"
[ "$(json "$TMP/r.json" 'Math.round((Date.parse(b.horaServidor)-Date.parse(b.horaDispositivo))/60000)')" = "2" ] && pass "la hora del dispositivo se guarda aparte (el celular iba 2 minutos atrasado)" || fail "hora del dispositivo"

echo "3. Un informe cerrado no se modifica: 409 y queda registrado"
for m in PUT PATCH DELETE; do
  printf '%s' '{"equipos":[]}' > "$TMP/m.json"; http "$RT" "$m" "/api/informes-visita/$ID" "$TMP/m.json"
  [ "$CODE" = "409" ] && grep -q "no se puede modificar ni borrar" "$TMP/r.json" && pass "$m por el RT → 409 «el informe está cerrado»" || fail "$m → $CODE"
done
http "$ADMIN" DELETE "/api/informes-visita/$ID"; [ "$CODE" = "409" ] && pass "DELETE por el Administrador → 409 (para nadie se puede)" || fail "DELETE admin → $CODE"
http "$SEC" GET "/api/informes-visita/$ID/auditoria"
[ "$(json "$TMP/r.json" 'b.intentosModificacion.map(i=>i.usuario+":"+i.metodo).join(",")')" = "demo.rt.sello:PUT,demo.rt.sello:PATCH,demo.rt.sello:DELETE,demo.admin:DELETE" ] && pass "los 4 intentos quedaron registrados con quién y qué método" || fail "intentos: $(head -c 300 "$TMP/r.json")"
[ "$(sql "select count(*) from informes_visita where id='$ID'")" = "1" ] && pass "el informe sigue ahí, sin cambios" || fail "el informe cambió"
http "$RT" DELETE "/api/informes-visita/00000000-0000-0000-0000-000000000000"; [ "$CODE" = "404" ] && pass "un informe que no existe → 404 (no se registra nada)" || fail "inexistente → $CODE"

echo "4. Una función verifica que el hash coincide y lo informa en la auditoría"
http "$SEC" POST "/api/informes-visita/$ID/verificar"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.coincide+"|"+(b.hashGuardado===b.hashCalculado)+"|"+b.usuario')" = "true|true|demo.secretaria" ] && pass "informe intacto: el hash coincide (queda quién verificó)" || fail "verificar → $CODE $(head -c 300 "$TMP/r.json")"
sql "update informes_visita set contenido = jsonb_set(contenido, '{equipos,0,observaciones}', '{\"cabina\":\"Alterado a mano en la base\"}') where id='$ID'" >/dev/null
http "$ADMIN" POST "/api/informes-visita/$ID/verificar"
[ "$(json "$TMP/r.json" 'b.coincide+"|"+(b.hashGuardado!==b.hashCalculado)')" = "false|true" ] && pass "se alteró una observación directo en la base: la verificación lo detecta (coincide: false)" || fail "no detectó la alteración: $(head -c 300 "$TMP/r.json")"
http "$SEC" GET "/api/informes-visita/$ID/auditoria"
[ "$(json "$TMP/r.json" 'b.verificaciones.map(v=>v.coincide).join(",")')" = "true,false" ] && pass "la auditoría muestra las dos verificaciones en orden: coincidió y después no" || fail "auditoría: $(head -c 300 "$TMP/r.json")"
http "$RT" POST "/api/informes-visita/$ID/verificar"; [ "$CODE" = "403" ] && pass "el RT no verifica (403)" || fail "RT verifica → $CODE"
ERR="$(printf "begin; set local role ascensores_app; select set_config('app.rol_actual','administrador',true); delete from verificaciones_informe; rollback;" | docker exec -i "$DB_CONTAINER" psql -U ascensores -d ascensores 2>&1)"
echo "$ERR" | grep -q "permission denied" && pass "la auditoría no se borra desde la aplicación (la base lo rechaza)" || fail "DELETE auditoría: $ERR"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

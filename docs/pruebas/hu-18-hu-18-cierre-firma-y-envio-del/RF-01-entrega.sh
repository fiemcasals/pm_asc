#!/usr/bin/env bash
# HU-18 / RF-01 — Consolidación y firma en pantalla: lo que la API valida y guarda al cerrar el informe de la visita.
#
#   bash docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RF-01-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# El botón «Consolidar Informe y Proceder a Firma», el lienzo para firmar con el dedo y el formulario son de la pantalla (probados en
# apps/web/src/informe/consolidacion.test.ts y en el navegador). Acá se verifican las reglas que la API vuelve a controlar.
# Crea un RT y un edificio temporales (con 2 equipos) y los borra al terminar. BASE_URL por defecto http://127.0.0.1:3050.

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
http() { # http <token> <metodo> <ruta> <archivo-con-el-cuerpo|-> → código en $CODE, cuerpo en $TMP/r.json
  if [ "${4:--}" != "-" ]; then CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d @"$4" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" "$BASE_URL$3")"; fi
}
EDIF=""
limpiar() { [ -n "$EDIF" ] && sql "delete from consorcios where id='$EDIF'" >/dev/null; sql "delete from usuarios where usuario in ('demo.rt.informe','demo.rt.informe2')" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-18 / RF-01 contra $BASE_URL"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario in ('demo.rt.informe','demo.rt.informe2')" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.informe','demo.rt.informe','rt_calle','$HASH'),('demo.rt.informe2','demo.rt.informe2','rt_calle','$HASH')" >/dev/null
# Ingresar con un usuario que no existe suma intentos fallidos y a los 5 bloquea la cuenta 15 minutos: antes se revisa que estén los datos de demo.
[ "$(docker exec "${DB_CONTAINER:-mant-asc-db}" psql -U ascensores -d ascensores -tAc "select count(*) from usuarios where usuario in ('demo.admin','demo.secretaria')" 2>/dev/null | tr -d '\r')" = "2" ] || { echo "  ❌ faltan los datos de demo (o no hay docker): corré antes bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh"; exit 2; }
ADMIN="$(login demo.admin)"; SEC="$(login demo.secretaria)"; RT="$(login demo.rt.informe)"; RT2="$(login demo.rt.informe2)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ] && [ -n "$RT2" ] && [ "$RT2" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
printf '%s' '{"nombre":"DEMO HU18 informe","direccion":"Calle Informe 1","maquinas":[{"referenciaAgc":"M1"},{"referenciaAgc":"M2"}]}' > "$TMP/e.json"
http "$ADMIN" POST /api/consorcios "$TMP/e.json"
EDIF="$(json "$TMP/r.json" 'b.id')"
[ -n "$EDIF" ] && [ "$EDIF" != "undefined" ] || { echo "  ❌ no pude crear el edificio de prueba"; exit 1; }
printf '%s' '{"rtCalle":{"nombre":"demo.rt.informe","telefono":"11 0000-0000","email":"rt@demo.com"},"firmante":{"nombre":"Firmante","email":"f@f.com"},"eca":{"nombre":"ECA","email":"e@e.com"}}' > "$TMP/roles.json"
http "$ADMIN" PUT "/api/consorcios/$EDIF/roles" "$TMP/roles.json"

# Arma el cuerpo de un informe: informe <firma|sin|vacia|dos|ninguna> [campo=valor de la firma...]
informe() {
  node -e '
    const [, modo, edif, ...extra] = process.argv;
    const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=";
    const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD";
    const trazo = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);
    const equipo = (id, ref) => ({ maquinaId: id, referenciaAgc: ref, tipo: "traccion", estadoEquipo: "en_uso", respuestas: { sala_maquinas: { entorno_iluminacion: "normal" } }, observaciones: {}, fotos: { "obligatoria:frente": { dataUrl: JPG }, "obligatoria:cables": { dataUrl: JPG } } }); // HU-18 RF-02: cada equipo en uso trae el frente y los cables
    const firma = { nombre: "Carlos", apellido: "Rodriguez", caracter: "Encargado", dni: "12.345.678", imagen: PNG, trazos: [trazo] };
    for (const e of extra) { const [k, v] = e.split("="); if (v === "~") delete firma[k]; else firma[k] = v; }
    const c = { consorcioId: edif, horaDispositivo: new Date().toISOString(), equipos: [equipo("m1", "M1"), { ...equipo("m2", "M2"), estadoEquipo: "fuera_de_servicio" }] };
    if (modo === "firma") c.firma = firma;
    if (modo === "vacia") c.firma = { ...firma, trazos: [] };
    if (modo === "sin") c.sinFirma = { motivo: "El encargado no esta y nadie atiende", foto: JPG };
    if (modo === "sin-sin-foto") c.sinFirma = { motivo: "El encargado no esta y nadie atiende" };
    if (modo === "sin-sin-motivo") c.sinFirma = { foto: JPG };
    if (modo === "dos") { c.firma = firma; c.sinFirma = { motivo: "El encargado no esta", foto: JPG }; }
    process.stdout.write(JSON.stringify(c));
  ' "$@" > "$TMP/i.json"
}
n_informes() { sql "select count(*) from informes_visita where consorcio_id='$EDIF'"; }

echo "1. «Consolidar Informe y Proceder a Firma»: el informe lleva todos los equipos (completos o resueltos como fuera de servicio)"
informe firma "$EDIF"; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.equipos.length+"|"+b.equipos.map(e=>e.estadoEquipo).join(",")')" = "2|en_uso,fuera_de_servicio" ] && pass "informe con 2 equipos (uno en uso y uno resuelto como fuera de servicio) → 201" || fail "informe → $CODE $(head -c 300 "$TMP/r.json")"
printf '%s' "{\"consorcioId\":\"$EDIF\",\"horaDispositivo\":\"2026-11-17T13:00:00Z\",\"equipos\":[],\"firma\":null}" > "$TMP/v.json"; http "$RT" POST /api/informes-visita "$TMP/v.json"
[ "$CODE" = "400" ] && grep -q "al menos un equipo" "$TMP/r.json" && pass "un informe sin equipos → 400" || fail "sin equipos → $CODE"

echo "2. La firma se captura con el dedo y no se acepta vacía"
informe vacia "$EDIF"; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "400" ] && grep -q "La firma está vacía" "$TMP/r.json" && pass "firma sin trazos → 400 «La firma está vacía»" || fail "firma vacía → $CODE $(head -c 200 "$TMP/r.json")"
informe firma "$EDIF" 'imagen=~'; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "400" ] && grep -q "firma.imagen" "$TMP/r.json" && pass "firma sin imagen → 400" || fail "sin imagen → $CODE"
[ "$(n_informes)" = "1" ] && pass "no quedó guardado ningún informe con firma vacía" || fail "se guardó de más"

echo "3. Exige nombre, apellido y carácter; el DNI es opcional"
informe firma "$EDIF" 'dni=~'; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.firma.dni')" = "null" ] && pass "sin DNI → 201 (queda null)" || fail "sin DNI → $CODE"
[ "$(sql "select firma->>'dni' from informes_visita where consorcio_id='$EDIF' and firma->>'dni' is not null limit 1")" = "12345678" ] && pass "el DNI con puntos (12.345.678) se guarda sólo con dígitos" || fail "DNI normalizado"
informe firma "$EDIF" 'nombre=~'; http "$RT" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "400" ] && grep -q "firma.nombre" "$TMP/r.json" && pass "sin nombre → 400" || fail "sin nombre → $CODE"
informe firma "$EDIF" 'apellido=~'; http "$RT" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "400" ] && grep -q "firma.apellido" "$TMP/r.json" && pass "sin apellido → 400" || fail "sin apellido → $CODE"
informe firma "$EDIF" 'caracter=Vecino'; http "$RT" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "400" ] && grep -q "firma.caracter" "$TMP/r.json" && pass "un carácter que no es Encargado, Administrador o Propietario → 400" || fail "carácter → $CODE"
for c in Administrador Propietario; do informe firma "$EDIF" "caracter=$c"; http "$RT" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "201" ] && pass "carácter «$c» → 201" || fail "carácter $c → $CODE"; done
informe firma "$EDIF" 'dni=123'; http "$RT" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "400" ] && pass "un DNI inválido (123) → 400" || fail "DNI inválido → $CODE"

echo "4. «Sin firma» exige motivo y foto y deja el informe marcado para la Secretaría y el Firmante"
informe sin "$EDIF"; http "$RT" POST /api/informes-visita "$TMP/i.json"
SIN="$(json "$TMP/r.json" 'b.id')"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.requiereRevision+"|"+b.firma')" = "true|null" ] && pass "«Sin firma» con motivo y foto → 201, marcado para revisión" || fail "sin firma → $CODE $(head -c 200 "$TMP/r.json")"
informe sin-sin-foto "$EDIF"; http "$RT" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "400" ] && grep -q "exige una foto" "$TMP/r.json" && pass "«Sin firma» sin foto → 400" || fail "sin foto → $CODE"
informe sin-sin-motivo "$EDIF"; http "$RT" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "400" ] && grep -q "exige el motivo" "$TMP/r.json" && pass "«Sin firma» sin motivo → 400" || fail "sin motivo → $CODE"
informe dos "$EDIF"; http "$RT" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "400" ] && grep -q "no las dos" "$TMP/r.json" && pass "la firma y «Sin firma» juntas → 400" || fail "las dos → $CODE"
informe ninguna "$EDIF"; http "$RT" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "400" ] && pass "ni firma ni «Sin firma» → 400" || fail "ninguna → $CODE"
http "$SEC" GET "/api/informes-visita?sinFirma=true" -
[ "$(json "$TMP/r.json" 'b.some(i=>i.id==="'$SIN'"&&i.motivoSinFirma)')" = "true" ] && pass "la Secretaría ve el informe «Sin firma» con su motivo" || fail "la Secretaría no lo ve"
http "$ADMIN" GET "/api/informes-visita/$SIN" -
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.sinFirma.foto.startsWith("data:image/jpeg")')" = "true" ] && pass "el detalle trae la foto que respalda el motivo" || fail "detalle → $CODE"

echo "5. Quién puede"
informe firma "$EDIF"; http "$RT2" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "404" ] && pass "un RT que no tiene el edificio asignado → 404 (RLS)" || fail "RT sin asignar → $CODE"
http "$SEC" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "403" ] && pass "la Secretaría no cierra informes (403)" || fail "Secretaría → $CODE"
http "$RT" GET /api/informes-visita -; [ "$CODE" = "403" ] && pass "el RT no ve la lista de informes (403)" || fail "RT lista → $CODE"
ERR="$(printf "begin; set local role ascensores_app; select set_config('app.rol_actual','administrador',true); update informes_visita set usuario='otro'; rollback;" | docker exec -i "$DB_CONTAINER" psql -U ascensores -d ascensores 2>&1)"
echo "$ERR" | grep -q "permission denied" && pass "el informe cerrado no se modifica desde la aplicación (la base lo rechaza)" || fail "UPDATE: $ERR"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

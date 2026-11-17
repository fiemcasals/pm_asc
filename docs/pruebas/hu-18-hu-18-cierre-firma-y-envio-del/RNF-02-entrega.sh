#!/usr/bin/env bash
# HU-18 / RNF-02 — Cola de sincronización del celular: lo que tiene que cumplir la API para que reenviar un informe no lo duplique.
#
#   bash docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RNF-02-entrega.sh
#
# La cola del celular (guardar, mostrar «N inspecciones sin subir», enviar sola) se prueba en la pantalla: ver RNF-02-cola-de-sincronizacion.md.
# Este script prueba el otro lado, contra la API real: el identificador que genera el celular (clientReportId) y que un reenvío devuelve el
# informe original sin crear otro, aunque se haya perdido la respuesta, se reintente muchas veces, lleguen varios a la vez o la sesión haya vencido.
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea un RT y un edificio temporales y los borra al terminar (con sus informes). BASE_URL por defecto http://127.0.0.1:3050.

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
limpiar() { [ -n "$EDIF" ] && sql "delete from consorcios where id='$EDIF'" >/dev/null; sql "delete from usuarios where usuario='demo.rt.cola'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-18 / RNF-02 contra $BASE_URL"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario='demo.rt.cola'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.cola','demo.rt.cola','rt_calle','$HASH')" >/dev/null
ADMIN="$(login demo.admin)"; SEC="$(login demo.secretaria)"; RT="$(login demo.rt.cola)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
printf '%s' '{"nombre":"DEMO HU18 cola","direccion":"Calle Cola 1","maquinas":[{"referenciaAgc":"M1"}]}' > "$TMP/e.json"
http "$ADMIN" POST /api/consorcios "$TMP/e.json"
EDIF="$(json "$TMP/r.json" 'b.id')"
[ -n "$EDIF" ] && [ "$EDIF" != "undefined" ] || { echo "  ❌ no pude crear el edificio de prueba"; exit 1; }
printf '%s' '{"rtCalle":{"nombre":"demo.rt.cola","telefono":"11 0000-0000","email":"rt@demo.com"},"firmante":{"nombre":"Firmante","email":"f@f.com"},"eca":{"nombre":"ECA","email":"e@e.com"}}' > "$TMP/roles.json"
http "$ADMIN" PUT "/api/consorcios/$EDIF/roles" "$TMP/roles.json"

# Un informe con una foto "pesada" (la que el celular no puede perder) y el identificador generado en el celular.
informe() { # informe <clientReportId|-> → $TMP/i.json
  node -e '
    const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=";
    const foto = "data:image/jpeg;base64," + Buffer.alloc(60000, 7).toString("base64");
    const trazo = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);
    const c = { consorcioId: process.argv[1], horaDispositivo: new Date().toISOString(),
      equipos: [{ maquinaId: "m1", referenciaAgc: "M1", tipo: "traccion", estadoEquipo: "en_uso", respuestas: { cabina: { a: "ok" } }, observaciones: { cabina: "Golpe en la puerta" }, fotos: { f1: { dataUrl: foto } } }],
      firma: { nombre: "Carlos", apellido: "Rodriguez", caracter: "Encargado", imagen: PNG, trazos: [trazo] } };
    if (process.argv[2] !== "-") c.clientReportId = process.argv[2];
    process.stdout.write(JSON.stringify(c));
  ' "$EDIF" "$1" > "$TMP/i.json"
}
filas() { sql "select count(*) from informes_visita where consorcio_id='$EDIF'"; }
ID1="cel-$(date +%s)-aaaa1111"

echo "1. Criterio 3: reenviar el mismo informe no lo duplica (el identificador lo genera el celular)"
informe "$ID1"
http "$RT" POST /api/informes-visita "$TMP/i.json"
A="$(json "$TMP/r.json" 'b.id')"; HA="$(json "$TMP/r.json" 'b.hashSha256')"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.clientReportId')" = "$ID1" ] && pass "el primer envío se crea (201) y guarda el identificador del celular" || { fail "primer envío → $CODE $(head -c 300 "$TMP/r.json")"; exit 1; }
http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.id')" = "$A" ] && [ "$(json "$TMP/r.json" 'b.hashSha256')" = "$HA" ] && pass "reenviarlo da 200 con el mismo informe (mismo id y mismo sello), no 201" || fail "reenvío → $CODE $(head -c 300 "$TMP/r.json")"
for i in 1 2 3 4; do http "$RT" POST /api/informes-visita "$TMP/i.json"; done
[ "$(filas)" = "1" ] && pass "después de 6 envíos del mismo informe hay una sola fila en la base" || fail "filas: $(filas)"

echo "2. Criterio 4: un envío interrumpido se reintenta sin perder las fotos"
ID2="cel-$(date +%s)-bbbb2222"
informe "$ID2"
curl -s -o /dev/null -X POST -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d @"$TMP/i.json" "$BASE_URL/api/informes-visita"   # la API lo guardó pero el celular nunca vio la respuesta
http "$RT" POST /api/informes-visita "$TMP/i.json"                                                                                            # la cola lo reintenta
B="$(json "$TMP/r.json" 'b.id')"
[ "$CODE" = "200" ] && [ -n "$B" ] && [ "$(sql "select count(*) from informes_visita where client_report_id='$ID2'")" = "1" ] && pass "se perdió la respuesta y el reintento da 200 con el informe ya guardado (uno solo)" || fail "reintento → $CODE"
EXP="$(node -e 'const i=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(require("crypto").createHash("md5").update(i.equipos[0].fotos.f1.dataUrl).digest("hex")+" "+i.equipos[0].fotos.f1.dataUrl.length)' "$TMP/i.json")"
GOT="$(sql "select md5(contenido->'equipos'->0->'fotos'->'f1'->>'dataUrl') || ' ' || length(contenido->'equipos'->0->'fotos'->'f1'->>'dataUrl') from informes_visita where id='$B'")"
[ "$EXP" = "$GOT" ] && pass "la foto quedó entera: mismo contenido y mismo tamaño que la que mandó el celular ($(echo "$GOT" | cut -d' ' -f2) caracteres)" || fail "la foto cambió: $EXP vs $GOT"

echo "3. Envíos simultáneos del mismo informe (la cola y un reintento a la vez)"
ID3="cel-$(date +%s)-cccc3333"
informe "$ID3"
for n in 1 2 3 4 5 6 7 8; do ( curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d @"$TMP/i.json" "$BASE_URL/api/informes-visita" > "$TMP/par$n.txt" ) & done; wait
CREADOS="$(cat "$TMP"/par*.txt | grep -c '^201$')"; DEVUELTOS="$(cat "$TMP"/par*.txt | grep -c '^200$')"
[ "$CREADOS" = "1" ] && [ "$DEVUELTOS" = "7" ] && [ "$(sql "select count(*) from informes_visita where client_report_id='$ID3'")" = "1" ] && pass "8 envíos a la vez: uno se crea (201), siete reciben el original (200) y hay una sola fila" || fail "simultáneos: 201=$CREADOS 200=$DEVUELTOS filas=$(sql "select count(*) from informes_visita where client_report_id='$ID3'")"

echo "4. Criterio 5: con la sesión vencida no se pierde nada; al volver a ingresar se envía"
ID4="cel-$(date +%s)-dddd4444"
informe "$ID4"
http "invalido.token.vencido" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "401" ] && [ "$(sql "select count(*) from informes_visita where client_report_id='$ID4'")" = "0" ] && pass "con el token vencido la API responde 401 y no guarda nada (el celular conserva el informe en su cola)" || fail "sesión vencida → $CODE"
RT2="$(login demo.rt.cola)"
http "$RT2" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "201" ] && [ "$(sql "select count(*) from informes_visita where client_report_id='$ID4'")" = "1" ] && pass "al ingresar de nuevo, el mismo informe se crea (201) y queda uno solo" || fail "tras volver a ingresar → $CODE"

echo "5. El sello no cambia con los reenvíos y el identificador no forma parte de él"
http "$SEC" POST "/api/informes-visita/$A/verificar"
[ "$(json "$TMP/r.json" 'b.coincide')" = "true" ] && pass "el informe reenviado 6 veces sigue sellado: la verificación coincide" || fail "verificar → $(head -c 300 "$TMP/r.json")"
http "$SEC" GET "/api/informes-visita/$A"
[ "$(json "$TMP/r.json" 'b.hashSha256')" = "$HA" ] && pass "el hash es el del primer envío (los reenvíos no lo recalculan)" || fail "hash cambió"

echo "6. Validación y compatibilidad"
informe "corto"
http "$RT" POST /api/informes-visita "$TMP/i.json"; { [ "$CODE" = "400" ] && grep -q "clientReportId" "$TMP/r.json"; } && pass "un identificador de menos de 8 caracteres → 400" || fail "id corto → $CODE"
informe "con espacios y simbolos!"
http "$RT" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "400" ] && pass "un identificador con espacios o símbolos → 400" || fail "id inválido → $CODE"
informe "-"
http "$RT" POST /api/informes-visita "$TMP/i.json"; C1="$CODE"
http "$RT" POST /api/informes-visita "$TMP/i.json"; C2="$CODE"
[ "$C1" = "201" ] && [ "$C2" = "201" ] && [ "$(sql "select count(*) from informes_visita where consorcio_id='$EDIF' and client_report_id is null")" = "2" ] && pass "sin identificador cada envío es un informe nuevo (como antes de esta tarjeta)" || fail "sin identificador → $C1 $C2"
http "$SEC" POST /api/informes-visita "$TMP/i.json"; [ "$CODE" = "403" ] && pass "la Secretaría no cierra informes (403): el RT es el único que los manda" || fail "secretaria → $CODE"
[ "$(sql "select count(*) from pg_indexes where tablename='informes_visita' and indexdef ilike '%unique%client_report_id%'")" = "1" ] && pass "la unicidad la garantiza la base (índice único sobre client_report_id)" || fail "índice único"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

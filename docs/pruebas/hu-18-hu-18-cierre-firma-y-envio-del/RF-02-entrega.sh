#!/usr/bin/env bash
# HU-18 / RF-02 (REQ-1795480710378) — El informe cerrado exige y sella las fotos obligatorias de cada equipo en uso.
#
#   bash docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RF-02-entrega.sh
#   bash docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RF-02-entrega.sh --carga 50    # además, 50 informes válidos y 50 rechazados
#
# Requiere `npm run db:up`, la API levantada (npm run dev) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Crea un RT y un edificio temporales y los borra al terminar (con sus informes y auditoría). BASE_URL por defecto http://127.0.0.1:3050.
# También corre las pruebas de la API (informes) y comprueba que los scripts de entrega de HU-18 ya mandan las fotos.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
CARGA=0
while [ $# -gt 0 ]; do case "$1" in --carga) CARGA="${2:-0}"; shift 2;; *) echo "Argumento desconocido: $1"; exit 2;; esac; done
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
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
limpiar() { [ -n "$EDIF" ] && sql "delete from consorcios where id='$EDIF'" >/dev/null; sql "delete from usuarios where usuario='demo.rt.fotos'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-18 / RF-02 contra $BASE_URL"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario='demo.rt.fotos'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.fotos','demo.rt.fotos','rt_calle','$HASH')" >/dev/null
# Ingresar con un usuario que no existe suma intentos fallidos y a los 5 bloquea la cuenta 15 minutos: antes se revisa que estén los datos de demo.
[ "$(docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "select count(*) from usuarios where usuario in ('demo.admin','demo.secretaria')" 2>/dev/null | tr -d '\r')" = "2" ] || { echo "  ❌ faltan los datos de demo (o no hay docker): corré antes bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh"; exit 2; }
ADMIN="$(login demo.admin)"; SEC="$(login demo.secretaria)"; RT="$(login demo.rt.fotos)"
{ [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ] && [ -n "$RT" ] && [ "$RT" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
printf '%s' '{"nombre":"DEMO HU18 fotos","direccion":"Calle Fotos 1","maquinas":[{"referenciaAgc":"M1"}]}' > "$TMP/e.json"
http "$ADMIN" POST /api/consorcios "$TMP/e.json"
EDIF="$(json "$TMP/r.json" 'b.id')"
[ -n "$EDIF" ] && [ "$EDIF" != "undefined" ] || { echo "  ❌ no pude crear el edificio de prueba"; exit 1; }
printf '%s' '{"rtCalle":{"nombre":"demo.rt.fotos","telefono":"11 0000-0000","email":"rt@demo.com"},"firmante":{"nombre":"Firmante","email":"f@f.com"},"eca":{"nombre":"ECA","email":"e@e.com"}}' > "$TMP/roles.json"
http "$ADMIN" PUT "/api/consorcios/$EDIF/roles" "$TMP/roles.json"

# informe <modo> → $TMP/i.json. Un equipo M1; el modo dice su tipo, su estado y qué fotos trae.
informe() {
  node -e '
    const [, modo, edif] = process.argv;
    const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=";
    const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD";
    const trazo = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);
    const F = { frente: { dataUrl: JPG }, cables: { dataUrl: JPG } };
    const M = {
      completo:        { tipo: "traccion",       estadoEquipo: "en_uso",            fotos: { "obligatoria:frente": F.frente, "obligatoria:cables": F.cables } },
      sinfotos:        { tipo: "traccion",       estadoEquipo: "en_uso",            fotos: {} },
      sincables:       { tipo: "traccion",       estadoEquipo: "en_uso",            fotos: { "obligatoria:frente": F.frente } },
      montasincables:  { tipo: "montavehiculos", estadoEquipo: "en_uso",            fotos: { "obligatoria:frente": F.frente } },
      hidraulico:      { tipo: "hidraulico",     estadoEquipo: "en_uso",            fotos: { "obligatoria:frente": F.frente } },
      hidrasinfrente:  { tipo: "hidraulico",     estadoEquipo: "en_uso",            fotos: {} },
      fuera:           { tipo: "traccion",       estadoEquipo: "fuera_de_servicio", fotos: {} },
      texto:           { tipo: "hidraulico",     estadoEquipo: "en_uso",            fotos: { "obligatoria:frente": { dataUrl: "no-soy-una-foto" } } },
      html:            { tipo: "hidraulico",     estadoEquipo: "en_uso",            fotos: { "obligatoria:frente": { dataUrl: "data:text/html;base64,PGgxPg==" } } },
      grande:          { tipo: "hidraulico",     estadoEquipo: "en_uso",            fotos: { "obligatoria:frente": { dataUrl: "data:image/jpeg;base64," + "A".repeat(2000000 - 23) } } },
    }[modo];
    const c = { consorcioId: edif, horaDispositivo: new Date().toISOString(),
      equipos: [{ maquinaId: "m1", referenciaAgc: "M1", respuestas: { cabina: { a: "ok" } }, observaciones: {}, ...M }],
      firma: { nombre: "Carlos", apellido: "Rodriguez", caracter: "Encargado", imagen: PNG, trazos: [trazo] } };
    process.stdout.write(JSON.stringify(c));
  ' "$1" "$EDIF" > "$TMP/i.json"
}
filas() { sql "select count(*) from informes_visita where consorcio_id='$EDIF'" | tr -d '\r'; }

echo "1. Un equipo en uso sin la foto del frente → 400 que nombra el equipo y la foto, y no guarda nada"
informe sinfotos; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "400" ] && grep -q "El equipo M1 (equipos\[0\]) no trae la foto de frente de cabina y botonera (obligatoria:frente)" "$TMP/r.json" && pass "sin fotos → 400: «El equipo M1 (equipos[0]) no trae la foto de frente de cabina y botonera (obligatoria:frente)…»" || fail "sin fotos → $CODE $(head -c 300 "$TMP/r.json")"
grep -q "no trae la foto de cables de tracción (obligatoria:cables)" "$TMP/r.json" && pass "y dice también la de cables, que falta en un equipo de tracción" || fail "no menciona la de cables"
[ "$(filas)" = "0" ] && pass "no quedó ninguna fila en la base" || fail "se guardó algo ($(filas) filas)"

echo "2. Tracción y montavehículos llevan la de cables; el hidráulico no"
informe sincables; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "400" ] && grep -q "cables de tracción (obligatoria:cables)" "$TMP/r.json" && ! grep -q "frente de cabina" "$TMP/r.json" && pass "tracción con el frente pero sin cables → 400, sólo por los cables" || fail "tracción sin cables → $CODE"
informe montasincables; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "400" ] && grep -q "cables de tracción" "$TMP/r.json" && pass "montavehículos sin cables → 400" || fail "montavehículos sin cables → $CODE"
informe hidraulico; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "201" ] && pass "hidráulico con sólo la foto del frente → 201 (no tiene cables de tracción)" || fail "hidráulico → $CODE $(head -c 200 "$TMP/r.json")"
informe hidrasinfrente; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "400" ] && grep -q "frente de cabina y botonera" "$TMP/r.json" && pass "hidráulico sin la del frente → 400 (el frente se pide siempre)" || fail "hidráulico sin frente → $CODE"

echo "3. La foto tiene que ser una imagen de hasta 2 MB"
informe texto; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "400" ] && grep -q "tiene que ser una imagen en data URL (jpeg, png o webp) de hasta 2 MB" "$TMP/r.json" && pass "un texto en lugar de la foto → 400 que dice cuál es" || fail "texto → $CODE"
informe html; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "400" ] && pass "otro tipo de archivo (text/html) → 400" || fail "html → $CODE"
informe grande; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "201" ] && pass "una foto de exactamente 2.000.000 caracteres entra (201)" || fail "foto de 2 MB → $CODE $(head -c 200 "$TMP/r.json")"
node -e 'const fs=require("fs");const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));c.equipos[0].fotos["obligatoria:frente"].dataUrl+="A";fs.writeFileSync(process.argv[1],JSON.stringify(c))' "$TMP/i.json"
http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "400" ] && grep -q "hasta 2 MB" "$TMP/r.json" && pass "un carácter más → 400" || fail "foto de más de 2 MB → $CODE"

echo "4. Un equipo fuera de servicio no las necesita"
informe fuera; http "$RT" POST /api/informes-visita "$TMP/i.json"
[ "$CODE" = "201" ] && pass "fuera de servicio sin fotos → 201 (lleva su reporte de parada)" || fail "fuera de servicio → $CODE $(head -c 200 "$TMP/r.json")"

echo "5. Las fotos obligatorias quedan selladas con el informe"
informe completo; http "$RT" POST /api/informes-visita "$TMP/i.json"
ID="$(json "$TMP/r.json" 'b.id')"; H="$(json "$TMP/r.json" 'b.hashSha256')"
[ "$CODE" = "201" ] && echo "$H" | grep -Eq '^[0-9a-f]{64}$' && pass "tracción con las dos fotos → 201 con su hash SHA-256" || { fail "informe completo → $CODE $(head -c 300 "$TMP/r.json")"; exit 1; }
[ "$(sql "select (contenido->'equipos'->0->'fotos') ? 'obligatoria:frente' and (contenido->'equipos'->0->'fotos') ? 'obligatoria:cables' from informes_visita where id='$ID'" | tr -d '\r')" = "t" ] && pass "las dos fotos quedaron en el contenido guardado en la base" || fail "las fotos no están en la base"
EXP="$(node -e '
  const { createHash } = require("crypto");
  const canon = (v) => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  const i = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const { hashSha256, versionHash, clientReportId, ...resto } = i;
  console.log(createHash("sha256").update(canon(resto), "utf8").digest("hex"));
' "$TMP/r.json")"
[ "$EXP" = "$H" ] && pass "el hash recalculado por fuera con otro programa (JSON canónico + SHA-256, con las fotos adentro) da el mismo valor" || fail "el hash no coincide con el cálculo independiente"
http "$SEC" POST "/api/informes-visita/$ID/verificar"
[ "$(json "$TMP/r.json" 'b.coincide')" = "true" ] && pass "la verificación del informe intacto coincide" || fail "verificación intacta"
sql "update informes_visita set contenido = jsonb_set(contenido, '{equipos,0,fotos,obligatoria:frente,dataUrl}', '\"data:image/jpeg;base64,AAAA\"') where id='$ID'" >/dev/null
http "$SEC" POST "/api/informes-visita/$ID/verificar"
[ "$(json "$TMP/r.json" 'b.coincide')" = "false" ] && pass "si alguien cambia la foto del frente directo en la base, la verificación NO coincide" || fail "la alteración de la foto no se detectó"

echo "6. Un informe cerrado antes de la regla (sin fotos obligatorias) se sigue leyendo y verificando"
informe completo; http "$RT" POST /api/informes-visita "$TMP/i.json"; V="$(json "$TMP/r.json" 'b.id')"
http "$SEC" GET "/api/informes-visita/$V"
NUEVO="$(node -e '
  const { createHash } = require("crypto");
  const canon = (v) => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  const i = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  delete i.equipos[0].fotos["obligatoria:frente"]; delete i.equipos[0].fotos["obligatoria:cables"];
  const { hashSha256, versionHash, clientReportId, ...resto } = i;
  console.log(createHash("sha256").update(canon(resto), "utf8").digest("hex"));
' "$TMP/r.json")"
sql "update informes_visita set contenido = (contenido #- '{equipos,0,fotos,obligatoria:frente}') #- '{equipos,0,fotos,obligatoria:cables}', hash_sha256='$NUEVO' where id='$V'" >/dev/null
http "$SEC" GET "/api/informes-visita/$V"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'Object.keys(b.equipos[0].fotos).length')" = "0" ] && pass "se lee (200), sin fotos obligatorias: la regla se aplica sólo al cerrar" || fail "leer el informe anterior → $CODE"
http "$SEC" GET "/api/informes-visita"; [ "$CODE" = "200" ] && grep -q "$V" "$TMP/r.json" && pass "figura en el listado" || fail "listado"
http "$SEC" POST "/api/informes-visita/$V/verificar"; [ "$(json "$TMP/r.json" 'b.coincide')" = "true" ] && pass "y su verificación coincide" || fail "verificar el informe anterior"

echo "7. Las pruebas de la API y los scripts de entrega de HU-18"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest informes > "$TMP/j.txt" 2>&1)
grep -qE "^Tests:.* passed" "$TMP/j.txt" && ! grep -qE "^Tests:.* failed" "$TMP/j.txt" && pass "pruebas de informes (unitarias y e2e): $(grep -E '^Tests:' "$TMP/j.txt" | tr -s ' ')" || { fail "pruebas de informes"; tail -15 "$TMP/j.txt"; }
n=$(grep -l "obligatoria:frente" "$REPO_ROOT"/docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RF-01-entrega.sh "$REPO_ROOT"/docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RNF-01-entrega.sh "$REPO_ROOT"/docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RNF-02-entrega.sh | wc -l)
[ "$n" = "3" ] && pass "los tres scripts de entrega de HU-18 que arman informes (RF-01, RNF-01 y RNF-02) ya mandan las fotos" || fail "faltan scripts con las fotos ($n de 3)"

if [ "$CARGA" -gt 0 ]; then
  echo "8. Carga: $CARGA informes válidos y $CARGA rechazados"
  informe completo; cp "$TMP/i.json" "$TMP/ok.json"; informe sinfotos; cp "$TMP/i.json" "$TMP/mal.json"
  : > "$TMP/t-ok.txt"; : > "$TMP/t-mal.txt"; FALLAS=0
  for i in $(seq 1 "$CARGA"); do
    c="$(curl -s -o /dev/null -w '%{http_code} %{time_total}' -X POST -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d @"$TMP/ok.json" "$BASE_URL/api/informes-visita")"
    [ "${c%% *}" = "201" ] || FALLAS=$((FALLAS+1)); echo "${c##* }" >> "$TMP/t-ok.txt"
    c="$(curl -s -o /dev/null -w '%{http_code} %{time_total}' -X POST -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d @"$TMP/mal.json" "$BASE_URL/api/informes-visita")"
    [ "${c%% *}" = "400" ] || FALLAS=$((FALLAS+1)); echo "${c##* }" >> "$TMP/t-mal.txt"
  done
  est() { node -e 'const t=require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").map(Number).sort((a,b)=>a-b);const m=t.reduce((s,v)=>s+v,0)/t.length;console.log("promedio "+Math.round(m*1000)+" ms · p95 "+Math.round(t[Math.max(0,Math.ceil(t.length*0.95)-1)]*1000)+" ms · máx "+Math.round(t[t.length-1]*1000)+" ms")' "$1"; }
  [ "$FALLAS" = "0" ] && pass "$CARGA informes válidos (201) y $CARGA rechazados (400): 0 respuestas inesperadas" || fail "$FALLAS respuestas inesperadas"
  echo "     válidos:    $(est "$TMP/t-ok.txt")"; echo "     rechazados: $(est "$TMP/t-mal.txt")"
fi

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

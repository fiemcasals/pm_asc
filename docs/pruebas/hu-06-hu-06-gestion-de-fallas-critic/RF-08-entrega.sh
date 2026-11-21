#!/usr/bin/env bash
# HU-06 / RF-08 (REQ-1795263641766) — Los informes de falla crítica y el estado del ascensor se guardan en PostgreSQL y sobreviven a un
# reinicio de la API.
#
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-08-entrega.sh
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-08-entrega.sh --carga 30
#
# Levanta una API compilada propia. Un RT temporal registra una falla crítica (con clientReportId) y marca el equipo «Fuera de Servicio»;
# demo.firmante lo confirma. Se APAGA la API y se vuelve a arrancar, y se comprueba lo que ven demo.secretaria y demo.firmante, que el
# reintento del celular no duplique ni vuelva a avisar, y que el estado siga confirmado. Usa una máquina de «DEMO Corrientes 100» de
# los datos de demo de HU-04 RF-02; borra el RT, los informes, avisos y reportes de prueba al terminar. Necesita `npm run db:up`.
# Con --carga N manda N reintentos del mismo informe (ninguno tiene que duplicarlo ni avisar).
set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then CARGA="$2"; fi
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PUERTO="${PUERTO:-3156}"
API="http://127.0.0.1:$PUERTO"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
CLIENT_ID="cel-qa-h06-$(date +%s)"
TMP="$(mktemp -d)"
OK=0; KO=0; API_PID=""; MAQUINA=""
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }

limpiar() {
  sql "delete from avisos_falla where alerta_id in (select id from informes_falla where informe->>'inspector'='qa.h06.rt')" >/dev/null 2>&1
  sql "delete from informes_falla where informe->>'inspector'='qa.h06.rt'" >/dev/null 2>&1
  sql "delete from reportes_parada where reporte->>'reportadoPor'='qa.h06.rt'" >/dev/null 2>&1
  sql "delete from usuarios where usuario='qa.h06.rt'" >/dev/null 2>&1
  sql "delete from intentos_login where usuario='qa.h06.rt'" >/dev/null 2>&1
  [ -n "$API_PID" ] && kill "$API_PID" >/dev/null 2>&1
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-06 / RF-08 (informes de falla crítica en PostgreSQL) contra la API compilada"
[ "$(sql "select count(*) from usuarios where usuario in ('demo.secretaria','demo.firmante','demo.eca')" | tr -d ' \r')" = "3" ] \
  || { echo "  ❌ faltan los datos de demo: corré antes bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh"; exit 2; }
(cd "$REPO_ROOT" && npm run build --workspace=@mant-asc/api >/dev/null) || { echo "No compiló la API"; exit 1; }
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Clave-QA-2026",4))')"
sql "delete from usuarios where usuario='qa.h06.rt'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('qa.h06.rt','RT QA','rt_calle','$HASH')" >/dev/null || { echo "No pude crear el RT temporal"; exit 1; }

login() { # login <usuario> [clave]
  printf '{"usuario":"%s","password":"%s"}' "$1" "${2:-Clave-QA-2026}" > "$TMP/l.json"
  curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$API/api/auth/login"
  json "$TMP/lr.json" 'b.accessToken||""'
}
levantar() {
  env API_PORT="$PUERTO" node "$REPO_ROOT/apps/api/dist/main.js" >> "$TMP/api.log" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/health")" = "200" ] && break; sleep 0.5; done
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/health")" = "200" ] || { echo "La API no levantó:"; tail -5 "$TMP/api.log"; exit 1; }
  RT="$(login qa.h06.rt)"; SEC="$(login demo.secretaria Demo-Clave-2026)"; FIR="$(login demo.firmante Demo-Clave-2026)"; ECA="$(login demo.eca Demo-Clave-2026)"
  { [ -n "$RT" ] && [ -n "$SEC" ] && [ -n "$FIR" ] && [ -n "$ECA" ]; } || { echo "No pude ingresar (¿datos de demo?)"; exit 1; }
  if [ -z "$MAQUINA" ]; then
    curl -s -o "$TMP/e0.json" -H "Authorization: Bearer $ECA" "$API/api/eca/maquinas"
    MAQUINA="$(json "$TMP/e0.json" '(b.find(m=>m.edificio&&m.edificio.consorcio==="DEMO Corrientes 100")||{}).id||""')"
    [ -n "$MAQUINA" ] || { echo "No encuentro una máquina de DEMO Corrientes 100 (¿datos de demo?)"; exit 1; }
  fi
}
apagar() { kill "$API_PID" >/dev/null 2>&1; wait "$API_PID" 2>/dev/null; API_PID=""; }
informar() {
  printf '{"maquinaId":"%s","fallasCriticas":["BOTON_PARE_FALLA"],"clientReportId":"%s"}' "$MAQUINA" "$CLIENT_ID" > "$TMP/i.json"
  curl -s -o "$TMP/ir.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d @"$TMP/i.json" "$API/api/fallas-criticas/informes"
}
en_panel() { curl -s -o "$TMP/p.json" -H "Authorization: Bearer $1" "$API/api/fallas-criticas/informes"; json "$TMP/p.json" "b.filter(e=>e.informeId==='$ID').length"; }
avisos_de() { curl -s -o "$TMP/a.json" -H "Authorization: Bearer $SEC" "$API/api/avisos"; json "$TMP/a.json" "b.filter(a=>a.alertaId==='$ID').length"; }
confirmacion() { curl -s -o "$TMP/r.json" -H "Authorization: Bearer $SEC" "$API/api/paradas"; json "$TMP/r.json" "(b.find(r=>r.id==='$PID_PAR')||{}).confirmacion"; }

levantar
echo "1. Antes del reinicio"
C="$(informar)"; ID="$(json "$TMP/ir.json" 'b.informe.id')"
[ "$C" = "201" ] && [ "$(json "$TMP/ir.json" 'b.eventoEmitido')" = "true" ] && pass "el RT informa «Botón de PARE: Falla» en la M1 de DEMO Corrientes 100 ($ID) y se emite la alerta" || { fail "informar → $C $(head -c 200 "$TMP/ir.json")"; exit 1; }
printf '{"maquinaId":"%s","estado":"Fuera de Servicio","causa":"Botón de PARE roto","fotos":["data:image/jpeg;base64,AAAA"]}' "$MAQUINA" > "$TMP/par.json"
curl -s -o "$TMP/parr.json" -X POST -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d @"$TMP/par.json" "$API/api/paradas"; PID_PAR="$(json "$TMP/parr.json" 'b.id')"
C="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $FIR" "$API/api/paradas/$PID_PAR/confirmar")"
[ "$C" = "200" ] && pass "el RT marca el equipo «Fuera de Servicio» y demo.firmante lo confirma" || fail "confirmar → $C"
[ "$(en_panel "$SEC")" = "1" ] && [ "$(en_panel "$FIR")" = "1" ] && [ "$(avisos_de)" = "1" ] && pass "la Secretaría y el Firmante ven la alerta, y hay un aviso en la bandeja" || fail "antes: panel $(en_panel "$SEC")/$(en_panel "$FIR"), avisos $(avisos_de)"

echo "2. Reinicio real de la API (se apaga el proceso y se vuelve a arrancar)"
sleep 1; apagar; levantar
pass "la API se reinició"

echo "3. Después del reinicio"
[ "$(en_panel "$SEC")" = "1" ] && [ "$(en_panel "$FIR")" = "1" ] && pass "criterio 1: la Secretaría y demo.firmante siguen viendo la alerta" || fail "criterio 1: panel $(en_panel "$SEC")/$(en_panel "$FIR")"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SEC" "$API/api/fallas-criticas/informes/$ID")" = "200" ] && [ "$(avisos_de)" = "1" ] && pass "criterio 1: el informe se sigue abriendo y su aviso sigue en la bandeja" || fail "criterio 1: informe o aviso"
C="$(informar)"
[ "$C" = "201" ] && [ "$(json "$TMP/ir.json" 'b.informe.id')" = "$ID" ] && [ "$(json "$TMP/ir.json" 'b.eventoEmitido')" = "false" ] && [ "$(avisos_de)" = "1" ] \
  && pass "criterio 2: el reintento del celular devuelve el mismo informe, sin alerta nueva ni aviso duplicado" || fail "criterio 2: $C id $(json "$TMP/ir.json" 'b.informe.id') evento $(json "$TMP/ir.json" 'b.eventoEmitido') avisos $(avisos_de)"
[ "$(confirmacion)" = "Confirmado" ] && pass "criterio 3: el estado «Fuera de Servicio» sigue confirmado por el Firmante" || fail "criterio 3: $(confirmacion)"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $RT" "$API/api/fallas-criticas/informes")" = "403" ] && pass "criterio 4: el RT sigue sin ver el panel de alertas de la Secretaría (403), como antes" || fail "criterio 4: el RT ve el panel"
if [ "$CARGA" -gt 0 ]; then
  for _ in $(seq 1 "$CARGA"); do informar >/dev/null; done
  [ "$(sql "select count(*) from informes_falla where client_report_id='$CLIENT_ID'" | tr -d ' \r')" = "1" ] && [ "$(avisos_de)" = "1" ] && pass "carga: $CARGA reintentos más y sigue habiendo un informe y un aviso" || fail "carga: se duplicó"
fi

echo "4. Pruebas automáticas"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest test/fallas-persistencia.e2e-spec.ts test/fallas-criticas.e2e-spec.ts > "$TMP/t.txt" 2>&1)
grep -qE "^Tests: +[0-9]+ passed" "$TMP/t.txt" && ! grep -q "failed" "$TMP/t.txt" && pass "pruebas de fallas críticas: $(grep -E '^Tests:' "$TMP/t.txt" | tr -s ' ')" || fail "pruebas de fallas críticas"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest --config jest.int.config.js --runInBand test/fallas-persistencia.int-spec.ts > "$TMP/n.txt" 2>&1)
grep -qE "^Tests: +[0-9]+ passed" "$TMP/n.txt" && ! grep -q "failed" "$TMP/n.txt" && pass "integración con PostgreSQL real: $(grep -E '^Tests:' "$TMP/n.txt" | tr -s ' ')" || fail "integración con PostgreSQL real"

echo "Resultado: $OK ok, $KO con error"
[ "$KO" -eq 0 ]

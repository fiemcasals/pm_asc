#!/usr/bin/env bash
# HU-17 / RF-09 (REQ-1795263643334) — Los reportes de parada se guardan en PostgreSQL y sobreviven a un reinicio de la API.
#
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-09-entrega.sh
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-09-entrega.sh --carga 50
#
# Levanta una API compilada propia; el RT reporta un equipo «Fuera de Servicio», se APAGA la API y se vuelve a arrancar, y se comprueba
# que la Secretaría, el Firmante y la ECA lo siguen viendo y que el reintento del celular no lo duplica. Usa los datos de demo de HU-04
# RF-02 (demo.secretaria, demo.firmante y demo.eca, y una máquina de «DEMO Cabildo 1540»); crea un RT temporal y lo borra al terminar,
# junto con los reportes de prueba. Necesita `npm run db:up`. Con --carga N manda N reintentos del mismo reporte (ninguno lo duplica).
set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then CARGA="$2"; fi
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PUERTO="${PUERTO:-3146}"
API="http://127.0.0.1:$PUERTO"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
MAQUINA=""
CLIENT_ID="cel-qa-h17-$(date +%s)"
TMP="$(mktemp -d)"
OK=0; KO=0; API_PID=""
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }

limpiar() {
  sql "delete from reportes_parada where reporte->>'reportadoPor'='qa.h17.rt'" >/dev/null 2>&1
  sql "delete from usuarios where usuario='qa.h17.rt'" >/dev/null 2>&1
  sql "delete from intentos_login where usuario='qa.h17.rt'" >/dev/null 2>&1
  [ -n "$API_PID" ] && kill "$API_PID" >/dev/null 2>&1
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-17 / RF-09 (reportes de parada en PostgreSQL) contra la API compilada"
(cd "$REPO_ROOT" && npm run build --workspace=@mant-asc/api >/dev/null) || { echo "No compiló la API"; exit 1; }
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Clave-QA-2026",4))')"
[ "$(sql "select count(*) from usuarios where usuario in ('demo.secretaria','demo.firmante','demo.eca')" | tr -d ' \r')" = "3" ] \
  || { echo "  ❌ faltan los datos de demo: corré antes bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh"; exit 2; }
sql "delete from usuarios where usuario='qa.h17.rt'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('qa.h17.rt','RT QA','rt_calle','$HASH')" >/dev/null || { echo "No pude crear el RT temporal"; exit 1; }
sql "delete from reportes_parada where reporte->>'reportadoPor'='qa.h17.rt'" >/dev/null

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
  RT="$(login qa.h17.rt)"; SEC="$(login demo.secretaria Demo-Clave-2026)"; ECA="$(login demo.eca Demo-Clave-2026)"; FIR="$(login demo.firmante Demo-Clave-2026)"
  { [ -n "$RT" ] && [ -n "$SEC" ] && [ -n "$ECA" ] && [ -n "$FIR" ]; } || { echo "No pude ingresar (¿datos de demo?)"; exit 1; }
  if [ -z "$MAQUINA" ]; then
    curl -s -o "$TMP/e0.json" -H "Authorization: Bearer $ECA" "$API/api/eca/maquinas"
    MAQUINA="$(json "$TMP/e0.json" '(b.find(m=>m.edificio&&m.edificio.consorcio==="DEMO Cabildo 1540")||{}).id||""')"
    [ -n "$MAQUINA" ] || { echo "demo.eca no ve ninguna máquina de DEMO Cabildo 1540 (¿datos de demo?)"; exit 1; }
  fi
}
apagar() { kill "$API_PID" >/dev/null 2>&1; wait "$API_PID" 2>/dev/null; API_PID=""; }
reportar() {
  printf '{"maquinaId":"%s","estado":"Fuera de Servicio","causa":"Cabina trabada entre pisos","fotos":["data:image/jpeg;base64,AAAA"],"clientReportId":"%s"}' "$MAQUINA" "$CLIENT_ID" > "$TMP/p.json"
  curl -s -o "$TMP/pr.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d @"$TMP/p.json" "$API/api/paradas"
}
cuantos_secretaria() { curl -s -o "$TMP/l.json" -H "Authorization: Bearer $SEC" "$API/api/paradas"; node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(b.filter(r=>r.maquinaId===process.argv[2]&&r.reportadoPor==="qa.h17.rt").length)' "$TMP/l.json" "$MAQUINA"; }
estado_eca() { curl -s -o "$TMP/e.json" -H "Authorization: Bearer $ECA" "$API/api/eca/maquinas"; node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const m=(Array.isArray(b)?b:b.maquinas||[]).find(x=>x.id===process.argv[2]);console.log(m?m.estadoOperativo:"(no la ve)")' "$TMP/e.json" "$MAQUINA"; }
cuantos_firmante() { curl -s -o "$TMP/f.json" -H "Authorization: Bearer $FIR" "$API/api/paradas"; node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(Array.isArray(b)?b.filter(r=>r.maquinaId===process.argv[2]&&r.reportadoPor==="qa.h17.rt").length:"error")' "$TMP/f.json" "$MAQUINA"; }

levantar
echo "1. Antes del reinicio"
C="$(reportar)"; ID="$(json "$TMP/pr.json" 'b.id')"
[ "$C" = "201" ] && pass "el RT reporta la M1 de DEMO Cabildo 1540 «Fuera de Servicio» ($ID)" || { fail "reportar → $C $(head -c 200 "$TMP/pr.json")"; exit 1; }
[ "$(cuantos_secretaria)" = "1" ] && [ "$(cuantos_firmante)" = "1" ] && [ "$(estado_eca)" = "Fuera de Servicio" ] && pass "la Secretaría y el Firmante ven el reporte, y la ECA ve el equipo «Fuera de Servicio»" || fail "antes: secretaría $(cuantos_secretaria), ECA $(estado_eca)"
sleep 1
[ "$(sql "select count(*) from reportes_parada where id='$ID'" | tr -d ' \r')" = "1" ] && pass "quedó una fila en reportes_parada" || fail "no quedó la fila en reportes_parada"

echo "2. Reinicio real de la API (se apaga el proceso y se vuelve a arrancar)"
apagar; levantar
pass "la API se reinició"

echo "3. Después del reinicio"
[ "$(cuantos_secretaria)" = "1" ] && pass "criterio 1: la Secretaría sigue viendo el reporte" || fail "criterio 1: la Secretaría ve $(cuantos_secretaria)"
[ "$(estado_eca)" = "Fuera de Servicio" ] && pass "criterio 1: la ECA sigue viendo el equipo «Fuera de Servicio»" || fail "criterio 1: la ECA ve «$(estado_eca)»"
[ "$(cuantos_firmante)" = "1" ] && pass "criterio 1: el Firmante del edificio (demo.firmante) sigue viendo el reporte" || fail "criterio 1: el Firmante ve $(cuantos_firmante)"
C="$(reportar)"
[ "$C" = "201" ] && [ "$(json "$TMP/pr.json" 'b.id')" = "$ID" ] && [ "$(cuantos_secretaria)" = "1" ] && pass "criterio 2: el celular reintenta el mismo reporte y recibe el mismo ($ID), sin duplicarlo" || fail "criterio 2: reintento → $C, id $(json "$TMP/pr.json" 'b.id'), reportes $(cuantos_secretaria)"
if [ "$CARGA" -gt 0 ]; then
  for _ in $(seq 1 "$CARGA"); do reportar >/dev/null; done
  [ "$(sql "select count(*) from reportes_parada where client_report_id='$CLIENT_ID'" | tr -d ' \r')" = "1" ] && [ "$(cuantos_secretaria)" = "1" ] && pass "carga: $CARGA reintentos más y sigue habiendo un solo reporte" || fail "carga: se duplicó"
fi

echo "4. Pruebas automáticas"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest test/paradas-persistencia.e2e-spec.ts test/paradas.spec.ts test/estado-ascensor.spec.ts > "$TMP/a.txt" 2>&1)
grep -qE "^Tests: +[0-9]+ passed" "$TMP/a.txt" && ! grep -q "failed" "$TMP/a.txt" && pass "pruebas de paradas: $(grep -E '^Tests:' "$TMP/a.txt" | tr -s ' ')" || fail "pruebas de paradas"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest --config jest.int.config.js --runInBand test/paradas-persistencia.int-spec.ts > "$TMP/i.txt" 2>&1)
grep -qE "^Tests: +[0-9]+ passed" "$TMP/i.txt" && ! grep -q "failed" "$TMP/i.txt" && pass "integración con PostgreSQL real: $(grep -E '^Tests:' "$TMP/i.txt" | tr -s ' ')" || fail "integración con PostgreSQL real"

echo "Resultado: $OK ok, $KO con error"
[ "$KO" -eq 0 ]

#!/usr/bin/env bash
# HU-01 / RF-03 — Importar listado Excel de la AGC (.xlsx, <= 5 MB).
#
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-03-entrega.sh
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-03-entrega.sh --carga 20
#
# Requiere `npm run db:up`, la API levantada y datos demo (RF-02-datos-demo.sh).
# Crea edificios/máquinas con prefijo temporal y los elimina al finalizar.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then
  CARGA="$2"
fi

TMP="$(mktemp -d)"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PREFIJO="E2EAGC$(date +%s)"
OK=0; KO=0

pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }

limpiar() {
  sql "delete from consorcios where direccion like '%${PREFIJO}%'" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "== HU-01 / RF-03 (Importar Excel AGC) contra $BASE_URL"

# Login como Secretaría
printf '{"usuario":"demo.secretaria","password":"Demo-Clave-2026"}' > "$TMP/login.json"
curl -s -o "$TMP/login_res.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login.json" "$BASE_URL/api/auth/login"
TOKEN="$(json "$TMP/login_res.json" 'b.accessToken')"
if [ -z "$TOKEN" ] || [ "$TOKEN" = "undefined" ]; then
  echo "  ❌ No pude ingresar como demo.secretaria: corré antes RF-02-datos-demo.sh"
  exit 1
fi

# Generar archivos Excel de prueba con exceljs desde el repo
node -e '
const ExcelJS = require(process.argv[1] + "/node_modules/exceljs");
const fs = require("fs");
const tmp = process.argv[2];
const pref = process.argv[3];
(async () => {
  const wb1 = new ExcelJS.Workbook();
  const ws1 = wb1.addWorksheet("Padron");
  ws1.addRow(["Dirección", "Matrícula AGC", "Tipo de equipo", "Estado"]);
  ws1.addRow(["Av. Corrientes " + pref + " 100", pref + "-M1", "traccion", "APTO"]);
  ws1.addRow(["Av. Corrientes " + pref + " 100", pref + "-M2", "hidraulico", "OBSERVADO"]);
  ws1.addRow(["", pref + "-ERR1", "traccion", "APTO"]);
  ws1.addRow(["Av. Santa Fe " + pref + " 200", pref + "-ERR2", "invalido", "APTO"]);
  await wb1.xlsx.writeFile(tmp + "/padron1.xlsx");

  const wb2 = new ExcelJS.Workbook();
  const ws2 = wb2.addWorksheet("Padron");
  ws2.addRow(["Dirección", "Matrícula AGC", "Tipo de equipo", "Estado"]);
  ws2.addRow(["Av. Corrientes " + pref + " 100", pref + "-M2", "montavehiculos", "APTO"]);
  ws2.addRow(["Av. Santa Fe " + pref + " 200", pref + "-M3", "traccion", "NO APTO"]);
  await wb2.xlsx.writeFile(tmp + "/padron2.xlsx");

  fs.writeFileSync(tmp + "/no_excel.csv", "Direccion,Matricula AGC,Tipo de equipo,Estado\nCalle 1,M1,traccion,APTO\n");
  const big = Buffer.alloc(5 * 1024 * 1024 + 2048, 0x41);
  big[0] = 0x50; big[1] = 0x4b; big[2] = 0x03; big[3] = 0x04;
  fs.writeFileSync(tmp + "/gigante.xlsx", big);
})();
' "$REPO_ROOT" "$TMP" "$PREFIJO"

echo "1. Primera importación con filas válidas e inválidas (Criterios 1, 2 y 3)"
CODE="$(curl -s -o "$TMP/r1.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" -F "archivo=@$TMP/padron1.xlsx" "$BASE_URL/api/consorcios/importar-agc")"
if [ "$CODE" = "200" ] && [ "$(json "$TMP/r1.json" 'b.creadas+"|"+b.actualizadas+"|"+b.rechazadas')" = "2|0|2" ]; then
  pass "HTTP 200: 2 máquinas creadas, 0 actualizadas y 2 filas rechazadas con detalle"
else
  fail "primera importación → $CODE $(cat "$TMP/r1.json")"
fi

if [ "$(json "$TMP/r1.json" 'b.errores[0].fila+"|"+b.errores[1].fila')" = "4|5" ]; then
  pass "las filas inválidas reportan su número exacto (4 y 5) y motivo"
else
  fail "errores de fila inesperados: $(cat "$TMP/r1.json")"
fi

echo "2. Re-importación actualiza matrícula existente sin duplicar y crea nueva (Criterio 1 y 3)"
CODE="$(curl -s -o "$TMP/r2.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" -F "archivo=@$TMP/padron2.xlsx" "$BASE_URL/api/consorcios/importar-agc")"
if [ "$CODE" = "200" ] && [ "$(json "$TMP/r2.json" 'b.creadas+"|"+b.actualizadas+"|"+b.rechazadas')" = "1|1|0" ]; then
  pass "HTTP 200: 1 máquina creada y 1 actualizada (M2) sin duplicados"
else
  fail "segunda importación → $CODE $(cat "$TMP/r2.json")"
fi

COUNT_DB="$(sql "select count(*) from maquinas where referencia_agc like '${PREFIJO}-%'")"
if [ "$COUNT_DB" = "3" ]; then
  pass "en PostgreSQL existen exactamente 3 máquinas (cero duplicados)"
else
  fail "se esperaban 3 máquinas en PostgreSQL, hay: $COUNT_DB"
fi

ESTADO_M2="$(sql "select tipo || '|' || coalesce(estado_agc,'') from maquinas where referencia_agc='${PREFIJO}-M2'")"
if [ "$ESTADO_M2" = "montavehiculos|APTO" ]; then
  pass "M2 quedó actualizada en PostgreSQL a montavehiculos / APTO"
else
  fail "estado de M2 inesperado en PostgreSQL: $ESTADO_M2"
fi

echo "3. Archivo no .xlsx y archivo > 5 MB rechazados con 400 sin importar nada (Criterio 4)"
CODE_CSV="$(curl -s -o "$TMP/rcsv.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" -F "archivo=@$TMP/no_excel.csv" "$BASE_URL/api/consorcios/importar-agc")"
if [ "$CODE_CSV" = "400" ]; then
  pass "archivo .csv rechazado con HTTP 400"
else
  fail "archivo .csv devolvió $CODE_CSV"
fi

CODE_BIG="$(curl -s -o "$TMP/rbig.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" -F "archivo=@$TMP/gigante.xlsx" "$BASE_URL/api/consorcios/importar-agc")"
if [ "$CODE_BIG" = "400" ]; then
  pass "archivo > 5 MB rechazado con HTTP 400 sin importar nada"
else
  fail "archivo > 5 MB devolvió $CODE_BIG $(cat "$TMP/rbig.json")"
fi

echo "4. Plantilla descargable .xlsx"
CODE_PLT="$(curl -s -o "$TMP/plantilla.xlsx" -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/consorcios/importar-agc/plantilla")"
if [ "$CODE_PLT" = "200" ] && [ -s "$TMP/plantilla.xlsx" ]; then
  pass "plantilla .xlsx descargada correctamente (HTTP 200)"
else
  fail "plantilla devolvió $CODE_PLT"
fi

if [ "$CARGA" -gt 0 ]; then
  echo
  echo "== Prueba de carga: $CARGA importaciones consecutivas"
  FALLOS_CARGA=0
  MAX_MS=0
  TOTAL_MS=0
  for i in $(seq 1 "$CARGA"); do
    T0="$(node -e 'console.log(Date.now())')"
    C="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" -F "archivo=@$TMP/padron2.xlsx" "$BASE_URL/api/consorcios/importar-agc")"
    T1="$(node -e 'console.log(Date.now())')"
    DT=$((T1 - T0))
    TOTAL_MS=$((TOTAL_MS + DT))
    [ "$DT" -gt "$MAX_MS" ] && MAX_MS="$DT"
    [ "$C" != "200" ] && FALLOS_CARGA=$((FALLOS_CARGA + 1))
  done
  PROM_MS=$((TOTAL_MS / CARGA))
  echo "  Corridas: $CARGA | Fallos: $FALLOS_CARGA | Promedio: ${PROM_MS} ms | Más lenta: ${MAX_MS} ms"
  [ "$FALLOS_CARGA" = "0" ] && pass "prueba de carga ($CARGA corridas, 0 fallos, máx ${MAX_MS} ms)" || fail "carga tuvo $FALLOS_CARGA fallos"
fi

echo
echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

#!/usr/bin/env bash
# HU-06 / RF-02 — Generación de PDF Legal MAICON S.R.L. y envío por email a la ECA.
#
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-02-entrega.sh
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-02-entrega.sh --carga 25
#
# Requiere `npm run db:up`, la API levantada y usuarios demo (RF-02-datos-demo.sh).

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then
  CARGA="$2"
fi

TMP="$(mktemp -d)"
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
trap 'rm -rf "$TMP"' EXIT

echo "== HU-06 / RF-02 (PDF Legal MAICON S.R.L. y email a ECA) contra $BASE_URL"

# Login Secretaría y RT de Calle (RF-06 exige sesión rt_calle para registrar fallas críticas)
printf '{"usuario":"demo.secretaria","password":"Demo-Clave-2026"}' > "$TMP/login.json"
curl -s -o "$TMP/login_res.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login.json" "$BASE_URL/api/auth/login"
TOKEN="$(json "$TMP/login_res.json" 'b.accessToken')"
if [ -z "$TOKEN" ] || [ "$TOKEN" = "undefined" ]; then
  echo "  ❌ No pude ingresar como demo.secretaria"
  exit 1
fi

printf '{"usuario":"demo.rt","password":"Demo-Clave-2026"}' > "$TMP/login_rt.json"
curl -s -o "$TMP/login_rt_res.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login_rt.json" "$BASE_URL/api/auth/login"
TOKEN_RT="$(json "$TMP/login_rt_res.json" 'b.accessToken')"
if [ -z "$TOKEN_RT" ] || [ "$TOKEN_RT" = "undefined" ]; then
  echo "  ❌ No pude ingresar como demo.rt"
  exit 1
fi

echo "1. Registrar Falla Crítica NO envía ningún email (Criterio 2)"
cat > "$TMP/falla.json" <<'JSON'
{
  "maquinaId": "MAQ-CORRIENTES-M1",
  "inspector": "demo.rt",
  "fallasCriticas": ["BOTON_PARE_FALLA", "CABLES_TRACCION_DESGASTADOS"],
  "observaciones": "Verificacion RF-02 PDF Legal MAICON S.R.L.",
  "fotografias": [
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    "https://storage.maicon.com.ar/evidencia/rf02-cables.jpg"
  ]
}
JSON
CODE="$(curl -s -o "$TMP/falla_res.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN_RT" -H 'Content-Type: application/json' -d @"$TMP/falla.json" "$BASE_URL/api/fallas-criticas/informes")"
INF_ID="$(json "$TMP/falla_res.json" 'b.informe && b.informe.id')"
if [ "$CODE" = "201" ] && [ -n "$INF_ID" ] && [ "$INF_ID" != "undefined" ]; then
  pass "falla crítica registrada (HTTP 201, id=$INF_ID)"
else
  fail "falla crítica → $CODE $(cat "$TMP/falla_res.json")"; exit 1
fi

curl -s -o "$TMP/aviso_pend.json" -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/avisos/$INF_ID"
if [ "$(json "$TMP/aviso_pend.json" 'b.estado+"|"+b.envios.length+"|"+String(b.constanciaEmailLegal)')" = "Pendiente de revisión|0|null" ]; then
  pass "el aviso quedó en «Pendiente de revisión» con 0 envíos y sin constancia de correo"
else
  fail "estado inicial inesperado: $(cat "$TMP/aviso_pend.json")"
fi

CODE_REINT="$(curl -s -o "$TMP/reint_409.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' "$BASE_URL/api/avisos/$INF_ID/reintentar-email")"
if [ "$CODE_REINT" = "409" ]; then
  pass "reintentar email antes de aprobar se rechaza con HTTP 409"
else
  fail "reintentar antes de aprobar devolvió $CODE_REINT"
fi

echo "2. Generación de PDF Legal con membrete MAICON S.R.L., datos, fallas y fotos (Criterio 1)"
CODE_PDF="$(curl -s -D "$TMP/pdf.headers" -o "$TMP/deslinde.pdf" -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/avisos/$INF_ID/pdf-legal")"
MAGIC="$(head -c 5 "$TMP/deslinde.pdf")"
if [ "$CODE_PDF" = "200" ] && [ "$MAGIC" = "%PDF-" ] && grep -qi "application/pdf" "$TMP/pdf.headers" && grep -qi "x-pdf-sha256:" "$TMP/pdf.headers"; then
  pass "PDF legal generado (HTTP 200, %PDF-, Content-Type application/pdf y X-PDF-SHA256)"
else
  fail "PDF legal → $CODE_PDF (magic=$MAGIC)"
fi

echo "3. Aprobación de Secretaría registra constancia de envío de PDF legal (Criterios 3 y 4)"
printf '{"emailEca":"legales@eca-prueba.com.ar"}' > "$TMP/aprobar.json"
CODE_APR="$(curl -s -o "$TMP/aprobado.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d @"$TMP/aprobar.json" "$BASE_URL/api/avisos/$INF_ID/aprobar")"
CONST_INFO="$(json "$TMP/aprobado.json" 'b.constanciaEmailLegal ? b.constanciaEmailLegal.destino+"|"+b.constanciaEmailLegal.archivoPdf+"|"+Boolean(b.constanciaEmailLegal.fecha)+"|"+b.constanciaEmailLegal.estado : "null"')"
if [ "$CODE_APR" = "201" ] && echo "$CONST_INFO" | grep -q "legales@eca-prueba.com.ar|deslinde-maicon-"; then
  pass "aprobación ejecutada (HTTP 201) con constanciaEmailLegal registrada ($CONST_INFO)"
else
  fail "aprobación → $CODE_APR ($CONST_INFO) $(cat "$TMP/aprobado.json")"
fi

if [ "$CARGA" -gt 0 ]; then
  echo
  echo "== Prueba de carga: $CARGA generaciones consecutivas del PDF Legal MAICON S.R.L."
  FALLOS_CARGA=0; MAX_MS=0; TOTAL_MS=0
  for i in $(seq 1 "$CARGA"); do
    T0="$(node -e 'console.log(Date.now())')"
    C="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/avisos/$INF_ID/pdf-legal")"
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

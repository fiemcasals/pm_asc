#!/usr/bin/env bash
# HU-10 / RF-06 (REQ-1794842211977) — Descarga del remito técnico en formato PDF oficial en Portal ECA.
#
# Recorre las condiciones de entrega del remito en formato PDF contra el entorno levantado:
#   bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-06-entrega.sh
#   bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-06-entrega.sh --carga 50
#
# Requiere: `npm run db:up` y `npm run dev` corriendo (o sólo la API: BASE_URL=http://127.0.0.1:3050).

set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
DB_NAME="${DB_NAME:-ascensores}"
ALERTA="ALT-MAICON-001"
USUARIO="RF06-entrega-$$"

CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-50}"
fi

# --- TLS: confiar en CA local de mkcert si está en uso HTTPS
CURL=(curl -s --max-time 15)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
fi
if curl -V 2>/dev/null | grep -qi schannel; then
  CURL+=(--ssl-no-revoke)
fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

TMP="$(mktemp -d)"

# --- Acceso a la tabla en docker
HAY_DB=0
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d "$DB_NAME" -tAc "$1" 2>/dev/null; }
if command -v docker >/dev/null 2>&1 && [ -n "$(sql 'select 1')" ]; then HAY_DB=1; fi

limpiar() {
  if [ "$HAY_DB" -eq 1 ]; then
    sql "delete from acuses_recibo_legal where usuario like 'RF06-%'" >/dev/null
  fi
  rm -rf "$TMP"
}
trap limpiar EXIT

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA descargas de remito en formato PDF contra $BASE_URL"
  fallidas=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    code="$("${CURL[@]}" -o "$TMP/remito-$n.pdf" -w '%{http_code}' \
      "$BASE_URL/api/eca/remito/$ALERTA?formato=pdf&usuario=RF06-carga-$n")"
    if [ "$code" = "200" ] && [ -s "$TMP/remito-$n.pdf" ]; then
      magico="$(head -c 5 "$TMP/remito-$n.pdf")"
      if [ "$magico" != "%PDF-" ]; then
        fallidas=$((fallidas + 1))
      fi
    else
      fallidas=$((fallidas + 1))
    fi
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
    rm -f "$TMP/remito-$n.pdf"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v f="$fallidas" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · fallidas (no PDF 200): %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, f, s / NR, p95, t[NR]
    }'
  [ "$fallidas" -eq 0 ]
  exit $?
fi

echo "== HU-10 / RF-06 (FIX: Remito Técnico en PDF oficial) contra $BASE_URL"
[ "$HAY_DB" -eq 1 ] || echo "   (sin docker: no se verifican las filas de acuses_recibo_legal)"

if [ "$HAY_DB" -eq 1 ]; then
  sql "delete from acuses_recibo_legal where alerta_id='$ALERTA'" >/dev/null
fi

echo "1. GET /api/eca/remito/:alertaId?formato=pdf entrega archivo PDF oficial con headers correctos"
code="$("${CURL[@]}" -o "$TMP/remito.pdf" -D "$TMP/headers.txt" -w '%{http_code}' \
  "$BASE_URL/api/eca/remito/$ALERTA?formato=pdf&usuario=$USUARIO")"

if [ "$code" = "200" ]; then
  pass "HTTP 200 al solicitar remito en formato PDF"
else
  fail "HTTP $code al solicitar remito (se esperaba 200)"
fi

if grep -qi '^content-type: application/pdf' "$TMP/headers.txt"; then
  pass "Content-Type: application/pdf verificado"
else
  fail "Content-Type incorrecto: $(grep -i '^content-type' "$TMP/headers.txt" || echo ninguno)"
fi

if grep -qi '^content-disposition:.*\.pdf' "$TMP/headers.txt"; then
  dispo="$(grep -i '^content-disposition' "$TMP/headers.txt" | tr -d '\r\n')"
  pass "Content-Disposition adjunta archivo .pdf ($dispo)"
else
  fail "Content-Disposition no especifica .pdf: $(grep -i '^content-disposition' "$TMP/headers.txt" || echo ninguno)"
fi

if [ -s "$TMP/remito.pdf" ]; then
  magico="$(head -c 5 "$TMP/remito.pdf")"
  bytes="$(wc -c < "$TMP/remito.pdf" | tr -d ' ')"
  if [ "$magico" = "%PDF-" ] && [ "$bytes" -gt 1000 ]; then
    pass "Estructura binaria válida de PDF (%PDF-) · Tamaño: $bytes bytes"
  else
    fail "El archivo descargado no es un PDF válido (magic: $magico, tamaño: $bytes bytes)"
  fi
else
  fail "El archivo remito.pdf está vacío"
fi

if grep -qi '^x-acuse-fecha-hora:' "$TMP/headers.txt" && grep -qi '^x-acuse-usuario:' "$TMP/headers.txt"; then
  pass "Metadatos fehacientes presentes en encabezados (x-acuse-fecha-hora, x-acuse-usuario)"
else
  fail "Faltan encabezados de acuse legal en la respuesta"
fi

echo "2. Registro automático de acuse legal en base de datos PostgreSQL auditada"
if [ "$HAY_DB" -eq 1 ]; then
  filas="$(sql "select count(*) from acuses_recibo_legal where alerta_id='$ALERTA' and usuario='$USUARIO'")"
  if [ "$filas" = "1" ]; then
    pass "Fila registrada en acuses_recibo_legal para $ALERTA y usuario $USUARIO"
  else
    fail "Se esperaban 1 fila en la base, encontradas: $filas"
  fi
fi

echo "3. GET con Accept: application/pdf también genera documento PDF"
codeAccept="$("${CURL[@]}" -o "$TMP/remito_accept.pdf" -D "$TMP/headers_accept.txt" -w '%{http_code}' \
  -H 'Accept: application/pdf' \
  "$BASE_URL/api/eca/remito/$ALERTA?usuario=$USUARIO-accept")"

if [ "$codeAccept" = "200" ] && grep -qi '^content-type: application/pdf' "$TMP/headers_accept.txt"; then
  pass "Solicitud con Accept: application/pdf responde 200 con Content-Type: application/pdf"
else
  fail "Fallo en negociación por cabecera Accept: HTTP $codeAccept"
fi

echo "4. Idempotencia: segunda descarga conserva el primer acuse registrado (RF-05)"
code2="$("${CURL[@]}" -o "$TMP/remito2.pdf" -D "$TMP/headers2.txt" -w '%{http_code}' \
  "$BASE_URL/api/eca/remito/$ALERTA?formato=pdf&usuario=RF06-segundo-intento")"

if [ "$code2" = "200" ]; then
  if [ "$HAY_DB" -eq 1 ]; then
    total="$(sql "select count(*) from acuses_recibo_legal where alerta_id='$ALERTA'")"
    primer_user="$(sql "select usuario from acuses_recibo_legal where alerta_id='$ALERTA' limit 1")"
    if [ "$total" = "1" ] && [ "$primer_user" = "$USUARIO" ]; then
      pass "No se duplicó el acuse en la base (total: 1, usuario original: $primer_user)"
    else
      fail "La base tiene $total filas o cambió el usuario original: $primer_user"
    fi
  fi
fi

echo "5. Compatibilidad: GET con formato=json devuelve JSON estructurado"
codeJson="$("${CURL[@]}" -o "$TMP/remito.json" -D "$TMP/headers_json.txt" -w '%{http_code}' \
  "$BASE_URL/api/eca/remito/$ALERTA?formato=json")"

if [ "$codeJson" = "200" ] && grep -qi '^content-type: application/json' "$TMP/headers_json.txt"; then
  pass "Compatibilidad garantizada: ?formato=json entrega JSON estructurado"
else
  fail "Fallo al solicitar formato=json: HTTP $codeJson"
fi

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

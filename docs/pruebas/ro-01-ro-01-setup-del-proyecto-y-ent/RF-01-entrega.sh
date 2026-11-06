#!/usr/bin/env bash
# RO-01 (REQ-1791560828605) — Setup del proyecto y entorno de desarrollo verificable.
#
# Recorre las 5 condiciones de aprobación contra el entorno levantado:
#   bash docs/pruebas/ro-01-ro-01-setup-del-proyecto-y-ent/RF-01-entrega.sh
#   bash docs/pruebas/ro-01-ro-01-setup-del-proyecto-y-ent/RF-01-entrega.sh --carga 200
#
# Requiere, desde la raíz del repo: `npm run db:up` y `npm run dev` corriendo.
# No crea datos de negocio: lo único que levanta (una API en modo producción en el
# puerto 3051, para la condición 3) lo apaga al terminar.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
SCRUM_ORIGIN="${SCRUM_ORIGIN:-https://scrum.nuestrocamino.cloud}"
OTRO_ORIGIN="https://sitio-ajeno.example"
PROD_PORT=3051
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-100}"
fi

# --- TLS: confiar en el CA local de mkcert (y en Windows/Schannel, no consultar revocación)
CURL=(curl -s --max-time 10)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
fi
if curl -V | grep -qi schannel; then
  CURL+=(--ssl-no-revoke)
fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

header() { # header <archivo-de-encabezados> <nombre> → valor (sin \r)
  grep -i "^$2:" "$1" | head -1 | cut -d' ' -f2- | tr -d '\r'
}

TMP="$(mktemp -d)"
PROD_PID=""
limpiar() {
  [ -n "$PROD_PID" ] && kill "$PROD_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap limpiar EXIT

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA corridas de GET $BASE_URL/api/health con Origin de Scrum"
  fallidas=0
  : > "$TMP/tiempos"
  for _ in $(seq 1 "$CARGA"); do
    out="$("${CURL[@]}" -o /dev/null -w '%{http_code} %{time_total}' -H "Origin: $SCRUM_ORIGIN" "$BASE_URL/api/health")"
    code="${out%% *}"
    echo "${out##* }" >> "$TMP/tiempos"
    [ "$code" = "200" ] || fallidas=$((fallidas + 1))
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v f="$fallidas" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · fallidas: %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, f, s / NR * 1000, p95 * 1000, t[NR] * 1000
    }'
  [ "$fallidas" -eq 0 ]
  exit $?
fi

echo "== RO-01 contra $BASE_URL"

echo "1. GET /api/health responde 200 con el estado de la API y de la base"
code="$("${CURL[@]}" -o "$TMP/health.json" -w '%{http_code}' "$BASE_URL/api/health")"
body="$(cat "$TMP/health.json" 2>/dev/null)"
if [ "$code" = "200" ] && echo "$body" | grep -q '"api":"ok"' && echo "$body" | grep -q '"db":{"status":"ok"'; then
  pass "HTTP $code · $body"
else
  fail "HTTP $code · ${body:-sin cuerpo} (¿está corriendo npm run dev y npm run db:up?)"
fi

echo "2. CORS: sólo el origen de Scrum recibe Access-Control-Allow-Origin"
"${CURL[@]}" -o /dev/null -D "$TMP/h-scrum" -H "Origin: $SCRUM_ORIGIN" "$BASE_URL/api/health"
acao="$(header "$TMP/h-scrum" access-control-allow-origin)"
[ "$acao" = "$SCRUM_ORIGIN" ] && pass "Origin $SCRUM_ORIGIN → ACAO: $acao" || fail "Origin $SCRUM_ORIGIN → ACAO: '${acao}'"

"${CURL[@]}" -o /dev/null -D "$TMP/h-otro" -H "Origin: $OTRO_ORIGIN" "$BASE_URL/api/health"
acao="$(header "$TMP/h-otro" access-control-allow-origin)"
[ -z "$acao" ] && pass "Origin $OTRO_ORIGIN → sin ACAO" || fail "Origin $OTRO_ORIGIN → ACAO inesperado: $acao"

pre="$("${CURL[@]}" -o /dev/null -D "$TMP/h-pre" -w '%{http_code}' -X OPTIONS \
  -H "Origin: $SCRUM_ORIGIN" -H 'Access-Control-Request-Method: GET' "$BASE_URL/api/health")"
acao="$(header "$TMP/h-pre" access-control-allow-origin)"
[ "$pre" = "204" ] && [ "$acao" = "$SCRUM_ORIGIN" ] && pass "Preflight OPTIONS → $pre con ACAO" || fail "Preflight OPTIONS → $pre, ACAO '${acao}'"

echo "3. En producción la API no devuelve encabezados CORS"
if [ ! -f "$REPO_ROOT/apps/api/dist/main.js" ]; then
  (cd "$REPO_ROOT" && npm run build -w apps/api >/dev/null 2>&1)
fi
(cd "$REPO_ROOT/apps/api" && NODE_ENV=production API_PORT=$PROD_PORT CORS_ORIGINS="$SCRUM_ORIGIN" \
  node dist/main.js > "$TMP/prod.log" 2>&1) &
PROD_PID=$!
for _ in $(seq 1 40); do grep -q "escuchando" "$TMP/prod.log" 2>/dev/null && break; sleep 0.25; done
curl -s --max-time 5 -o /dev/null -D "$TMP/h-prod" -H "Origin: $SCRUM_ORIGIN" "http://127.0.0.1:$PROD_PORT/api/health"
if grep -q '^HTTP' "$TMP/h-prod" 2>/dev/null; then
  cors_prod="$(grep -ic '^access-control-' "$TMP/h-prod")"
  [ "$cors_prod" -eq 0 ] && pass "NODE_ENV=production con CORS_ORIGINS cargado → 0 encabezados Access-Control-*" \
    || fail "NODE_ENV=production devolvió $cors_prod encabezados Access-Control-*"
else
  fail "No arrancó la API en modo producción (ver $TMP/prod.log)"
fi
# La API de producción se lanza en un subshell: matamos al proceso node que escucha en el puerto.
if command -v taskkill >/dev/null 2>&1; then
  pid="$(netstat -ano 2>/dev/null | grep -E "127.0.0.1:$PROD_PORT .*LISTENING" | awk '{print $NF}' | head -1)"
  [ -n "$pid" ] && taskkill //PID "$pid" //F >/dev/null 2>&1
else
  pkill -f "API_PORT=$PROD_PORT" 2>/dev/null; fuser -k "$PROD_PORT/tcp" 2>/dev/null
fi

echo "4. PostgreSQL + PostGIS levantado y /api/health informa la versión de PostGIS"
postgis="$(echo "$body" | sed -n 's/.*"postgis":"\([^"]*\)".*/\1/p')"
[ -n "$postgis" ] && pass "PostGIS $postgis" || fail "/api/health no informa versión de PostGIS"

echo "5. La app web carga y expone lo necesario para el service worker"
code="$("${CURL[@]}" -o "$TMP/index.html" -w '%{http_code}' "$BASE_URL/")"
grep -q 'Inspecciones de Ascensores' "$TMP/index.html" && [ "$code" = "200" ] \
  && pass "GET / → $code con el título de la app" || fail "GET / → $code"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/manifest.webmanifest")"
[ "$code" = "200" ] && pass "manifest.webmanifest → $code" || fail "manifest.webmanifest → $code"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/dev-sw.js?dev-sw")"
[ "$code" = "200" ] && pass "service worker (dev-sw.js) → $code" || fail "service worker → $code"
echo "     (el registro efectivo en el navegador se verifica en la guía RF-01-setup-entorno.md, paso 2)"

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

#!/usr/bin/env bash
# HU-07 / RF-03 (REQ-1794013110546) — Persistir las visitas fallidas en PostgreSQL.
#
# Recorre los criterios 1, 2 (secuencia acumulada) y 3 (rechazo de texto inválido por PostgreSQL):
#   bash docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-03-entrega.sh
#   bash docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-03-entrega.sh --carga 100
#
# Requiere, desde la raíz del repo: `npm run db:up` y `npm run dev` corriendo (o sólo la API:
# BASE_URL=http://127.0.0.1:3050).
# La tabla `visitas_fallidas` se verifica con `docker exec mant-asc-db psql` si docker está disponible.
#
# El reinicio real de la API (criterio 2) y el apagado de la base (`docker stop mant-asc-db`,
# criterio 3) se prueban manualmente como se describe en RF-03-entrega.md §4.5.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
DB_NAME="${DB_NAME:-ascensores}"
PREFIJO="RF03-entrega-$$"

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

TMP="$(mktemp -d)"

# --- Acceso a la tabla (opcional: sólo con docker)
HAY_DB=0
sql() { MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql -U ascensores -d "$DB_NAME" -tAc "$1" 2>/dev/null | tr -d '\r'; }
if command -v docker >/dev/null 2>&1 && [ -n "$(sql 'select 1')" ]; then HAY_DB=1; fi

limpiar() {
  [ "$HAY_DB" -eq 1 ] && sql "delete from visitas_fallidas where consorcio_id like 'RF03-entrega-%'" >/dev/null
  rm -rf "$TMP"
}
trap limpiar EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA visitas fallidas persistidas en PostgreSQL contra $BASE_URL"
  fallidas=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    cid="${PREFIJO}-carga-$n"
    inicio="$(date +%s%N)"
    code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d "{\"consorcioId\":\"$cid\",\"motivo\":\"Carga #$n\",\"fotoFrenteUrl\":\"https://storage.maicon.com.ar/f$n.jpg\",\"gps\":{\"latitud\":-34.6037,\"longitud\":-58.3816}}" \
      "$BASE_URL/api/visitas-fallidas")"
    [ "$code" = "201" ] || fallidas=$((fallidas + 1))
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v f="$fallidas" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · fallidas (no 201): %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, f, s / NR, p95, t[NR]
    }'
  if [ "$HAY_DB" -eq 1 ]; then
    echo "  filas guardadas en visitas_fallidas: $(sql "select count(*) from visitas_fallidas where consorcio_id like '${PREFIJO}-carga-%'") de $CARGA"
  fi
  [ "$fallidas" -eq 0 ]
  exit $?
fi

echo "== HU-07 / RF-03 contra $BASE_URL"
[ "$HAY_DB" -eq 1 ] || echo "   (sin docker: no se verifican las filas de visitas_fallidas directo en psql)"

CID="${PREFIJO}-edif"

echo "1. Registrar visita fallida (Advertencia 1) y verificar fila completa en PostgreSQL"
code="$("${CURL[@]}" -o "$TMP/v1.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"consorcioId\":\"$CID\",\"motivo\":\"Encargado ausente\",\"fotoFrenteUrl\":\"https://storage.maicon.com.ar/f1.jpg\",\"gps\":{\"latitud\":-34.6037,\"longitud\":-58.3816,\"precision\":4.2},\"inspector\":\"Inspector Prueba\",\"emailAdministracion\":\"admin@rf03.test\"}" \
  "$BASE_URL/api/visitas-fallidas")"
id1="$(json "$TMP/v1.json" 'b.id')"
adv1="$(json "$TMP/v1.json" 'b.numeroAdvertencia')"
if [ "$code" = "201" ] && [ "$adv1" = "1" ] && [ -n "$id1" ]; then
  pass "HTTP $code · Advertencia $adv1 registrada ($id1)"
else
  fail "HTTP $code · id='$id1' adv='$adv1' (¿están corriendo npm run db:up y la API?)"
fi

if [ "$HAY_DB" -eq 1 ] && [ -n "$id1" ]; then
  fila="$(sql "select numero_advertencia||'|'||motivo||'|'||inspector||'|'||(email_notificacion->>'destinatario') from visitas_fallidas where id='$id1'")"
  if [ "$fila" = "1|Encargado ausente|Inspector Prueba|admin@rf03.test" ]; then
    pass "visitas_fallidas tiene la fila completa: $fila"
  else
    fail "visitas_fallidas devolvió '$fila' en vez de los datos completos"
  fi
fi

echo "2. Acumular Advertencia 2 y 3, verificando consulta de historial y bloqueo con recargo 45%"
code2="$("${CURL[@]}" -o "$TMP/v2.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"consorcioId\":\"$CID\",\"motivo\":\"Segunda ausencia\",\"fotoFrenteUrl\":\"https://storage.maicon.com.ar/f2.jpg\",\"gps\":{\"latitud\":-34.6038,\"longitud\":-58.3817}}" \
  "$BASE_URL/api/visitas-fallidas")"
code3="$("${CURL[@]}" -o "$TMP/v3.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"consorcioId\":\"$CID\",\"motivo\":\"Tercera ausencia\",\"fotoFrenteUrl\":\"https://storage.maicon.com.ar/f3.jpg\",\"gps\":{\"latitud\":-34.6039,\"longitud\":-58.3818}}" \
  "$BASE_URL/api/visitas-fallidas")"
"${CURL[@]}" -o "$TMP/hist.json" "$BASE_URL/api/visitas-fallidas/consorcio/$CID"
"${CURL[@]}" -o "$TMP/bloq.json" "$BASE_URL/api/visitas-fallidas/consorcio/$CID/bloqueo"
total="$(json "$TMP/hist.json" 'b.totalAdvertencias')"
bloqueado="$(json "$TMP/bloq.json" 'b.bloqueado')"
recargo="$(json "$TMP/bloq.json" 'b.porcentajeRecargo')"
if [ "$code2" = "201" ] && [ "$code3" = "201" ] && [ "$total" = "3" ] && [ "$bloqueado" = "true" ] && [ "$recargo" = "45" ]; then
  pass "Historial acumula 3 advertencias (2→3) · bloqueado: $bloqueado · recargo: ${recargo}%"
else
  fail "code2=$code2 code3=$code3 total=$total bloqueado=$bloqueado recargo=$recargo"
fi

echo "3. Rechazo desde PostgreSQL (carácter NUL → 400 sin guardar filas)"
CID_NUL="${PREFIJO}-nul"
filas_antes=0; [ "$HAY_DB" -eq 1 ] && filas_antes="$(sql "select count(*) from visitas_fallidas")"
printf '%s' "{\"consorcioId\":\"$CID_NUL\",\"motivo\":\"Motivo con \u0000 nulo\",\"fotoFrenteUrl\":\"https://storage.maicon.com.ar/fn.jpg\",\"gps\":{\"latitud\":-34.6,\"longitud\":-58.38}}" > "$TMP/nul.json"
code_nul="$("${CURL[@]}" -o "$TMP/nul-resp.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  --data-binary @"$TMP/nul.json" "$BASE_URL/api/visitas-fallidas")"
msg_nul="$(json "$TMP/nul-resp.json" 'b.message')"
filas_despues=0; [ "$HAY_DB" -eq 1 ] && filas_despues="$(sql "select count(*) from visitas_fallidas")"
if [ "$code_nul" = "400" ] && [ "$msg_nul" = "Datos inválidos" ] && [ "$filas_antes" = "$filas_despues" ]; then
  pass "HTTP $code_nul · message \"$msg_nul\" · filas intactas ($filas_antes → $filas_despues)"
else
  fail "HTTP $code_nul · message '$msg_nul' · filas $filas_antes → $filas_despues"
fi

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

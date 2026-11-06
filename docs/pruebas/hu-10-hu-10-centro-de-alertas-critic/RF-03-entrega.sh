#!/usr/bin/env bash
# HU-10 / RF-03 (REQ-1793980587652) — Registrar el acuse de recibo legal sólo si quedó guardado.
#
# Recorre las condiciones 2, 3 y 4 (la parte del NUL y del remito) contra el entorno levantado:
#   bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-03-entrega.sh
#   bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-03-entrega.sh --carga 100
#
# Requiere, desde la raíz del repo: `npm run db:up` y `npm run dev` corriendo (o sólo la API:
# BASE_URL=http://127.0.0.1:3050 si no levantaste la web).
#
# La fila en `acuses_recibo_legal` se verifica con `docker exec mant-asc-db psql …` si docker
# está disponible; si no, el script lo avisa y no cuenta ese paso (la API no expone esa tabla).
#
# NO cubre, porque necesita apagar la base (ver el documento de entrega, §4.5):
#   - condición 1: POST del acuse con la base caída → 500;
#   - condición 4: GET del remito con la base caída → 500.
#
# Datos que deja: filas de acuse con usuario "RF03-entrega-<pid>…", que se borran al terminar
# (si hay docker). El acuse en memoria de ALT-CP-001 dura hasta reiniciar la API.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
DB_NAME="${DB_NAME:-ascensores}"
ALERTA_OK="ALT-CP-001"        # Conservación Porteña: recibe el acuse válido
ALERTA_NUL="ALT-MAICON-002"   # MAICON: el acuse con NUL tiene que rechazarse
USUARIO="RF03-entrega-$$"

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
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d "$DB_NAME" -tAc "$1" 2>/dev/null; }
if command -v docker >/dev/null 2>&1 && [ -n "$(sql 'select 1')" ]; then HAY_DB=1; fi

limpiar() {
  [ "$HAY_DB" -eq 1 ] && sql "delete from acuses_recibo_legal where usuario like 'RF03-entrega-%'" >/dev/null
  rm -rf "$TMP"
}
trap limpiar EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }
# acuse_de <ECA|""> <alertaId> → el acuseRecibo que la API informa (JSON) o "null".
# ECA vacía = la ECA por defecto de la API (Conservación Porteña). Se evita pasar "porteña" en
# la URL: la ñ sin codificar la rechaza el cliente HTTP con un 400.
acuse_de() {
  "${CURL[@]}" -o "$TMP/alertas" "$BASE_URL/api/eca/alertas${1:+?eca=$1}"
  json "$TMP/alertas" "(b.alertas.find(a=>a.alerta.id==='$2')||{alerta:{}}).alerta.acuseRecibo||null"
}

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA acuses válidos (POST /api/eca/alertas/$ALERTA_OK/acuse) contra $BASE_URL"
  fallidas=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d "{\"usuario\":\"$USUARIO-$n\"}" "$BASE_URL/api/eca/alertas/$ALERTA_OK/acuse")"
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
    echo "  filas guardadas con ese usuario: $(sql "select count(*) from acuses_recibo_legal where usuario like '$USUARIO-%'") de $CARGA"
  fi
  [ "$fallidas" -eq 0 ]
  exit $?
fi

echo "== HU-10 / RF-03 contra $BASE_URL"
[ "$HAY_DB" -eq 1 ] || echo "   (sin docker: no se verifican las filas de acuses_recibo_legal)"

echo "3. Con la base sana, el acuse válido responde 201, queda guardado y la alerta lo muestra"
filas_antes=0; [ "$HAY_DB" -eq 1 ] && filas_antes="$(sql "select count(*) from acuses_recibo_legal")"
code="$("${CURL[@]}" -o "$TMP/ok.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"usuario\":\"$USUARIO\"}" "$BASE_URL/api/eca/alertas/$ALERTA_OK/acuse")"
ok="$(json "$TMP/ok.json" 'b.ok')"
visto="$(acuse_de "" "$ALERTA_OK")"
if [ "$code" = "201" ] && [ "$ok" = "true" ] && echo "$visto" | grep -q "\"usuario\":\"$USUARIO\""; then
  pass "HTTP $code · ok: $ok · GET /api/eca/alertas muestra el acuse de $USUARIO"
else
  fail "HTTP $code · ok: '$ok' · la alerta muestra: $visto (¿están corriendo npm run db:up y npm run dev?)"
fi
if [ "$HAY_DB" -eq 1 ]; then
  fila="$(sql "select count(*)||' fila: '||coalesce(string_agg(alerta_id||' / '||usuario,''),'') from acuses_recibo_legal where usuario='$USUARIO'")"
  [ "$fila" = "1 fila: $ALERTA_OK / $USUARIO" ] && pass "acuses_recibo_legal tiene $fila" || fail "acuses_recibo_legal: '$fila' (se esperaba 1 fila: $ALERTA_OK / $USUARIO)"
fi

echo "2. Un carácter NUL en usuario → 400, nada nuevo en la base y la alerta no cambia"
antes_acuse="$(acuse_de "maicon" "$ALERTA_NUL")"
total_antes=0; [ "$HAY_DB" -eq 1 ] && total_antes="$(sql "select count(*) from acuses_recibo_legal")"
printf '%s' '{"usuario":"RF03-entrega-con \u0000 nulo"}' > "$TMP/nul.json"
code="$("${CURL[@]}" -o "$TMP/nul-resp.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  --data-binary @"$TMP/nul.json" "$BASE_URL/api/eca/alertas/$ALERTA_NUL/acuse")"
msg="$(json "$TMP/nul-resp.json" 'b.message')"
despues_acuse="$(acuse_de "maicon" "$ALERTA_NUL")"
total_despues=0; [ "$HAY_DB" -eq 1 ] && total_despues="$(sql "select count(*) from acuses_recibo_legal")"
if [ "$code" = "400" ] && [ "$msg" = "Datos inválidos" ] && [ "$antes_acuse" = "$despues_acuse" ] && [ "$total_antes" = "$total_despues" ]; then
  pass "HTTP $code · message \"$msg\" · acuse de $ALERTA_NUL antes y después: $despues_acuse · filas $total_antes → $total_despues"
else
  fail "HTTP $code · message '$msg' · acuse $antes_acuse → $despues_acuse · filas $total_antes → $total_despues (se esperaba 400, \"Datos inválidos\" y nada cambiado)"
fi
if grep -qiE 'byte sequence|0x00|UTF8|22021|severity|stack' "$TMP/nul-resp.json"; then
  fail "la respuesta 400 filtra el error de PostgreSQL: $(cat "$TMP/nul-resp.json")"
else
  pass "la respuesta 400 no menciona el error de PostgreSQL"
fi

echo "4. El remito con un NUL en usuario no se entrega y no deja acuse (mismo camino)"
code="$("${CURL[@]}" -o "$TMP/remito.json" -D "$TMP/remito-h" -w '%{http_code}' \
  "$BASE_URL/api/eca/remito/$ALERTA_NUL?usuario=RF03-entrega-con%00nulo")"
if [ "$code" = "400" ] && ! grep -qi '^content-disposition' "$TMP/remito-h" && [ "$(acuse_de "maicon" "$ALERTA_NUL")" = "$antes_acuse" ]; then
  pass "HTTP $code · sin encabezado content-disposition (no se entrega el archivo) · la alerta no cambió"
else
  fail "HTTP $code · content-disposition: $(grep -i '^content-disposition' "$TMP/remito-h" || echo ninguno)"
fi

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

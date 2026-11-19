#!/usr/bin/env bash
# HU-11 / RF-03 (REQ-1794155773535) — No informar como entregado un WhatsApp que no se envió.
#
# Recorre los criterios 1 y 3 contra la API levantada sin proveedor de WhatsApp configurado (el 3 necesita además los datos de demo:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh):
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-03-entrega.sh
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-03-entrega.sh --carga 50
#
# Requiere, desde la raíz del repo: `npm run dev` corriendo (o BASE_URL=http://127.0.0.1:3050).
# Nota: el criterio 2 (botón "Despachar Alerta WhatsApp" en Portal ECA) es visual y se valida en
# el navegador o mirando RF-03-portal-eca-no-configurado.png.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-50}"
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

DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
TMP="$(mktemp -d)"
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
limpiar() { sql "delete from usuarios where usuario='demo.rt.disparo'" >/dev/null 2>&1; rm -rf "$TMP"; }
trap limpiar EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }

PAYLOAD='{"telefonoDestino":"+5491155667788","nombreEca":"MAICON Mantenimiento","consorcio":"Consorcio Corrientes 1234","equipo":"M1: Ascensor Principal","estado":"Reparación Urgente","detalle":"Freno electromagnético con deslizamiento"}'

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA intentos sin proveedor contra $BASE_URL"
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    code="$("${CURL[@]}" -o "$TMP/c.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d "$PAYLOAD" "$BASE_URL/api/whatsapp/enviar-alerta")"
    estado="$(json "$TMP/c.json" 'b.estadoEntrega')"
    if [ "$code" != "503" ] || [ "$estado" = "entregado" ]; then
      errores=$((errores + 1))
    fi
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v e="$errores" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · falsos entregados / distinto de 503: %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, e, s / NR, p95, t[NR]
    }'
  [ "$errores" -eq 0 ]
  exit $?
fi

echo "== HU-11 / RF-03 contra $BASE_URL"

echo "1. Envío manual sin proveedor → HTTP 503, informa motivo y no devuelve 'entregado'"
code1="$("${CURL[@]}" -o "$TMP/env.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "$PAYLOAD" "$BASE_URL/api/whatsapp/enviar-alerta")"
ok1="$(json "$TMP/env.json" 'b.ok')"
estado1="$(json "$TMP/env.json" 'b.estadoEntrega')"
msg1="$(json "$TMP/env.json" 'b.message')"
if [ "$code1" = "503" ] && [ "$ok1" = "false" ] && [ "$estado1" = "no_configurado" ] && echo "$msg1" | grep -qi 'no est.*configurado'; then
  pass "HTTP $code1 · ok: $ok1 · estadoEntrega: $estado1 · \"$msg1\""
else
  fail "HTTP $code1 · ok='$ok1' · estadoEntrega='$estado1' · message='$msg1'"
fi

echo "3. Una falla crítica no sale sola: pendiente de revisión → 409 y sin envíos; aprobada por la Secretaría → el envío queda «no realizado», nunca «entregado»"
# Ingresar con un usuario que no existe suma intentos fallidos y a los 5 bloquea la cuenta 15 minutos: antes se revisa que estén los datos de demo.
[ "$(docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "select count(*) from usuarios where usuario = 'demo.secretaria'" 2>/dev/null | tr -d '\r')" = "1" ] || { echo "  ❌ faltan los datos de demo (o no hay docker): corré antes bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh"; exit 2; }
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "delete from usuarios where usuario='demo.rt.disparo'" >/dev/null
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('demo.rt.disparo','demo.rt.disparo','rt_calle','$HASH')" >/dev/null
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; "${CURL[@]}" -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
SEC="$(login demo.secretaria)"; RT="$(login demo.rt.disparo)"
{ [ -n "$SEC" ] && [ -n "$RT" ]; } || { fail "no pude ingresar como demo.secretaria y demo.rt.disparo"; exit 1; }

# Sólo el RT registra el informe y el inspector es el usuario de la sesión (HU-06 RF-06).
codeI="$("${CURL[@]}" -o "$TMP/inf.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' \
  -d '{"maquinaId":"MAQ-CORRIENTES-M1","fallasCriticas":["BOTON_PARE_FALLA"]}' "$BASE_URL/api/fallas-criticas/informes")"
ALERTA="$(json "$TMP/inf.json" 'b.informe.id')"
if [ "$codeI" = "201" ] && [ -n "$ALERTA" ]; then pass "falla crítica registrada por un RT ($ALERTA)"; else fail "informe → HTTP $codeI $(head -c 200 "$TMP/inf.json")"; exit 1; fi

code3="$("${CURL[@]}" -o "$TMP/trig.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"alertaId\":\"$ALERTA\",\"telefonoDestino\":\"+5491199887766\"}" "$BASE_URL/api/whatsapp/trigger-alerta-critica")"
if [ "$code3" = "409" ] && grep -q "pendiente de revisión" "$TMP/trig.json"; then
  pass "Disparo sobre el aviso pendiente → HTTP $code3 «pendiente de revisión»: la Secretaría tiene que aprobarlo antes"
else
  fail "Disparo sobre el aviso pendiente → HTTP $code3 $(head -c 200 "$TMP/trig.json")"
fi

echo "   Verificando que no salió nada: GET /api/whatsapp/historial?alertaId=$ALERTA"
"${CURL[@]}" -o "$TMP/hist0.json" "$BASE_URL/api/whatsapp/historial?alertaId=$ALERTA"
total0="$(json "$TMP/hist0.json" 'b.total')"
if [ "$total0" = "0" ]; then pass "Historial sin envíos antes de la aprobación (total=$total0)"; else fail "Historial con envíos sin aprobación (total='$total0')"; fi

code4="$("${CURL[@]}" -o "$TMP/apr.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $SEC" -H 'Content-Type: application/json' \
  -d '{}' "$BASE_URL/api/avisos/$ALERTA/aprobar")"
if [ "$code4" = "201" ]; then pass "La Secretaría aprueba el aviso → HTTP $code4"; else fail "Aprobar → HTTP $code4 $(head -c 200 "$TMP/apr.json")"; fi

echo "   Verificando el registro: GET /api/whatsapp/historial?alertaId=$ALERTA"
"${CURL[@]}" -o "$TMP/hist1.json" "$BASE_URL/api/whatsapp/historial?alertaId=$ALERTA"
total1="$(json "$TMP/hist1.json" 'b.total')"
sinSalir="$(json "$TMP/hist1.json" 'b.registros.length>0&&b.registros.every(r=>r.estado==="no_realizado"&&r.estadoEntrega==="no_configurado")')"
entregados="$(json "$TMP/hist1.json" 'b.registros.filter(r=>r.estadoEntrega==="entregado"||r.estado==="entregado").length')"
if [ "$total1" -ge 1 ] 2>/dev/null && [ "$sinSalir" = "true" ] && [ "$entregados" = "0" ]; then
  pass "Historial tras aprobar: $total1 registros, todos «no_realizado» / «no_configurado»; ninguno informado como entregado"
else
  fail "Historial tras aprobar: total='$total1' · todos no realizados='$sinSalir' · entregados='$entregados'"
fi

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

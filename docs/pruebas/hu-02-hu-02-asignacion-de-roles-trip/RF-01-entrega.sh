#!/usr/bin/env bash
# HU-02 / RF-01 (REQ-1791910395002) — API de Asignación Tripartita de Roles por Edificio.
#
# Recorre las 2 condiciones de aprobación contra el entorno levantado:
#   bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-01-entrega.sh
#   bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-01-entrega.sh --carga 200
#
# Requiere, desde la raíz del repo: `npm run db:up` y `npm run dev` corriendo (o sólo la API:
# BASE_URL=http://127.0.0.1:3050 si no levantaste la web).
# Cada recorrido crea su consorcio ("HU02-RF01-entrega-<pid>-<n>") y lo borra al terminar,
# también si algo falla: no deja filas en la base.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"

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
ID=""
limpiar() {
  [ -n "$ID" ] && "${CURL[@]}" -o /dev/null -X DELETE "$BASE_URL/api/consorcios/$ID"
  rm -rf "$TMP"
}
trap limpiar EXIT

# json <archivo> <expresión JS sobre "b"> → imprime el valor (sin depender de jq)
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":v)' "$1" "$2" 2>/dev/null; }

crear_consorcio() { # crear_consorcio <nombre> → deja el id en ID
  printf '{"nombre":"%s","direccion":"Av. Rivadavia 1234, CABA","maquinas":[{"referenciaAgc":"M1"}]}' "$1" > "$TMP/consorcio.json"
  local code
  code="$("${CURL[@]}" -o "$TMP/c.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$TMP/consorcio.json" "$BASE_URL/api/consorcios")"
  ID=""
  [ "$code" = "201" ] && ID="$(json "$TMP/c.json" 'b.id')"
  [ -n "$ID" ]
}

borrar_consorcio() {
  "${CURL[@]}" -o /dev/null -X DELETE "$BASE_URL/api/consorcios/$ID"
  ID=""
}

cat > "$TMP/terna.json" <<'JSON'
{
  "rtCalle": { "nombre": "Laura Gómez", "telefono": "11 4000-1000", "email": "laura@maicon.test" },
  "firmante": { "nombre": "Ing. Pablo Ruiz", "telefono": "11 4000-2000" },
  "eca": { "nombre": "Conservación Porteña S.R.L.", "email": "contacto@portena.test" }
}
JSON

put_roles() { # put_roles <archivo> → imprime el código HTTP, deja la respuesta en $TMP/r.json
  "${CURL[@]}" -o "$TMP/r.json" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' \
    --data-binary @"$1" "$BASE_URL/api/consorcios/$ID/roles"
}

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA recorridos (POST + PUT roles + GET roles + DELETE) contra $BASE_URL"
  fallidas=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    if crear_consorcio "HU02-RF01-entrega-$$-$n"; then
      p="$(put_roles "$TMP/terna.json")"
      g="$("${CURL[@]}" -o "$TMP/g.json" -w '%{http_code}' "$BASE_URL/api/consorcios/$ID/roles")"
      if [ "$p" != "200" ] || [ "$g" != "200" ] || [ "$(json "$TMP/g.json" 'b.rtCalle.porcentaje')" != "60" ]; then
        fallidas=$((fallidas + 1))
      fi
      borrar_consorcio
    else
      fallidas=$((fallidas + 1))
    fi
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v f="$fallidas" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · fallidas: %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, f, s / NR, p95, t[NR]
    }'
  [ "$fallidas" -eq 0 ]
  exit $?
fi

echo "== HU-02 / RF-01 contra $BASE_URL"

if ! crear_consorcio "HU02-RF01-entrega-$$"; then
  fail "No se pudo crear el consorcio de prueba: ¿están levantadas la base y la API?"
  exit 1
fi
pass "Consorcio de prueba creado ($ID)"

echo "-- Condición 1: PUT guarda y valida la terna"
code="$(put_roles "$TMP/terna.json")"
[ "$code" = "200" ] && pass "PUT con la terna completa → HTTP $code" || fail "PUT → HTTP $code (se esperaba 200)"

printf '{"rtCalle":{"nombre":""},"eca":{"nombre":"ECA","email":"no-es-email"}}' > "$TMP/mala.json"
code="$(put_roles "$TMP/mala.json")"
if [ "$code" = "400" ] && [ "$(json "$TMP/r.json" 'b.errores.length')" = "4" ]; then
  pass "PUT con terna inválida → HTTP 400 con 4 errores"
else
  fail "PUT inválido → HTTP $code, respuesta: $(cat "$TMP/r.json")"
fi

code="$("${CURL[@]}" -o "$TMP/r.json" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' \
  --data-binary @"$TMP/terna.json" "$BASE_URL/api/consorcios/00000000-0000-4000-8000-000000000000/roles")"
[ "$code" = "404" ] && pass "PUT sobre un consorcio inexistente → HTTP 404" || fail "PUT inexistente → HTTP $code (se esperaba 404)"

echo "-- Condición 2: GET devuelve porcentajes y contacto"
code="$("${CURL[@]}" -o "$TMP/g.json" -w '%{http_code}' "$BASE_URL/api/consorcios/$ID/roles")"
[ "$code" = "200" ] && pass "GET roles → HTTP $code" || fail "GET roles → HTTP $code (se esperaba 200)"

valor="$(json "$TMP/g.json" '[b.rtCalle.porcentaje,b.firmante.porcentaje,b.eca.porcentaje].join("/")')"
[ "$valor" = "60/25/" ] && pass "Porcentajes RT 60, Firmante 25, ECA sin definir" || fail "Porcentajes: $valor"

valor="$(json "$TMP/g.json" '[b.rtCalle.email,b.firmante.telefono,b.eca.email].join(" | ")')"
if [ "$valor" = "laura@maicon.test | 11 4000-2000 | contacto@portena.test" ]; then
  pass "Datos de contacto de los tres responsables"
else
  fail "Contacto: $valor"
fi

echo "-- Limpieza"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X DELETE "$BASE_URL/api/consorcios/$ID")"
if [ "$code" = "204" ]; then
  code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios/$ID/roles")"
  [ "$code" = "404" ] && pass "Borrar el consorcio borra su terna (GET → 404)" || fail "GET tras borrar → HTTP $code"
  ID=""
else
  fail "DELETE → HTTP $code (se esperaba 204)"
fi

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

#!/usr/bin/env bash
# HU-02 / RF-02 (REQ-1791910395101) — UI de Secretaría: Pestaña de Asignación de Roles de Trabajo.
#
# Recorre contra el entorno levantado las llamadas que hace la pestaña:
#   bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-02-entrega.sh
#   bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-02-entrega.sh --carga 200
#
# Requiere, desde la raíz del repo: `npm run db:up` y `npm run dev` corriendo.
# Lo que se ve en pantalla (selectores y confirmación) se comprueba con la guía
# RF-02-asignacion-de-roles.md. Cada recorrido crea dos consorcios y los borra al terminar,
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
UNO=""
DOS=""
borrar() { # borrar <id>
  [ -n "$1" ] && "${CURL[@]}" -o /dev/null -X DELETE "$BASE_URL/api/consorcios/$1"
}
limpiar() {
  borrar "$UNO"
  borrar "$DOS"
  rm -rf "$TMP"
}
trap limpiar EXIT

# json <archivo> <expresión JS sobre "b"> → imprime el valor (sin depender de jq)
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":v)' "$1" "$2" 2>/dev/null; }

crear_consorcio() { # crear_consorcio <nombre> → imprime el id
  printf '{"nombre":"%s","direccion":"Av. Rivadavia 1234, CABA","maquinas":[{"referenciaAgc":"M1"}]}' "$1" > "$TMP/consorcio.json"
  local code
  code="$("${CURL[@]}" -o "$TMP/c.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$TMP/consorcio.json" "$BASE_URL/api/consorcios")"
  [ "$code" = "201" ] && json "$TMP/c.json" 'b.id'
}

put_roles() { # put_roles <id> <archivo> → imprime el código HTTP, deja la respuesta en $TMP/r.json
  "${CURL[@]}" -o "$TMP/r.json" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' \
    --data-binary @"$2" "$BASE_URL/api/consorcios/$1/roles"
}

get_roles() { # get_roles <id> → imprime el código HTTP, deja la respuesta en $TMP/g.json
  "${CURL[@]}" -o "$TMP/g.json" -w '%{http_code}' "$BASE_URL/api/consorcios/$1/roles"
}

cat > "$TMP/terna.json" <<'JSON'
{
  "rtCalle": { "nombre": "Laura Gómez", "telefono": "11 4000-1000", "email": null },
  "firmante": { "nombre": "Ing. Pablo Ruiz", "telefono": null, "email": "pablo@maicon.test" },
  "eca": { "nombre": "Conservación Porteña S.R.L.", "telefono": null, "email": "contacto@portena.test" }
}
JSON

cat > "$TMP/cambio.json" <<'JSON'
{
  "rtCalle": { "nombre": "Laura Gómez", "telefono": "11 4000-1000", "email": null },
  "firmante": { "nombre": "Ing. Pablo Ruiz", "telefono": null, "email": "pablo@maicon.test" },
  "eca": { "nombre": "Ascensores del Sur S.A.", "telefono": null, "email": "guardia@sur.test" }
}
JSON

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA recorridos (2 POST + 2 GET roles + 2 PUT roles + 2 DELETE) contra $BASE_URL"
  fallidas=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    UNO="$(crear_consorcio "HU02-RF02-entrega-$$-$n-a")"
    DOS="$(crear_consorcio "HU02-RF02-entrega-$$-$n-b")"
    if [ -n "$UNO" ] && [ -n "$DOS" ]; then
      a="$(get_roles "$UNO")"
      b="$(put_roles "$UNO" "$TMP/terna.json")"
      c="$(put_roles "$UNO" "$TMP/cambio.json")"
      d="$(get_roles "$UNO")"
      if [ "$a$b$c$d" != "200200200200" ] || [ "$(json "$TMP/g.json" 'b.eca.nombre')" != "Ascensores del Sur S.A." ]; then
        fallidas=$((fallidas + 1))
      fi
    else
      fallidas=$((fallidas + 1))
    fi
    borrar "$UNO"; UNO=""
    borrar "$DOS"; DOS=""
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

echo "== HU-02 / RF-02 contra $BASE_URL"

UNO="$(crear_consorcio "HU02-RF02-entrega-$$-a")"
DOS="$(crear_consorcio "HU02-RF02-entrega-$$-b")"
if [ -z "$UNO" ] || [ -z "$DOS" ]; then
  fail "No se pudieron crear los consorcios de prueba: ¿están levantadas la base y la API?"
  exit 1
fi
pass "Dos consorcios de prueba creados"

code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/")"
[ "$code" = "200" ] && pass "La web responde en $BASE_URL" || fail "Web → HTTP $code (se esperaba 200)"

echo "-- Condición 1: datos que la pestaña necesita para presentar los selectores"
code="$("${CURL[@]}" -o "$TMP/l.json" -w '%{http_code}' "$BASE_URL/api/consorcios")"
n="$(json "$TMP/l.json" "b.filter(c=>c.id==='$UNO'||c.id==='$DOS').length")"
[ "$code" = "200" ] && [ "$n" = "2" ] && pass "El listado trae los dos edificios" || fail "Listado → HTTP $code, encontrados: $n"

code="$(get_roles "$UNO")"
valor="$(json "$TMP/g.json" '[b.rtCalle,b.firmante,b.eca,b.actualizadoEn].every(v=>v===null)')"
[ "$code" = "200" ] && [ "$valor" = "true" ] && pass "Edificio sin terna → HTTP 200 con los roles en null" || fail "GET sin terna → HTTP $code, $valor"

echo "-- Condición 2: Guardar modifica el responsable"
code="$(put_roles "$UNO" "$TMP/terna.json")"
[ "$code" = "200" ] && pass "Guardar la terna → HTTP $code" || fail "PUT → HTTP $code (se esperaba 200)"

code="$(put_roles "$UNO" "$TMP/cambio.json")"
valor="$(json "$TMP/r.json" 'b.eca.nombre')"
[ "$code" = "200" ] && [ "$valor" = "Ascensores del Sur S.A." ] && pass "Cambiar el responsable devuelve la terna nueva" || fail "Cambio → HTTP $code, $valor"

code="$(get_roles "$UNO")"
valor="$(json "$TMP/g.json" '[b.rtCalle.porcentaje,b.firmante.porcentaje,b.eca.nombre].join("/")')"
[ "$code" = "200" ] && [ "$valor" = "60/25/Ascensores del Sur S.A." ] && pass "El cambio queda guardado" || fail "GET → HTTP $code, $valor"

printf '{"rtCalle":{"nombre":"Sin Contacto"},"firmante":{"nombre":"F","email":"f@maicon.test"},"eca":{"nombre":"E","email":"e@maicon.test"}}' > "$TMP/mala.json"
code="$(put_roles "$UNO" "$TMP/mala.json")"
n="$(json "$TMP/r.json" 'b.errores.length')"
[ "$code" = "400" ] && [ "$n" = "1" ] && pass "Sin contacto → HTTP 400 con el error que muestra la pantalla" || fail "Inválido → HTTP $code, errores: $n"

code="$(get_roles "$DOS")"
valor="$(json "$TMP/g.json" 'b.rtCalle')"
[ "$code" = "200" ] && [ "$valor" = "null" ] && pass "Guardar un edificio no toca al otro" || fail "Otro edificio → HTTP $code, $valor"

echo "-- Limpieza"
borrar "$UNO"
borrar "$DOS"
a="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios/$UNO/roles")"
b="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios/$DOS/roles")"
if [ "$a$b" = "404404" ]; then
  pass "Consorcios de prueba borrados (GET → 404)"
  UNO=""
  DOS=""
else
  fail "Tras borrar, GET → HTTP $a y $b (se esperaba 404)"
fi

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

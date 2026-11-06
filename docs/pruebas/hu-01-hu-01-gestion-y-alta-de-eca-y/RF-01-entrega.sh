#!/usr/bin/env bash
# HU-01 / RF-01 (REQ-1791909582859) — API y Modelo de Datos de Consorcios y Máquinas.
#
# Recorre las 2 condiciones de aprobación contra el entorno levantado:
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-01-entrega.sh
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-01-entrega.sh --carga 200
#
# Requiere, desde la raíz del repo: `npm run db:up` y `npm run dev` corriendo (o sólo la API:
# BASE_URL=http://127.0.0.1:3050 si no levantaste la web).
# Cada recorrido crea sus datos con un nombre propio ("RF01-entrega-<pid>-<n>") y los borra
# al terminar, también si algo falla: no deja filas en la base.

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
CREADOS=()
limpiar() {
  for id in "${CREADOS[@]:-}"; do
    [ -n "$id" ] && "${CURL[@]}" -o /dev/null -X DELETE "$BASE_URL/api/consorcios/$id"
  done
  rm -rf "$TMP"
}
trap limpiar EXIT

# json <archivo> <expresión JS sobre "b"> → imprime el valor (sin depender de jq)
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":v)' "$1" "$2" 2>/dev/null; }

cuerpo_valido() { # cuerpo_valido <nombre>
  cat <<JSON
{
  "nombre": "$1",
  "direccion": "Av. Rivadavia 1234, CABA",
  "administracion": { "nombre": "Administración Pérez", "telefono": "11 4444-5555", "email": "admin@perez.com" },
  "maquinas": [
    { "referenciaAgc": "M1", "descripcion": "Derecha" },
    { "referenciaAgc": "M2", "descripcion": "Izquierda" }
  ]
}
JSON
}

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA recorridos (POST + GET + DELETE) contra $BASE_URL"
  fallidas=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    cuerpo_valido "RF01-entrega-$$-$n" > "$TMP/carga.json"
    code="$("${CURL[@]}" -o "$TMP/c.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$TMP/carga.json" "$BASE_URL/api/consorcios")"
    id="$(json "$TMP/c.json" 'b.id')"
    if [ "$code" = "201" ] && [ -n "$id" ]; then
      CREADOS+=("$id")
      g="$("${CURL[@]}" -o "$TMP/g.json" -w '%{http_code}' "$BASE_URL/api/consorcios/$id")"
      [ "$g" = "200" ] && [ "$(json "$TMP/g.json" 'b.maquinas.length')" = "2" ] || fallidas=$((fallidas + 1))
      "${CURL[@]}" -o /dev/null -X DELETE "$BASE_URL/api/consorcios/$id"
      CREADOS=("${CREADOS[@]/$id}")
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

echo "== HU-01 / RF-01 contra $BASE_URL"
NOMBRE="RF01-entrega-$$-0"

echo "1. POST /api/consorcios registra un consorcio con sus máquinas y referencias AGC"
cuerpo_valido "$NOMBRE" > "$TMP/alta.json"
code="$("${CURL[@]}" -o "$TMP/alta-resp.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d @"$TMP/alta.json" "$BASE_URL/api/consorcios")"
ID="$(json "$TMP/alta-resp.json" 'b.id')"
[ -n "$ID" ] && CREADOS+=("$ID")
refs="$(json "$TMP/alta-resp.json" 'b.maquinas.map(m=>m.referenciaAgc).join(",")')"
if [ "$code" = "201" ] && [ -n "$ID" ] && [ "$refs" = "M1,M2" ]; then
  pass "HTTP $code · id $ID · máquinas $refs"
else
  fail "HTTP $code · id '${ID}' · máquinas '${refs}' (¿están corriendo npm run db:up y npm run dev?)"
fi

echo "   y rechaza un cuerpo inválido con 400, sin guardar nada"
code="$("${CURL[@]}" -o "$TMP/inv.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"nombre":""}' "$BASE_URL/api/consorcios")"
errs="$(json "$TMP/inv.json" 'b.errores.join(" | ")')"
[ "$code" = "400" ] && pass "HTTP $code · $errs" || fail "HTTP $code (se esperaba 400) · $errs"

echo "2. GET /api/consorcios/:id devuelve la ficha completa del edificio y sus máquinas"
if [ -n "$ID" ]; then
  code="$("${CURL[@]}" -o "$TMP/ficha.json" -w '%{http_code}' "$BASE_URL/api/consorcios/$ID")"
  dir="$(json "$TMP/ficha.json" 'b.direccion')"
  email="$(json "$TMP/ficha.json" 'b.administracion.email')"
  detalle="$(json "$TMP/ficha.json" 'b.maquinas.map(m=>m.referenciaAgc+":"+m.descripcion).join(",")')"
  if [ "$code" = "200" ] && [ "$dir" = "Av. Rivadavia 1234, CABA" ] && [ "$email" = "admin@perez.com" ] && [ "$detalle" = "M1:Derecha,M2:Izquierda" ]; then
    pass "HTTP $code · dirección '$dir' · administración $email · máquinas $detalle"
  else
    fail "HTTP $code · dirección '$dir' · administración '$email' · máquinas '$detalle'"
  fi
else
  fail "No hay id para consultar (falló el alta)"
fi

echo "   y responde 404 si el consorcio no existe"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios/00000000-0000-4000-8000-000000000000")"
[ "$code" = "404" ] && pass "HTTP $code" || fail "HTTP $code (se esperaba 404)"

echo "   y limpia lo que creó"
if [ -n "$ID" ]; then
  code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X DELETE "$BASE_URL/api/consorcios/$ID")"
  if [ "$code" = "204" ]; then
    CREADOS=()
    pass "DELETE → HTTP $code"
  else
    fail "DELETE → HTTP $code (se esperaba 204)"
  fi
fi

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

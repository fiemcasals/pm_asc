#!/usr/bin/env bash
# HU-01 / RNF-01 (REQ-1793979090598) — Rechazar con 400 los textos que la base no puede guardar.
#
# Recorre las condiciones 1, 2 y 3 (la parte de la respuesta) contra el entorno levantado:
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RNF-01-entrega.sh
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RNF-01-entrega.sh --carga 200
#
# Requiere, desde la raíz del repo: `npm run db:up` y `npm run dev` corriendo (o sólo la API:
# BASE_URL=http://127.0.0.1:3050 si no levantaste la web).
#
# NO cubre, porque no se puede ver desde curl (ver el documento de entrega, §4.5):
#   - condición 3, segunda mitad: la línea del log de la API ("Texto con codificación inválida
#     rechazado (SQLSTATE 22021)") se mira en la terminal donde corre la API;
#   - condición 4: la base caída se prueba a mano (docker stop mant-asc-db).
#
# El único dato que deja es un consorcio de prueba ("RNF01-entrega-<pid>"), que se borra al
# terminar, también si algo falla.

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
enviar() { # enviar <método> <ruta> <archivo-cuerpo> → código HTTP; cuerpo en $TMP/resp
  "${CURL[@]}" -o "$TMP/resp" -w '%{http_code}' -X "$1" -H 'Content-Type: application/json' --data-binary @"$3" "$BASE_URL$2"
}
cantidad() { "${CURL[@]}" "$BASE_URL/api/consorcios" -o "$TMP/lista"; json "$TMP/lista" 'b.length'; }

# El \u0000 va escrito como texto en el JSON: el servidor lo recibe como el carácter NUL.
# (printf '%s' no interpreta la barra: el archivo contiene la secuencia JSON, no el byte.)
printf '%s' '{"nombre":"RNF01 con nulo \u0000 adentro","direccion":"Calle 1"}' > "$TMP/nul-nombre.json"
printf '%s' '{"nombre":"RNF01 PUT","direccion":"Otra 99","maquinas":[{"referenciaAgc":"M9","descripcion":"con \u0000 nulo"}]}' > "$TMP/nul-put.json"
printf '%s' '{"nombre":"RNF01-entrega-'$$'","direccion":"Calle 1","maquinas":[{"referenciaAgc":"M1","descripcion":"Derecha"}]}' > "$TMP/valido.json"

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA POST con NUL contra $BASE_URL (todos tienen que dar 400)"
  fallidas=0
  : > "$TMP/tiempos"
  for _ in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    code="$(enviar POST /api/consorcios "$TMP/nul-nombre.json")"
    [ "$code" = "400" ] || fallidas=$((fallidas + 1))
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v f="$fallidas" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · fallidas (no 400): %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, f, s / NR, p95, t[NR]
    }'
  [ "$fallidas" -eq 0 ]
  exit $?
fi

echo "== HU-01 / RNF-01 contra $BASE_URL"

echo "1. POST /api/consorcios con un carácter NUL en nombre → 400, sin guardar nada"
antes="$(cantidad)"
code="$(enviar POST /api/consorcios "$TMP/nul-nombre.json")"
msg="$(json "$TMP/resp" 'b.message')"
nerr="$(json "$TMP/resp" 'Array.isArray(b.errores)?b.errores.length:0')"
despues="$(cantidad)"
if [ "$code" = "400" ] && [ "$msg" = "Datos inválidos" ] && [ "$nerr" -ge 1 ] && [ "$antes" = "$despues" ]; then
  pass "HTTP $code · message \"$msg\" · errores: $nerr · consorcios $antes → $despues (no se guardó nada)"
else
  fail "HTTP $code · message '$msg' · errores: $nerr · consorcios $antes → $despues (se esperaba 400, \"Datos inválidos\", ≥1 error y la misma cantidad)"
fi

echo "2. PUT /api/consorcios/:id con un NUL en la descripción de una máquina → 400, la ficha no cambia"
code="$(enviar POST /api/consorcios "$TMP/valido.json")"
ID="$(json "$TMP/resp" 'b.id')"
if [ "$code" = "201" ] && [ -n "$ID" ]; then
  CREADOS+=("$ID")
  "${CURL[@]}" -o "$TMP/ficha-antes" "$BASE_URL/api/consorcios/$ID"
  code="$(enviar PUT "/api/consorcios/$ID" "$TMP/nul-put.json")"
  msg="$(json "$TMP/resp" 'b.message')"
  "${CURL[@]}" -o "$TMP/ficha-despues" "$BASE_URL/api/consorcios/$ID"
  if [ "$code" = "400" ] && [ "$msg" = "Datos inválidos" ] && cmp -s "$TMP/ficha-antes" "$TMP/ficha-despues"; then
    pass "HTTP $code · message \"$msg\" · la ficha es idéntica antes y después (nombre \"$(json "$TMP/ficha-despues" 'b.nombre')\", máquinas $(json "$TMP/ficha-despues" 'b.maquinas.map(m=>m.referenciaAgc).join(",")'))"
  else
    fail "HTTP $code · message '$msg' · ficha ¿idéntica?: $(cmp -s "$TMP/ficha-antes" "$TMP/ficha-despues" && echo sí || echo NO)"
  fi
else
  fail "No se pudo crear el consorcio base (HTTP $code); no se probó el PUT"
fi

echo "3. La respuesta 400 no filtra el error de PostgreSQL ni trazas"
enviar POST /api/consorcios "$TMP/nul-nombre.json" >/dev/null
claves="$(json "$TMP/resp" 'Object.keys(b).sort().join(",")')"
if [ "$claves" = "errores,message" ] && ! grep -qiE 'byte sequence|0x00|UTF8|22021|severity|stack' "$TMP/resp"; then
  pass "el cuerpo sólo tiene errores y message; no aparece byte sequence / 0x00 / UTF8 / 22021 / stack"
else
  fail "el cuerpo trae algo más o menciona a PostgreSQL: $(cat "$TMP/resp")"
fi
echo "     (el error real en el log de la API se mira en su terminal: condición 3, segunda mitad)"

echo "   y un alta válida inmediatamente después sigue funcionando"
printf '%s' '{"nombre":"RNF01-entrega-'$$'-ok","direccion":"Calle\n1 con tabulación\t y ñandú 🛗"}' > "$TMP/ok.json"
code="$(enviar POST /api/consorcios "$TMP/ok.json")"
OKID="$(json "$TMP/resp" 'b.id')"
[ -n "$OKID" ] && CREADOS+=("$OKID")
[ "$code" = "201" ] && pass "HTTP $code (los saltos de línea, tabulaciones y unicode siguen siendo válidos)" || fail "HTTP $code (se esperaba 201)"

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

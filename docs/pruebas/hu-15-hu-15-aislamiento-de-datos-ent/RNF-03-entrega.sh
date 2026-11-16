#!/usr/bin/env bash
# HU-15 / RNF-03 (REQ-1794500687294) — Tomar la ECA y el rol del RLS desde la sesión del usuario.
#
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-03-entrega.sh
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-03-entrega.sh --carga 50
#
# Requiere `npm run db:up` y `npm run dev`.

set -u

BASE_URL="$(echo "${BASE_URL:-http://127.0.0.1:3050}" | tr -d '\r')"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
SUFIJO="$$"
CLAVE="Clave-Entrega-2026"

CARGA=0
if [ "${1:-}" = "--carga" ]; then CARGA="${2:-50}"; fi

ADMIN_USUARIO="admin"
ADMIN_PASSWORD="Admin-Desarrollo-2026"

if command -v curl.exe >/dev/null 2>&1; then
  CURL=(curl.exe -s --max-time 15)
else
  CURL=(curl -s --max-time 15)
fi
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
elif echo "$BASE_URL" | grep -qE '^https://(localhost|127\.0\.0\.1)(:|/)'; then
  CURL+=(-k)
fi
if curl.exe -V 2>/dev/null | grep -qi schannel || curl -V 2>/dev/null | grep -qi schannel; then
  CURL+=(--ssl-no-revoke)
fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (esperado: $3, obtenido: $2)"; fi; }

TMP="$(mktemp -d)"
TMP_WIN="$TMP"
if command -v cygpath >/dev/null 2>&1; then
  TMP_WIN="$(cygpath -m "$TMP")"
fi

HAY_DB=0
sql() { MSYS_NO_PATHCONV=1 docker exec -i "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1" 2>&1 | tr -d '\r'; }
if command -v docker >/dev/null 2>&1 && [ -n "$(sql 'select 1')" ]; then HAY_DB=1; fi

ID_ALPHA=""
ID_BETA=""
limpiar() {
  if [ "$HAY_DB" -eq 1 ]; then
    sql "delete from usuarios where usuario like 'hu15rnf03-%'" >/dev/null 2>&1 || true
    if [ -n "$ID_ALPHA" ]; then
      sql "delete from roles_edificio where consorcio_id = '$ID_ALPHA'" >/dev/null 2>&1 || true
      sql "delete from consorcios where id = '$ID_ALPHA'" >/dev/null 2>&1 || true
    fi
    if [ -n "$ID_BETA" ]; then
      sql "delete from roles_edificio where consorcio_id = '$ID_BETA'" >/dev/null 2>&1 || true
      sql "delete from consorcios where id = '$ID_BETA'" >/dev/null 2>&1 || true
    fi
  fi
  rm -rf "$TMP"
}
trap limpiar EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(v===null?"null":v))' "$1" "$2" 2>/dev/null; }

login() {
  printf '{"usuario":"%s","password":"%s"}' "$1" "$2" > "$TMP/login_payload.json"
  "${CURL[@]}" -o "$TMP/login_$1" -X POST -H 'Content-Type: application/json' \
    --data-binary @"$TMP_WIN/login_payload.json" "$BASE_URL/api/auth/login"
  json "$TMP/login_$1" 'b.accessToken'
}

alta_usuario() {
  printf '%s' "$1" > "$TMP/user_payload.json"
  "${CURL[@]}" -o /dev/null -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN_ADMIN" \
    --data-binary @"$TMP_WIN/user_payload.json" "$BASE_URL/api/usuarios"
}

# 1. Login como admin
TOKEN_ADMIN="$(login "$ADMIN_USUARIO" "$ADMIN_PASSWORD")"
if [ -z "$TOKEN_ADMIN" ] || [ "$TOKEN_ADMIN" = "null" ]; then
  echo "No se pudo ingresar como $ADMIN_USUARIO. Detalle: $(cat "$TMP/login_$ADMIN_USUARIO" 2>/dev/null)"
  exit 2
fi

# 2. Crear usuarios de prueba para ECA-ALPHA y ECA-BETA
USER_ALPHA="hu15rnf03-alpha-$SUFIJO"
USER_BETA="hu15rnf03-beta-$SUFIJO"

alta_usuario "{\"usuario\":\"$USER_ALPHA\",\"nombre\":\"User Alpha\",\"rol\":\"eca\",\"eca\":\"ECA-ALPHA-$SUFIJO\",\"password\":\"$CLAVE\"}"
alta_usuario "{\"usuario\":\"$USER_BETA\",\"nombre\":\"User Beta\",\"rol\":\"eca\",\"eca\":\"ECA-BETA-$SUFIJO\",\"password\":\"$CLAVE\"}"

TOKEN_ALPHA="$(login "$USER_ALPHA" "$CLAVE")"
TOKEN_BETA="$(login "$USER_BETA" "$CLAVE")"

# Modo Carga
if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA consultas autenticadas de consorcios con RLS contra $BASE_URL =="
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    code="$("${CURL[@]}" -H "Authorization: Bearer $TOKEN_ALPHA" -H "x-eca-actual: INTRUSION" -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios")"
    if [ "$code" != "200" ]; then
      errores=$((errores + 1))
    fi
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v e="$errores" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · fallas HTTP != 200: %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, e, s / NR, p95, t[NR]
    }'
  [ "$errores" -eq 0 ]
  exit $?
fi

echo "== HU-15 / RNF-03 contra $BASE_URL =="

echo "1. Criterio 3: Petición sin sesión a /api/consorcios responde 401"
code_sin_sesion="$("${CURL[@]}" -o "$TMP/401.json" -w '%{http_code}' "$BASE_URL/api/consorcios")"
check "GET /api/consorcios sin token responde 401" "$code_sin_sesion" "401"

USER_RT="hu15rnf03-rt-$SUFIJO"

echo "2. Crear consorcios para ECA-ALPHA y ECA-BETA"
printf '{"nombre":"Consorcio Alpha Test","direccion":"Av. Alpha 100","maquinas":[{"referenciaAgc":"M1","descripcion":"Ascensor Alpha"}]}' > "$TMP/ca_payload.json"
c1="$("${CURL[@]}" -o "$TMP/ca.json" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN_ADMIN" \
  --data-binary @"$TMP_WIN/ca_payload.json")"
ID_ALPHA="$(json "$TMP/ca.json" 'b.id')"

printf "{\"rtCalle\":{\"nombre\":\"$USER_RT\",\"email\":\"$USER_RT@campo.test\"},\"firmante\":{\"nombre\":\"Firmante Alpha\",\"email\":\"firmante@alpha.test\"},\"eca\":{\"nombre\":\"ECA-ALPHA-$SUFIJO\",\"email\":\"ops@alpha.test\"}}" > "$TMP/roles_alpha.json"
"${CURL[@]}" -o /dev/null -X PUT "$BASE_URL/api/consorcios/$ID_ALPHA/roles" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN_ADMIN" \
  --data-binary @"$TMP_WIN/roles_alpha.json"

printf '{"nombre":"Consorcio Beta Test","direccion":"Av. Beta 200","maquinas":[{"referenciaAgc":"M1","descripcion":"Ascensor Beta"}]}' > "$TMP/cb_payload.json"
c2="$("${CURL[@]}" -o "$TMP/cb.json" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN_ADMIN" \
  --data-binary @"$TMP_WIN/cb_payload.json")"
ID_BETA="$(json "$TMP/cb.json" 'b.id')"

printf "{\"rtCalle\":{\"nombre\":\"RT Beta\",\"email\":\"rt@beta.test\"},\"firmante\":{\"nombre\":\"Firmante Beta\",\"email\":\"firmante@beta.test\"},\"eca\":{\"nombre\":\"ECA-BETA-$SUFIJO\",\"email\":\"ops@beta.test\"}}" > "$TMP/roles_beta.json"
"${CURL[@]}" -o /dev/null -X PUT "$BASE_URL/api/consorcios/$ID_BETA/roles" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN_ADMIN" \
  --data-binary @"$TMP_WIN/roles_beta.json"

if [ "$c1" = "201" ] && [ "$c2" = "201" ]; then
  pass "Consorcios creados y asociados a sus respectivas ECAs (Alpha: $ID_ALPHA, Beta: $ID_BETA)"
else
  fail "Error al crear consorcios de prueba ($c1 / $c2)"
fi

echo "3. Criterio 1 y 2: ECA-ALPHA mandando x-eca-actual: ECA-BETA sólo ve datos de ECA-ALPHA"
"${CURL[@]}" -o "$TMP/alpha_list.json" -H "Authorization: Bearer $TOKEN_ALPHA" -H "x-eca-actual: ECA-BETA-$SUFIJO" "$BASE_URL/api/consorcios"
tiene_alpha="$(json "$TMP/alpha_list.json" "b.some(x => x.id === '$ID_ALPHA')")"
tiene_beta="$(json "$TMP/alpha_list.json" "b.some(x => x.id === '$ID_BETA')")"

if [ "$tiene_alpha" = "true" ] && [ "$tiene_beta" = "false" ]; then
  pass "Header x-eca-actual ignorado: ECA-ALPHA sólo ve su consorcio y no ve filas de ECA-BETA"
else
  fail "Falla de aislamiento: tiene_alpha=$tiene_alpha, tiene_beta=$tiene_beta"
fi

code_cross="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_ALPHA" -H "x-eca-actual: ECA-BETA-$SUFIJO" "$BASE_URL/api/consorcios/$ID_BETA")"
check "Intento de leer consorcio de ECA-BETA con token de ECA-ALPHA devuelve 404" "$code_cross" "404"

echo "4. Criterio 4: RT y Firmante ven edificios asignados en cualquier ECA"
alta_usuario "{\"usuario\":\"$USER_RT\",\"nombre\":\"$USER_RT\",\"rol\":\"rt_calle\",\"password\":\"$CLAVE\"}"
TOKEN_RT="$(login "$USER_RT" "$CLAVE")"

"${CURL[@]}" -o "$TMP/rt_list.json" -H "Authorization: Bearer $TOKEN_RT" "$BASE_URL/api/consorcios"
rt_ve_alpha="$(json "$TMP/rt_list.json" "b.some(x => x.id === '$ID_ALPHA')")"
rt_ve_beta="$(json "$TMP/rt_list.json" "b.some(x => x.id === '$ID_BETA')")"

if [ "$rt_ve_alpha" = "true" ] && [ "$rt_ve_beta" = "false" ]; then
  pass "RT de Calle ve el edificio que tiene asignado ($ID_ALPHA) y no el ajeno ($ID_BETA)"
else
  fail "Falla en filtro RT de Calle: ve_alpha=$rt_ve_alpha, ve_beta=$rt_ve_beta"
fi

echo "=========================================="
echo "Resultado final: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

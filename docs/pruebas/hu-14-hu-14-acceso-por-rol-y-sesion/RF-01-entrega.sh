#!/usr/bin/env bash
# HU-14 / RF-01 (REQ-1794493998753) — API de autenticación y roles.
#
# Recorre las 5 condiciones contra la app levantada:
#   bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-01-entrega.sh
#   bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-01-entrega.sh --carga 200
#
# Requiere, desde la raíz del repo: `npm run db:up` y `npm run dev` corriendo, con
# ADMIN_INICIAL_USUARIO y ADMIN_INICIAL_PASSWORD en el .env (ver .env.example).
# Las columnas de la base se verifican con `docker exec mant-asc-db psql` si docker está disponible.
# El script crea usuarios con prefijo `rf01-entrega-` y los borra al terminar.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
DB_NAME="${DB_NAME:-ascensores}"
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
SUFIJO="$$"
CLAVE="Clave-Entrega-2026"

CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-100}"
fi

# --- Credenciales del Administrador inicial, desde el .env de la raíz
leer_env() { grep -E "^$1=" "$RAIZ/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r'; }
ADMIN_USUARIO="${ADMIN_USUARIO:-$(leer_env ADMIN_INICIAL_USUARIO)}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(leer_env ADMIN_INICIAL_PASSWORD)}"
if [ -z "$ADMIN_USUARIO" ] || [ -z "$ADMIN_PASSWORD" ]; then
  echo "Falta ADMIN_INICIAL_USUARIO / ADMIN_INICIAL_PASSWORD en $RAIZ/.env (ver .env.example)."
  exit 2
fi

# --- TLS: confiar en el CA local de mkcert (y en Windows/Schannel, no consultar revocación)
CURL=(curl -s --max-time 15)
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
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (esperado: $3, obtenido: $2)"; fi; }

TMP="$(mktemp -d)"

HAY_DB=0
sql() { MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql -U ascensores -d "$DB_NAME" -tAc "$1" 2>/dev/null | tr -d '\r'; }
if command -v docker >/dev/null 2>&1 && [ -n "$(sql 'select 1')" ]; then HAY_DB=1; fi

limpiar() {
  if [ "$HAY_DB" -eq 1 ]; then
    sql "delete from usuarios where usuario like 'rf01-entrega-%'" >/dev/null
    sql "delete from intentos_login where usuario like 'rf01-entrega-%'" >/dev/null
  fi
  rm -rf "$TMP"
}
trap limpiar EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }

# login USUARIO CLAVE ARCHIVO → código HTTP; cuerpo en ARCHIVO, encabezados en ARCHIVO.h
login() {
  "${CURL[@]}" -o "$3" -D "$3.h" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -d "{\"usuario\":\"$1\",\"password\":\"$2\"}" "$BASE_URL/api/auth/login"
}

# --- Sesión de Administrador (se usa en varias condiciones)
code="$(login "$ADMIN_USUARIO" "$ADMIN_PASSWORD" "$TMP/admin")"
if [ "$code" != "200" ]; then
  echo "No se pudo ingresar como $ADMIN_USUARIO (HTTP $code). ¿Está corriendo npm run dev y el Administrador inicial existe?"
  exit 2
fi
TOKEN_ADMIN="$(json "$TMP/admin" 'b.accessToken')"

# alta USUARIO ROL → código HTTP. Desde HU-15 el rol eca exige el campo "eca" (nombre de la ECA).
alta() {
  local extra=""
  [ "$2" = "eca" ] && extra=",\"eca\":\"ECA Entrega S.A.\""
  "${CURL[@]}" -o "$TMP/alta" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN_ADMIN" \
    -d "{\"usuario\":\"$1\",\"nombre\":\"Entrega $2\",\"rol\":\"$2\"$extra,\"password\":\"$CLAVE\"}" "$BASE_URL/api/usuarios"
}

RT="rf01-entrega-rt-$SUFIJO"
alta "$RT" rt_calle >/dev/null

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA consultas GET /api/auth/me con token de acceso contra $BASE_URL"
  code="$(login "$RT" "$CLAVE" "$TMP/rt")"
  TOKEN="$(json "$TMP/rt" 'b.accessToken')"
  fallidas=0
  : > "$TMP/tiempos"
  for _ in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    c="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/auth/me")"
    [ "$c" = "200" ] || fallidas=$((fallidas + 1))
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v f="$fallidas" '
    { t[NR] = $1; s += $1 }
    END { p95 = t[int(n * 0.95)]; if (p95 == "") p95 = t[n];
          printf "%d corridas, %d fallidas · promedio %d ms · p95 %d ms · la más lenta %d ms\n", n, f, s / n, p95, t[n] }'
  [ "$fallidas" -eq 0 ] && exit 0 || exit 1
fi

echo "1. POST /api/auth/login: 200 con credenciales válidas, 401 con inválidas y el mismo mensaje"
code="$(login "$RT" "$CLAVE" "$TMP/rt")"
check "credenciales válidas → HTTP $code" "$code" "200"
check "devuelve el rol del usuario" "$(json "$TMP/rt" 'b.usuario.rol')" "rt_calle"
code="$(login "$RT" "Clave-Equivocada-1" "$TMP/mala")"
check "contraseña incorrecta → HTTP $code" "$code" "401"
code="$(login "rf01-entrega-no-existe-$SUFIJO" "Clave-Equivocada-1" "$TMP/inexistente")"
check "usuario inexistente → HTTP $code" "$code" "401"
check "mismo cuerpo exista o no el usuario" "$(cat "$TMP/mala")" "$(cat "$TMP/inexistente")"

echo "2. La contraseña se guarda con bcrypt costo 12, nunca en texto plano"
if [ "$HAY_DB" -eq 1 ]; then
  hash="$(sql "select password_hash from usuarios where usuario = '$RT'")"
  check "hash en la base con prefijo \$2b\$12\$" "${hash:0:7}" '$2b$12$'
  check "la contraseña no aparece en la tabla" "$(sql "select count(*) from usuarios where password_hash like '%$CLAVE%'")" "0"
else
  echo "  ⚠️  sin docker: no se puede leer la tabla usuarios (cubierto por npm run test:int)"
fi

echo "3. Acceso de 15 minutos, renovable con cookie httpOnly, Secure y SameSite"
exp_iat="$(node -e 'const t=process.argv[1].split(".")[1];const p=JSON.parse(Buffer.from(t,"base64url"));console.log(p.exp-p.iat)' "$(json "$TMP/rt" 'b.accessToken')")"
check "el token de acceso dura 900 s" "$exp_iat" "900"
cookie="$(grep -i '^set-cookie: mant_refresh=' "$TMP/rt.h" | tr -d '\r')"
for attr in HttpOnly Secure 'SameSite=Strict' 'Path=/api/auth'; do
  if echo "$cookie" | grep -qi "$attr"; then pass "cookie de refresco con $attr"; else fail "cookie de refresco sin $attr"; fi
done
par="$(echo "$cookie" | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]+).*/\1/')"
code="$("${CURL[@]}" -o "$TMP/ref" -D "$TMP/ref.h" -w '%{http_code}' -X POST -H "Cookie: $par" "$BASE_URL/api/auth/refresh")"
check "POST /api/auth/refresh con la cookie → HTTP $code" "$code" "200"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $(json "$TMP/ref" 'b.accessToken')" "$BASE_URL/api/auth/me")"
check "el token renovado sirve en GET /api/auth/me → HTTP $code" "$code" "200"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $par" "$BASE_URL/api/auth/refresh")"
check "la cookie ya usada deja de servir → HTTP $code" "$code" "401"

echo "4. POST /api/usuarios (sólo Administrador): 401 sin sesión y 403 con otro rol"
nuevo="{\"usuario\":\"rf01-entrega-x-$SUFIJO\",\"nombre\":\"X\",\"rol\":\"eca\",\"password\":\"$CLAVE\"}"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "$nuevo" "$BASE_URL/api/usuarios")"
check "sin token → HTTP $code" "$code" "401"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $(json "$TMP/ref" 'b.accessToken')" -d "$nuevo" "$BASE_URL/api/usuarios")"
check "con token de RT de Calle → HTTP $code" "$code" "403"
code="$(alta "rf01-entrega-eca-$SUFIJO" eca)"
check "con token de Administrador → HTTP $code" "$code" "201"

echo "5. Tras 5 intentos fallidos seguidos, 429 durante 15 minutos"
VICTIMA="rf01-entrega-bloqueo-$SUFIJO"
alta "$VICTIMA" secretaria >/dev/null
codigos=""
for i in 1 2 3 4 5; do codigos="$codigos$(login "$VICTIMA" "Clave-Equivocada-$i" "$TMP/f") "; done
check "5 intentos fallidos → 401 cada uno" "$codigos" "401 401 401 401 401 "
code="$(login "$VICTIMA" "$CLAVE" "$TMP/bloq")"
check "6.º intento con la contraseña CORRECTA → HTTP $code" "$code" "429"
retry="$(grep -i '^retry-after:' "$TMP/bloq.h" | tr -dc '0-9')"
if [ -n "$retry" ] && [ "$retry" -gt 890 ] && [ "$retry" -le 900 ]; then pass "Retry-After: $retry s (15 minutos)"; else fail "Retry-After inesperado: '$retry'"; fi
code="$(login "$RT" "$CLAVE" "$TMP/otro")"
check "otro usuario sigue entrando → HTTP $code" "$code" "200"

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

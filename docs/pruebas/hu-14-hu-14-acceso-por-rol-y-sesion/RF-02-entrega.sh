#!/usr/bin/env bash
# HU-14 / RF-02 (REQ-1794493998996) — Pantalla de ingreso.
#
# Verifica lo que la pantalla necesita del servidor y los textos de la interfaz:
#   bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-02-entrega.sh
#   bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-02-entrega.sh --carga 100
#
# Requiere `npm run db:up` y `npm run dev`, y ADMIN_INICIAL_USUARIO / ADMIN_INICIAL_PASSWORD en el .env.
# Lo visual (360 px, ver/ocultar, error en pantalla, sesión sin señal) se prueba en el navegador
# siguiendo RF-02-pantalla-de-ingreso.md. Crea usuarios `rf02-entrega-*` y los borra al terminar.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
SUFIJO="$$"
CLAVE="Clave-Entrega-2026"

CARGA=0
if [ "${1:-}" = "--carga" ]; then CARGA="${2:-100}"; fi

leer_env() { grep -E "^$1=" "$RAIZ/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r'; }
ADMIN_USUARIO="${ADMIN_USUARIO:-$(leer_env ADMIN_INICIAL_USUARIO)}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(leer_env ADMIN_INICIAL_PASSWORD)}"

CURL=(curl -s --max-time 15)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
fi
if curl -V | grep -qi schannel; then CURL+=(--ssl-no-revoke); fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (esperado: $3, obtenido: $2)"; fi; }

TMP="$(mktemp -d)"
sql() { MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1" 2>/dev/null | tr -d '\r'; }
limpiar() { sql "delete from usuarios where usuario like 'rf02-entrega-%'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":v)' "$1" "$2" 2>/dev/null; }

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA cargas de la pantalla (GET /) contra $BASE_URL"
  fallidas=0
  : > "$TMP/t"
  for _ in $(seq 1 "$CARGA"); do
    i="$(date +%s%N)"
    c="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/")"
    [ "$c" = "200" ] || fallidas=$((fallidas + 1))
    echo $(( ($(date +%s%N) - i) / 1000000 )) >> "$TMP/t"
  done
  sort -n "$TMP/t" | awk -v n="$CARGA" -v f="$fallidas" '{ t[NR]=$1; s+=$1 } END { p=t[int(n*0.95)]; if(p=="")p=t[n];
    printf "%d corridas, %d fallidas · promedio %d ms · p95 %d ms · la más lenta %d ms\n", n, f, s/n, p, t[n] }'
  [ "$fallidas" -eq 0 ]; exit
fi

echo "1. La pantalla tiene los textos pedidos (búsqueda en el código del frontend)"
WEB="$RAIZ/apps/web/src"
for literal in 'MAICON S.R.L.' 'Usuario / Email' 'Contraseña' 'Mostrar contraseña' 'Ocultar contraseña' 'Ingresar al Sistema'; do
  if grep -rqF "$literal" "$WEB/auth/Login.tsx"; then pass "\"$literal\" en Login.tsx"; else fail "falta \"$literal\" en Login.tsx"; fi
done
check "la app se sirve en $BASE_URL → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/")" "200"
check "manifiesto de la PWA → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/manifest.webmanifest")" "200"

echo "2. Con credenciales válidas la API devuelve el rol que decide la pantalla inicial"
"${CURL[@]}" -o "$TMP/admin" -X POST -H 'Content-Type: application/json' \
  -d "{\"usuario\":\"$ADMIN_USUARIO\",\"password\":\"$ADMIN_PASSWORD\"}" "$BASE_URL/api/auth/login"
TOKEN="$(json "$TMP/admin" 'b.accessToken')"
RT="rf02-entrega-rt-$SUFIJO"
check "alta de un RT de Calle de prueba → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d "{\"usuario\":\"$RT\",\"nombre\":\"Ing. Entrega\",\"rol\":\"rt_calle\",\"password\":\"$CLAVE\"}" "$BASE_URL/api/usuarios")" "201"
code="$("${CURL[@]}" -o "$TMP/rt" -D "$TMP/rt.h" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"usuario\":\"$RT\",\"password\":\"$CLAVE\"}" "$BASE_URL/api/auth/login")"
check "login del RT → HTTP" "$code" "200"
check "rol devuelto (la pantalla lo manda a su mapa)" "$(json "$TMP/rt" 'b.usuario.rol')" "rt_calle"
grep -qi 'case .rt_calle.:' "$WEB/auth/sesion.ts" && grep -q "return 'rt'" "$WEB/auth/sesion.ts" \
  && pass "pantallaInicial('rt_calle') = 'rt' (Mapa del RT)" || fail "pantallaInicial no manda al RT a su mapa"

echo "3. Con credenciales inválidas la API responde el mensaje que se muestra en pantalla"
"${CURL[@]}" -o "$TMP/mala" -X POST -H 'Content-Type: application/json' -d "{\"usuario\":\"$RT\",\"password\":\"Clave-Mala-1\"}" "$BASE_URL/api/auth/login"
check "mensaje de error" "$(json "$TMP/mala" 'b.message')" "Usuario o contraseña incorrectos."

echo "5. La sesión se recupera al reabrir la app (refresco con la cookie) y se corta al cerrar sesión"
par="$(grep -i '^set-cookie: mant_refresh=' "$TMP/rt.h" | tr -d '\r' | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]+).*/\1/')"
code="$("${CURL[@]}" -o "$TMP/ref" -D "$TMP/ref.h" -w '%{http_code}' -X POST -H "Cookie: $par" "$BASE_URL/api/auth/refresh")"
check "reabrir: POST /api/auth/refresh con la cookie → HTTP" "$code" "200"
par2="$(grep -i '^set-cookie: mant_refresh=' "$TMP/ref.h" | tr -d '\r' | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]+).*/\1/')"
check "cerrar sesión: POST /api/auth/logout → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $par2" "$BASE_URL/api/auth/logout")" "204"
check "después de cerrar sesión la cookie no sirve → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $par2" "$BASE_URL/api/auth/refresh")" "401"

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

#!/usr/bin/env bash
# HU-14 / RNF-01 (REQ-1794493999191) — Consentimiento de ubicación y revocación de sesiones.
#
#   bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RNF-01-entrega.sh
#   bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RNF-01-entrega.sh --carga 100
#
# Requiere `npm run db:up` y `npm run dev`, y ADMIN_INICIAL_USUARIO / ADMIN_INICIAL_PASSWORD en el .env.
# Lo visual (aviso que bloquea, cierre con el motivo) se prueba en el navegador siguiendo
# RNF-01-consentimiento-y-revocacion.md. Crea usuarios `rnf01-entrega-*` y los borra al terminar.

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
HAY_DB=0
sql() { MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1" 2>/dev/null | tr -d '\r'; }
if command -v docker >/dev/null 2>&1 && [ -n "$(sql 'select 1')" ]; then HAY_DB=1; fi
limpiar() { [ "$HAY_DB" -eq 1 ] && sql "delete from usuarios where usuario like 'rnf01-entrega-%'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":v)' "$1" "$2" 2>/dev/null; }
# login USUARIO CLAVE ARCHIVO → código HTTP; cuerpo en ARCHIVO, encabezados en ARCHIVO.h
login() {
  "${CURL[@]}" -o "$3" -D "$3.h" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -d "{\"usuario\":\"$1\",\"password\":\"$2\"}" "$BASE_URL/api/auth/login"
}
cookie() { grep -i '^set-cookie: mant_refresh=' "$1.h" | tr -d '\r' | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]+).*/\1/'; }

login "$ADMIN_USUARIO" "$ADMIN_PASSWORD" "$TMP/admin" >/dev/null
ADMIN="$(json "$TMP/admin" 'b.accessToken')"
[ -n "$ADMIN" ] || { echo "No se pudo ingresar como $ADMIN_USUARIO. ¿Corre npm run dev?"; exit 2; }
alta() {
  "${CURL[@]}" -o "$TMP/alta" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN" \
    -d "{\"usuario\":\"$1\",\"nombre\":\"Entrega\",\"rol\":\"$2\",\"password\":\"$CLAVE\"}" "$BASE_URL/api/usuarios"
}

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA GET /api/auth/me (el guard consulta la base en cada pedido) contra $BASE_URL"
  RT="rnf01-entrega-carga-$SUFIJO"; alta "$RT" rt_calle >/dev/null; login "$RT" "$CLAVE" "$TMP/c" >/dev/null
  TOKEN="$(json "$TMP/c" 'b.accessToken')"
  fallidas=0; : > "$TMP/t"
  for _ in $(seq 1 "$CARGA"); do
    i="$(date +%s%N)"
    c="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/auth/me")"
    [ "$c" = "200" ] || fallidas=$((fallidas + 1))
    echo $(( ($(date +%s%N) - i) / 1000000 )) >> "$TMP/t"
  done
  sort -n "$TMP/t" | awk -v n="$CARGA" -v f="$fallidas" '{ t[NR]=$1; s+=$1 } END { p=t[int(n*0.95)]; if(p=="")p=t[n];
    printf "%d corridas, %d fallidas · promedio %d ms · p95 %d ms · la más lenta %d ms\n", n, f, s/n, p, t[n] }'
  [ "$fallidas" -eq 0 ]; exit
fi

echo "1. Aviso de uso de ubicación: el RT lo tiene pendiente y la aceptación queda con fecha y versión"
"${CURL[@]}" -o "$TMP/texto" "$BASE_URL/api/consentimientos/ubicacion"
VERSION="$(json "$TMP/texto" 'b.version')"
check "GET /api/consentimientos/ubicacion trae versión" "$VERSION" "ubicacion-2026-11-v1"
texto="$(json "$TMP/texto" 'b.parrafos.join(" ")')"
for frase in 'constancia de que estuviste en el edificio' 'segundo plano' 'Secretaría y el RT Firmante' 'Ley 25.326'; do
  if echo "$texto" | grep -qF "$frase"; then pass "el aviso dice: \"$frase\""; else fail "el aviso no dice \"$frase\""; fi
done
RT="rnf01-entrega-rt-$SUFIJO"
alta "$RT" rt_calle >/dev/null
login "$RT" "$CLAVE" "$TMP/rt" >/dev/null
TOKEN_RT="$(json "$TMP/rt" 'b.accessToken')"
check "al ingresar, el RT tiene el aviso pendiente" "$(json "$TMP/rt" 'b.usuario.consentimientoUbicacionPendiente')" "true"
check "versión distinta de la vigente → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN_RT" -d '{"version":"vieja"}' "$BASE_URL/api/consentimientos/ubicacion")" "400"
check "aceptar → HTTP" "$("${CURL[@]}" -o "$TMP/acepta" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN_RT" -d "{\"version\":\"$VERSION\"}" "$BASE_URL/api/consentimientos/ubicacion")" "201"
if [ "$HAY_DB" -eq 1 ]; then
  check "fila en consentimientos_ubicacion con la versión" \
    "$(sql "select c.version from consentimientos_ubicacion c join usuarios u on u.id = c.usuario_id where u.usuario = '$RT'")" "$VERSION"
fi
login "$RT" "$CLAVE" "$TMP/rt2" >/dev/null
check "en el próximo ingreso ya no está pendiente" "$(json "$TMP/rt2" 'b.usuario.consentimientoUbicacionPendiente')" "false"

echo "2. La ubicación sólo se lee en un lugar, una vez, sin seguimiento"
WEB="$RAIZ/apps/web/src"
check "llamadas a watchPosition en apps/web/src" "$(grep -rlE '\.watchPosition\s*\(' "$WEB" --include=*.ts --include=*.tsx | grep -v '\.test\.' | wc -l | tr -d ' ')" "0"
check "archivos que leen la geolocalización" "$(grep -rlE 'navigator\??\.geolocation|\.getCurrentPosition\s*\(' "$WEB" --include=*.ts --include=*.tsx | grep -v '\.test\.' | sed "s#$WEB/##")" "auth/ubicacion.ts"

echo "3. El Administrador revoca las sesiones: token y refresco responden 401 desde ese momento"
ID="$(json "$TMP/rt2" 'b.usuario.id')"
COOKIE_RT="$(cookie "$TMP/rt2")"
TOKEN_RT2="$(json "$TMP/rt2" 'b.accessToken')"
check "antes: GET /api/auth/me con su token → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_RT2" "$BASE_URL/api/auth/me")" "200"
OTRO="rnf01-entrega-sec-$SUFIJO"; alta "$OTRO" secretaria >/dev/null; login "$OTRO" "$CLAVE" "$TMP/sec" >/dev/null
check "revocar con rol Secretaría → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $(json "$TMP/sec" 'b.accessToken')" "$BASE_URL/api/usuarios/$ID/revocar-sesiones")" "403"
check "revocar un usuario inexistente → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $ADMIN" "$BASE_URL/api/usuarios/00000000-0000-0000-0000-000000000000/revocar-sesiones")" "404"
sleep 1
check "revocar como Administrador → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $ADMIN" "$BASE_URL/api/usuarios/$ID/revocar-sesiones")" "204"
code="$("${CURL[@]}" -o "$TMP/me" -w '%{http_code}' -H "Authorization: Bearer $TOKEN_RT2" "$BASE_URL/api/auth/me")"
check "después: el mismo token (aún no vencido) → HTTP" "$code" "401"
check "motivo informado" "$(json "$TMP/me" 'b.motivo')" "revocada"
code="$("${CURL[@]}" -o "$TMP/env" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN_RT2" -d "{\"version\":\"$VERSION\"}" "$BASE_URL/api/consentimientos/ubicacion")"
check "después: un envío con ese token → HTTP" "$code" "401"
code="$("${CURL[@]}" -o "$TMP/ref" -w '%{http_code}' -X POST -H "Cookie: $COOKIE_RT" "$BASE_URL/api/auth/refresh")"
check "después: el refresco con su cookie → HTTP" "$code" "401"
check "mensaje del refresco" "$(json "$TMP/ref" 'b.message')" "Tu sesión fue cerrada por un Administrador. Volvé a ingresar."
check "la Secretaría no fue afectada → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $(json "$TMP/sec" 'b.accessToken')" "$BASE_URL/api/auth/me")" "200"
sleep 1
check "el RT puede volver a ingresar con su contraseña → HTTP" "$(login "$RT" "$CLAVE" "$TMP/rt3")" "200"

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

#!/usr/bin/env bash
# HU-15 / RF-01 (REQ-1794500686999) — Asociar la ECA al usuario y exponerla en la sesión.
#
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RF-01-entrega.sh
#   bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RF-01-entrega.sh --carga 200
#
# Requiere `npm run db:up` y `npm run dev`, y ADMIN_INICIAL_USUARIO / ADMIN_INICIAL_PASSWORD en el .env.
# La condición 3 y la 4 cambian la ECA y consultan las restricciones con `docker exec mant-asc-db psql`.
# Crea usuarios `hu15rf01-entrega-*` y los borra al terminar.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
SUFIJO="$$"
CLAVE="Clave-Entrega-2026"
ECA="Conservación Porteña S.R.L."

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
sql() { MSYS_NO_PATHCONV=1 docker exec -i "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1" 2>&1 | tr -d '\r'; }
if command -v docker >/dev/null 2>&1 && [ -n "$(sql 'select 1')" ]; then HAY_DB=1; fi
limpiar() { [ "$HAY_DB" -eq 1 ] && sql "delete from usuarios where usuario like 'hu15rf01-entrega-%'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(v===null?"null":v))' "$1" "$2" 2>/dev/null; }

"${CURL[@]}" -o "$TMP/admin" -X POST -H 'Content-Type: application/json' \
  -d "{\"usuario\":\"$ADMIN_USUARIO\",\"password\":\"$ADMIN_PASSWORD\"}" "$BASE_URL/api/auth/login"
ADMIN="$(json "$TMP/admin" 'b.accessToken')"
[ -n "$ADMIN" ] && [ "$ADMIN" != "null" ] || { echo "No se pudo ingresar como $ADMIN_USUARIO. ¿Corre npm run dev?"; exit 2; }

# alta CUERPO_JSON → código HTTP; respuesta en $TMP/alta.
# El cuerpo va desde un archivo: en Git Bash de Windows, los acentos pasados como argumento de curl
# viajan en la codificación de la consola y no en UTF-8 (la ECA lleva "ó" y "ñ").
alta() {
  printf '%s' "$1" > "$TMP/cuerpo.json"
  "${CURL[@]}" -o "$TMP/alta" -w '%{http_code}' -X POST -H 'Content-Type: application/json; charset=utf-8' \
    -H "Authorization: Bearer $ADMIN" --data-binary @"$TMP/cuerpo.json" "$BASE_URL/api/usuarios"
}
cuerpo() { # USUARIO ROL [ECA_JSON]
  local e=""; [ -n "${3:-}" ] && e=",\"eca\":$3"
  echo "{\"usuario\":\"hu15rf01-entrega-$1-$SUFIJO\",\"nombre\":\"Entrega\",\"rol\":\"$2\"$e,\"password\":\"$CLAVE\"}"
}
login() { "${CURL[@]}" -o "$2" -D "$2.h" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "{\"usuario\":\"$1\",\"password\":\"$CLAVE\"}" "$BASE_URL/api/auth/login"; }

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA GET /api/auth/me de un usuario ECA (el guard lee usuario y ECA de la base en cada pedido) contra $BASE_URL"
  alta "$(cuerpo carga eca "\"$ECA\"")" >/dev/null
  login "hu15rf01-entrega-carga-$SUFIJO" "$TMP/c" >/dev/null
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

echo "1. El alta exige \"eca\" para el rol eca y la rechaza para los demás"
check "rol eca sin \"eca\" → HTTP" "$(alta "$(cuerpo a eca)")" "400"
check "mensaje" "$(json "$TMP/alta" 'b.message.join(" ")' | grep -c 'eca es obligatoria para el rol eca')" "1"
check "rol eca con \"eca\" vacía → HTTP" "$(alta "$(cuerpo b eca '""')")" "400"
check "rol eca con \"eca\" de sólo espacios → HTTP" "$(alta "$(cuerpo c eca '"   "')")" "400"
check "rol eca con \"eca\" de 121 caracteres → HTTP" "$(alta "$(cuerpo d eca "\"$(printf 'x%.0s' $(seq 1 121))\"")")" "400"
check "rol eca con \"eca\" válida (con espacios sobrantes) → HTTP" "$(alta "$(cuerpo e eca "\"  $ECA  \"")")" "201"
check "la respuesta trae la ECA sin espacios sobrantes" "$(json "$TMP/alta" 'b.eca')" "$ECA"
check "la respuesta no trae el hash de la contraseña" "$(json "$TMP/alta" 'b.passwordHash')" ""
for rol in rt_calle firmante secretaria administrador; do
  check "rol $rol con \"eca\" → HTTP" "$(alta "$(cuerpo "x-$rol" "$rol" "\"$ECA\"")")" "400"
done
check "rol rt_calle sin \"eca\" → HTTP" "$(alta "$(cuerpo f rt_calle)")" "201"
check "…y su eca es null" "$(json "$TMP/alta" 'b.eca')" "null"

echo "2. Login, refresco y GET /api/auth/me devuelven la \"eca\""
U_ECA="hu15rf01-entrega-e-$SUFIJO"; U_RT="hu15rf01-entrega-f-$SUFIJO"
check "login del usuario eca → HTTP" "$(login "$U_ECA" "$TMP/le")" "200"
check "login: eca del usuario" "$(json "$TMP/le" 'b.usuario.eca')" "$ECA"
par="$(grep -i '^set-cookie: mant_refresh=' "$TMP/le.h" | tr -d '\r' | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]+).*/\1/')"
check "refresco → HTTP" "$("${CURL[@]}" -o "$TMP/re" -w '%{http_code}' -X POST -H "Cookie: $par" "$BASE_URL/api/auth/refresh")" "200"
check "refresco: eca del usuario" "$(json "$TMP/re" 'b.usuario.eca')" "$ECA"
TOKEN_E="$(json "$TMP/re" 'b.accessToken')"
check "GET /api/auth/me → HTTP" "$("${CURL[@]}" -o "$TMP/me" -w '%{http_code}' -H "Authorization: Bearer $TOKEN_E" "$BASE_URL/api/auth/me")" "200"
check "me: eca del usuario" "$(json "$TMP/me" 'b.eca')" "$ECA"
login "$U_RT" "$TMP/lr" >/dev/null
check "un usuario sin ECA (rt_calle): eca null en el login" "$(json "$TMP/lr" 'b.usuario.eca')" "null"

echo "3. La ECA se lee de la base en cada pedido: cambiarla vale en el pedido siguiente, con el mismo token"
if [ "$HAY_DB" -eq 1 ]; then
  sql "update usuarios set eca = 'Otra Conservadora S.A.' where usuario = '$U_ECA'" >/dev/null
  check "mismo token, pedido siguiente: me.eca" "$("${CURL[@]}" -H "Authorization: Bearer $TOKEN_E" "$BASE_URL/api/auth/me" | node -pe 'JSON.parse(require("fs").readFileSync(0)).eca')" "Otra Conservadora S.A."
else
  echo "  ⚠️  sin docker: no se puede cambiar la ECA en la base (cubierto por npm run test:int)"
fi

echo "4. La migración agrega la columna sin romper a los usuarios existentes"
if [ "$HAY_DB" -eq 1 ]; then
  check "migración 010_eca_en_usuarios aplicada" "$(sql "select count(*) from schema_migrations where id = '010_eca_en_usuarios'")" "1"
  check "columna usuarios.eca (text, admite NULL)" "$(sql "select data_type || '/' || is_nullable from information_schema.columns where table_name='usuarios' and column_name='eca'")" "text/YES"
  check "usuarios que no son de rol eca con ECA cargada" "$(sql "select count(*) from usuarios where rol <> 'eca' and eca is not null")" "0"
  check "el Administrador inicial sigue entrando → HTTP" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "{\"usuario\":\"$ADMIN_USUARIO\",\"password\":\"$ADMIN_PASSWORD\"}" "$BASE_URL/api/auth/login")" "200"
  r="$(sql "insert into usuarios (usuario, nombre, rol, password_hash, eca) values ('hu15rf01-entrega-mal-$SUFIJO', 'X', 'rt_calle', 'x', 'Una ECA')")"
  echo "$r" | grep -q 'usuarios_eca_solo_rol_eca' && pass "la base rechaza una ECA en un usuario que no es de rol eca" || fail "la base aceptó una ECA en un rt_calle: $r"
  r="$(sql "insert into usuarios (usuario, nombre, rol, password_hash, eca) values ('hu15rf01-entrega-mal2-$SUFIJO', 'X', 'eca', 'x', '   ')")"
  echo "$r" | grep -q 'usuarios_eca_no_vacia' && pass "la base rechaza una ECA vacía" || fail "la base aceptó una ECA vacía: $r"
else
  echo "  ⚠️  sin docker: verificación de la base omitida (cubierta por npm run test:int, auth.int-spec)"
fi

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

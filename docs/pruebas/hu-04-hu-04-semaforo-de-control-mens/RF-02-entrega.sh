#!/usr/bin/env bash
# HU-04 / RF-02 (REQ-1791910395476) — Mapa de la Secretaría con el semáforo de edificios y reasignación.
#
# Recorre las condiciones 3 y 4 (la sugerencia y la reasignación confirmada y registrada) contra el entorno
# levantado, con un login real de Secretaría:
#   bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-entrega.sh
#   bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-entrega.sh --carga 200
#
# Las condiciones 1 y 2 (el mapa, sus pines y la leyenda) son de pantalla: se verifican con la guía visual
# RF-02-semaforo-secretaria.md. Requiere `npm run db:up` y `npm run dev` (o sólo la API: BASE_URL=http://127.0.0.1:3050),
# más docker para crear los usuarios y fechar las inspecciones de prueba.
#
# Datos que deja: ninguno. Crea 1 Secretaría, 4 RT ("RF02-ent-<pid>-a..d") y 4 edificios, y los borra al terminar.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
DB_NAME="${DB_NAME:-ascensores}"
P="RF02-ent-$$"
FECHA="2026-11-25" # un pendiente está en rojo
PASSWORD="Clave-Segura-2026"

CARGA=0
if [ "${1:-}" = "--carga" ]; then CARGA="${2:-100}"; fi

CURL=(curl -s --max-time 15)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem"); fi
if curl -V | grep -qi schannel; then CURL+=(--ssl-no-revoke); fi

OK=0; FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

TMP="$(mktemp -d)"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d "$DB_NAME" -tAc "$1" 2>/dev/null; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }
IDS=()
limpiar() {
  for id in "${IDS[@]:-}"; do
    [ -n "$id" ] && sql "delete from inspecciones_checklist where consorcio_id = '$id'" >/dev/null
    [ -n "$id" ] && sql "delete from consorcios where id = '$id'" >/dev/null   # borra roles y reasignaciones en cascada
  done
  sql "delete from usuarios where usuario like '$P-%'" >/dev/null
  sql "delete from intentos_login where usuario like '$P-%'" >/dev/null
  rm -rf "$TMP"
}
trap limpiar EXIT

if [ -z "$(sql 'select 1')" ]; then echo "  ❌ no hay acceso a la base por docker ($DB_CONTAINER)"; exit 1; fi

HASH="$(cd "$REPO_ROOT" && node -e 'console.log(require("bcryptjs").hashSync(process.argv[1],4))' "$PASSWORD")"
sql "insert into usuarios (usuario, nombre, rol, password_hash) values ('$P-sec','$P-sec','secretaria','$HASH')" >/dev/null
# Con HU-02 RF-05 el contacto del RT vive en su usuario y la terna lo toma al reasignar: cada RT de prueba lo tiene.
for rt in a b c d; do sql "insert into usuarios (usuario, nombre, rol, password_hash, telefono, email) values ('$P-$rt','$P-$rt','rt_calle','sin-login','11 4444-$rt','$P-$rt@rt.com')" >/dev/null; done

edificio() { # edificio <clave> <rt> → ids en $TMP/<clave>.id y .maq
  printf '{"nombre":"%s %s","direccion":"Calle %s","maquinas":[{"referenciaAgc":"M1"}]}' "$P" "$1" "$1" > "$TMP/a.json"
  "${CURL[@]}" -o "$TMP/r.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/a.json" "$BASE_URL/api/consorcios"
  local id; id="$(json "$TMP/r.json" 'b.id')"; [ -n "$id" ] || { echo "  ❌ no se pudo crear el edificio $1 (¿están corriendo npm run db:up y npm run dev?)"; exit 1; }
  IDS+=("$id"); echo "$id" > "$TMP/$1.id"; json "$TMP/r.json" 'b.maquinas[0].id' > "$TMP/$1.maq"
  printf '{"rtCalle":{"nombre":"%s","telefono":"11 5555-0000"},"firmante":{"nombre":"Firmante","email":"f@f.com"},"eca":{"nombre":"ECA","email":"e@e.com"}}' "$2" > "$TMP/ro.json"
  "${CURL[@]}" -o /dev/null -X PUT -H 'Content-Type: application/json' -d @"$TMP/ro.json" "$BASE_URL/api/consorcios/$id/roles"
}
inspeccionado() { # inspeccionado <clave>: una inspección del 5/11
  printf '{"consorcioId":"%s","maquinaId":"%s","referenciaAgc":"M1","tipoMaquina":"traccion","estadoEquipo":"en_uso","datos":{}}' "$(cat "$TMP/$1.id")" "$(cat "$TMP/$1.maq")" > "$TMP/i.json"
  "${CURL[@]}" -o "$TMP/ir.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/i.json" "$BASE_URL/api/checklist/inspecciones"
  sql "update inspecciones_checklist set created_at='2026-11-05T10:00:00-03:00' where id='$(json "$TMP/ir.json" 'b.id')'" >/dev/null
}

printf '{"usuario":"%s-sec","password":"%s"}' "$P" "$PASSWORD" > "$TMP/login.json"
curl -s -o "$TMP/login-resp.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/login.json" "$BASE_URL/api/auth/login"
TOKEN="$(json "$TMP/login-resp.json" 'b.accessToken')"
[ -n "$TOKEN" ] || { echo "  ❌ no se pudo ingresar como Secretaría (¿DATABASE_APP_PASSWORD y AUTH_JWT_SECRET definidas?)"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"
CURL_SIN_SESION=("${CURL[@]}")   # para comprobar el 401
CURL+=(-H "$AUTH")                  # el resto va con la sesión (el RLS estricto la pide en todas las rutas con datos)

# R: el edificio en rojo, del RT "a". "b" tiene 2 pendientes; "c", 1 pendiente y 1 inspeccionado (no pesa); "d", ninguno.
edificio R "$P-a"; edificio B1 "$P-b"; edificio B2 "$P-b"; edificio C1 "$P-c"; edificio C2 "$P-c"; inspeccionado C2
R="$(cat "$TMP/R.id")"



if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA sugerencias (GET …/reasignacion/sugerencia) con 5 edificios y 4 RT de prueba"
  fallidas=0; : > "$TMP/tiempos"
  for _ in $(seq 1 "$CARGA"); do
    out="$("${CURL[@]}" -o /dev/null -w '%{http_code} %{time_total}' -H "$AUTH" "$BASE_URL/api/semaforo/$R/reasignacion/sugerencia?fecha=$FECHA")"
    [ "${out%% *}" = "200" ] || fallidas=$((fallidas + 1)); echo "${out##* }" >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v f="$fallidas" '{ t[NR] = $1; s += $1 } END { p95 = t[int(NR*0.95) > 0 ? int(NR*0.95) : 1]; printf "  consultas: %d · fallidas: %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n", n, f, s/NR*1000, p95*1000, t[NR]*1000 }'
  [ "$fallidas" -eq 0 ]; exit $?
fi

echo "== HU-04 / RF-02 contra $BASE_URL"
echo "3. En un edificio en rojo, «Reasignar» sugiere al RT de Calle con menos edificios pendientes del mes"
code="$("${CURL[@]}" -o "$TMP/sug.json" -w '%{http_code}' -H "$AUTH" "$BASE_URL/api/semaforo/$R/reasignacion/sugerencia?fecha=$FECHA")"
mios="$(json "$TMP/sug.json" 'b.candidatos.filter(c=>c.usuario.startsWith("'"$P"'-")).map(c=>c.usuario.slice(-1)+":"+c.pendientes).join(",")')"
[ "$code" = "200" ] && [ "$mios" = "d:0,c:1,b:2" ] && pass "HTTP $code · candidatos (RT:pendientes): $mios · el actual (a) no figura" || fail "HTTP $code · candidatos: '$mios' (se esperaba d:0,c:1,b:2)"
[ "$(json "$TMP/sug.json" 'b.sugerido.usuario')" = "$(json "$TMP/sug.json" 'b.candidatos[0].usuario')" ] && [ "$(json "$TMP/sug.json" 'b.sugerido.pendientes')" = "0" ] \
  && pass "sugerido: $(json "$TMP/sug.json" 'b.sugerido.usuario') con 0 pendientes (el de menos carga)" || fail "el sugerido no es el de menos carga: $(json "$TMP/sug.json" 'b.sugerido')"
# El de "c" tiene 2 edificios pero 1 inspeccionado: pesa 1, no 2.
[ "$(json "$TMP/sug.json" 'b.candidatos.find(c=>c.usuario==="'"$P"'-c").pendientes')" = "1" ] && pass "un edificio ya inspeccionado no cuenta como carga (c: 2 edificios, 1 pendiente)" || fail "c no pesa 1"

echo "   y sugerir no cambia nada"
[ "$(sql "select rt_calle_nombre from roles_edificio where consorcio_id='$R'")" = "$P-a" ] && [ "$(sql "select count(*) from reasignaciones_rt where consorcio_id='$R'")" = "0" ] \
  && pass "tras sugerir, el RT sigue siendo a y no hay registros" || fail "sugerir modificó algo"

echo "4. La reasignación se aplica recién cuando la Secretaría la confirma, y queda registrada"
printf '{"fecha":"%s","rtAnterior":"%s-a","rtNuevo":"%s-d","usuario":"otra.persona"}' "$FECHA" "$P" "$P" > "$TMP/conf.json"
code="$("${CURL[@]}" -o "$TMP/conf-resp.json" -w '%{http_code}' -X POST -H "$AUTH" -H 'Content-Type: application/json' -d @"$TMP/conf.json" "$BASE_URL/api/semaforo/$R/reasignacion")"
[ "$code" = "201" ] && pass "al confirmar → HTTP $code" || fail "al confirmar → HTTP $code: $(cat "$TMP/conf-resp.json")"
reg="$(sql "select usuario||'|'||rt_anterior||'|'||rt_nuevo||'|'||(fecha > now() - interval '1 minute')::text from reasignaciones_rt where consorcio_id='$R'")"
[ "$reg" = "$P-sec|$P-a|$P-d|true" ] && pass "registro en la base: usuario $P-sec (de la sesión, no del cuerpo), anterior …-a, nuevo …-d, fecha de hace menos de 1 minuto" || fail "registro: '$reg'"
rt="$(sql "select rt_calle_nombre||'|'||coalesce(rt_calle_telefono,'∅')||'|'||coalesce(rt_calle_email,'∅') from roles_edificio where consorcio_id='$R'")"
[ "$rt" = "$P-d|11 4444-d|$P-d@rt.com" ] && pass "el edificio pasó al RT nuevo y la terna tiene el contacto del RT nuevo (no el del anterior)" || fail "terna: '$rt'"
"${CURL[@]}" -o "$TMP/sem.json" "$BASE_URL/api/semaforo?fecha=$FECHA"
[ "$(json "$TMP/sem.json" 'b.edificios.find(e=>e.id==="'"$R"'").rtCalle.nombre')" = "$P-d" ] && pass "el semáforo ya muestra al RT nuevo" || fail "el semáforo no refleja el cambio"
"${CURL[@]}" -o "$TMP/hist.json" -H "$AUTH" "$BASE_URL/api/semaforo/$R/reasignaciones"
[ "$(json "$TMP/hist.json" 'b.length+"|"+b[0].usuario+"|"+b[0].rtAnterior.slice(-1)+"|"+b[0].rtNuevo.slice(-1)')" = "1|$P-sec|a|d" ] && pass "el historial por la API devuelve el registro" || fail "historial: $(cat "$TMP/hist.json")"

echo "   y lo que se rechaza"
code="$("${CURL[@]}" -o "$TMP/x.json" -w '%{http_code}' -X POST -H "$AUTH" -H 'Content-Type: application/json' -d "{\"fecha\":\"$FECHA\",\"rtAnterior\":\"$P-a\",\"rtNuevo\":\"$P-b\"}" "$BASE_URL/api/semaforo/$R/reasignacion")"
[ "$code" = "409" ] && pass "con la vista vieja (el RT ya no es a) → HTTP $code" || fail "vista vieja → HTTP $code"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H "$AUTH" -H 'Content-Type: application/json' -d "{\"fecha\":\"2026-11-15\",\"rtAnterior\":\"$P-d\",\"rtNuevo\":\"$P-b\"}" "$BASE_URL/api/semaforo/$R/reasignacion")"
[ "$code" = "409" ] && pass "un edificio que no está en rojo (15/11, amarillo) → HTTP $code" || fail "no rojo → HTTP $code"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H "$AUTH" -H 'Content-Type: application/json' -d "{\"fecha\":\"$FECHA\",\"rtAnterior\":\"$P-d\",\"rtNuevo\":\"$P-sec\"}" "$BASE_URL/api/semaforo/$R/reasignacion")"
[ "$code" = "400" ] && pass "un RT nuevo que no es RT de Calle (la Secretaría) → HTTP $code" || fail "RT inválido → HTTP $code"
code="$("${CURL_SIN_SESION[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/semaforo/$R/reasignacion/sugerencia?fecha=$FECHA")"
[ "$code" = "401" ] && pass "sin sesión → HTTP $code" || fail "sin sesión → HTTP $code"
[ "$(sql "select count(*) from reasignaciones_rt where consorcio_id='$R'")" = "1" ] && pass "los rechazos no dejaron registros (sigue 1)" || fail "los rechazos dejaron registros"

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

#!/usr/bin/env bash
# HU-06 / RF-07 — Canal en tiempo real de fallas críticas con sesión.
#
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-07-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Registra una falla crítica de demostración (queda en la memoria de la API hasta que se reinicia). Crea usuarios temporales (el Firmante
# «gonza», dueño de las máquinas de demostración, otro Firmante, un RT y una ECA) y los borra al terminar; si ya existe un usuario «gonza»,
# se detiene sin tocarlo. BASE_URL por defecto http://127.0.0.1:3050.
#
# El corte periódico del canal (criterio 4) dura 5 minutos: para verlo acá, levantá la API con CANAL_FALLAS_VIGENCIA_SEG=3 y corré el
# script con VERIFICAR_CORTE=3. Sin eso se prueba lo otro del criterio 4 (una sesión revocada no vuelve a entrar) y el corte lo prueban
# canal-sesion.e2e-spec (con 1 segundo) y config.spec. Lo que hace la pantalla (criterio 5) se prueba en las pruebas de la web y a mano:
# ver RF-07-entrega.md.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
VERIFICAR_CORTE="${VERIFICAR_CORTE:-}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
TMP="$(mktemp -d)"
VIDA=25   # segundos que como mucho queda abierto cada canal de la prueba (curl lo cierra solo)
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
# http <token|-> <metodo> <ruta> [curl extra...] → código en $CODE, cuerpo en $TMP/r.json
http() { local t="$1" m="$2" r="$3"; shift 3; local auth=(); [ "$t" != "-" ] && auth=(-H "Authorization: Bearer $t"); CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$m" "${auth[@]}" "$@" "$BASE_URL$r")"; }
JSONH=(-H 'Content-Type: application/json')
PIDS=()
# abrir <nombre> <token|-> → abre el canal en segundo plano: las cabeceras quedan en $TMP/<nombre>.h y los eventos en $TMP/<nombre>.sse
abrir() { local n="$1" t="$2" auth=(); [ "$t" != "-" ] && auth=(-H "Authorization: Bearer $t"); : > "$TMP/$n.sse"; curl -s -N -m "$VIDA" -D "$TMP/$n.h" -o "$TMP/$n.sse" -H 'Accept: text/event-stream' "${auth[@]}" "$BASE_URL/api/fallas-criticas/eventos" & PIDS+=($!); }
# esperar <archivo> <texto> [segundos] → 0 si el texto aparece en el archivo
esperar() { local i; for i in $(seq 1 $(( ${3:-5} * 10 ))); do grep -qF -e "$2" "$1" 2>/dev/null && return 0; sleep 0.1; done; return 1; }
estado() { esperar "$TMP/$1.h" "HTTP/" 5 >/dev/null; awk 'NR==1{print $2}' "$TMP/$1.h" | tr -d '\r'; }
es_flujo() { grep -qi '^content-type: text/event-stream' "$TMP/$1.h" 2>/dev/null; }
limpiar() { kill "${PIDS[@]}" 2>/dev/null; sql "delete from usuarios where usuario in ('gonza') or usuario like 'h07s-%'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

echo "== HU-06 / RF-07 contra $BASE_URL"
[ "$(sql "select count(*) from usuarios where lower(usuario)='gonza'")" = "0" ] || { echo "  ❌ ya existe un usuario «gonza» en la base: el script no lo toca. Usá una base de demostración."; trap - EXIT; rm -rf "$TMP"; exit 1; }
HASH="$(cd "$RAIZ" && node -e 'console.log(require("bcryptjs").hashSync("Demo-Clave-2026",4))')"
sql "insert into usuarios (usuario, nombre, rol, eca, password_hash) values
  ('gonza','Gonza Firmante','firmante',null,'$HASH'),
  ('h07s-otro','Otro Firmante','firmante',null,'$HASH'),
  ('h07s-rt','RT','rt_calle',null,'$HASH'),
  ('h07s-eca','ECA','eca','Conservación Porteña S.R.L.','$HASH')" >/dev/null
GON="$(login gonza)"; OTR="$(login h07s-otro)"; RT="$(login h07s-rt)"; ECA="$(login h07s-eca)"; SEC="$(login demo.secretaria)"; ADM="$(login demo.admin)"
for t in "$GON" "$OTR" "$RT" "$ECA" "$SEC" "$ADM"; do
  { [ -n "$t" ] && [ "$t" != "undefined" ]; } || { echo "  ❌ no pude ingresar con algún usuario: corré antes RF-02-datos-demo.sh"; exit 1; }
done

echo "1. Criterio 1: sin sesión, 401 (y no llega ningún evento)"
abrir sinsesion -; abrir inventado "token.inventado.x"
S1="$(estado sinsesion)"; S2="$(estado inventado)"
[ "$S1" = "401" ] && ! es_flujo sinsesion && pass "sin sesión el canal responde 401 y no abre ningún flujo de eventos" || fail "sin sesión → $S1 (flujo: $(es_flujo sinsesion && echo sí || echo no))"
[ "$S2" = "401" ] && ! es_flujo inventado && pass "con un token inventado también da 401" || fail "token inventado → $S2"

echo "2. Criterio 2: la Secretaría, el Administrador y el Firmante entran; el RT y la ECA, 403"
abrir sec "$SEC"; abrir adm "$ADM"; abrir gon "$GON"; abrir otro "$OTR"; abrir rt "$RT"; abrir eca "$ECA"
MAL=""; for n in sec adm gon otro; do { [ "$(estado $n)" = "200" ] && es_flujo $n; } || MAL="$MAL [$n → $(estado $n)]"; done
[ -z "$MAL" ] && pass "la Secretaría, el Administrador y dos Firmantes abren el canal (200, flujo de eventos)" || fail "los que deben entrar:$MAL"
R1="$(estado rt)"; R2="$(estado eca)"
{ [ "$R1" = "403" ] && [ "$R2" = "403" ] && ! es_flujo rt && ! es_flujo eca; } && pass "el RT y la ECA reciben 403 y no abren ningún flujo" || fail "RT → $R1, ECA → $R2"

echo "3. Criterio 3: el Firmante recibe solo lo de sus edificios"
http "$RT" POST /api/fallas-criticas/informes "${JSONH[@]}" -d '{"maquinaId":"MAQ-CORRIENTES-M1","fallasCriticas":["BOTON_PARE_FALLA"],"observaciones":"prueba del canal RF-07"}'
ID="$(json "$TMP/r.json" 'b.informe.id')"
{ [ "$CODE" = "201" ] && [ -n "$ID" ] && [ "$ID" != "undefined" ]; } || { fail "no pude registrar la falla crítica de prueba → $CODE $(head -c 200 "$TMP/r.json")"; exit 1; }
MAL=""; for n in sec adm gon; do esperar "$TMP/$n.sse" "event: falla-critica" 5 && grep -qF "$ID" "$TMP/$n.sse" || MAL="$MAL [$n]"; done
[ -z "$MAL" ] && pass "la Secretaría, el Administrador y «gonza» (el Firmante de esa máquina) reciben la falla crítica por el canal" || fail "no la recibieron:$MAL"
sleep 1
grep -qF "falla-critica" "$TMP/otro.sse" && fail "el otro Firmante (sin esa máquina) recibió la falla crítica de un edificio que no es suyo" || pass "el otro Firmante no recibe nada de un edificio que no es suyo"
http "$SEC" POST "/api/fallas-criticas/informes/$ID/abrir" "${JSONH[@]}" -d '{}'
MAL=""; for n in sec adm gon; do esperar "$TMP/$n.sse" "event: falla-abierta" 5 || MAL="$MAL [$n]"; done
[ -z "$MAL" ] && pass "al abrir la alerta, la apertura llega a quienes ven esa alerta" || fail "no recibieron la apertura:$MAL"
sleep 1
grep -qF "falla-abierta" "$TMP/otro.sse" && fail "el otro Firmante recibió la apertura de una alerta que no es suya" || pass "el otro Firmante tampoco recibe la apertura"

echo "4. Criterio 4: el corte periódico y la sesión revocada"
OTR_ID="$(sql "select id from usuarios where usuario='h07s-otro'")"
http "$ADM" POST "/api/usuarios/$OTR_ID/revocar-sesiones" "${JSONH[@]}" -d '{}'
[ "$CODE" = "204" ] || fail "no pude revocar las sesiones del otro Firmante → $CODE"
abrir revocada "$OTR"
[ "$(estado revocada)" = "401" ] && ! es_flujo revocada && pass "con la sesión revocada por el Administrador el canal responde 401: al reabrirlo no entra" || fail "sesión revocada → $(estado revocada)"
if [ -n "$VERIFICAR_CORTE" ]; then
  abrir corte "$SEC"; PIDC="${PIDS[$((${#PIDS[@]}-1))]}"
  INICIO="$(date +%s.%N)"; wait "$PIDC" 2>/dev/null; RC=$?; FIN="$(date +%s.%N)"
  DUR="$(node -e 'console.log((process.argv[2]-process.argv[1]).toFixed(1))' "$INICIO" "$FIN")"
  { [ "$RC" = "0" ] && node -e 'process.exit(process.argv[1] >= Number(process.argv[2]) - 0.5 && process.argv[1] <= Number(process.argv[2]) + 3 ? 0 : 1)' "$DUR" "$VERIFICAR_CORTE"; } && pass "el servidor cerró el canal solo a los $DUR s (la API se levantó con CANAL_FALLAS_VIGENCIA_SEG=$VERIFICAR_CORTE)" || fail "el canal duró $DUR s y curl terminó con código $RC (se esperaba un cierre del servidor a los ~$VERIFICAR_CORTE s)"
else
  echo "   (corte periódico omitido: para verlo, levantá la API con CANAL_FALLAS_VIGENCIA_SEG=3 y corré con VERIFICAR_CORTE=3)"
fi

echo "5. Criterio 5 (pantalla): las pruebas de la web"
if command -v npx >/dev/null 2>&1; then
  RES="$(cd "$RAIZ/apps/web" && npx vitest run src/fallas 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Tests ')"
  echo "$RES" | grep -q "failed" && fail "pruebas del canal en la web: $RES" || { [ -n "$RES" ] && pass "pruebas del canal y de las alertas en la web en verde ($(echo "$RES" | xargs))" || fail "no pude correr las pruebas de la web"; }
else
  echo "   (sin npx: no se corrieron las pruebas de la web)"
fi

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

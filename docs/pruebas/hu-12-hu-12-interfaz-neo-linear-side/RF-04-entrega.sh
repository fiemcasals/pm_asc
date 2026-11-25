#!/usr/bin/env bash
# HU-12 / RF-04 — Retirar la telemetría de «Estado del sistema» y dejar el mapa sin conexión en su pestaña.
#
#   BASE_URL=https://localhost:8050 bash docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-04-entrega.sh
#
# Requiere la API y la web levantadas (npm run dev, BASE_URL por defecto https://localhost:8050) y los datos de demostración
# (bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh). No crea ni modifica datos.
# Lo que se VE en pantalla (criterios 1, 2 y 3) se recorre a mano: ver RF-04-entrega.md; acá se comprueba lo que se puede comprobar sin navegador.

set -u
BASE_URL="${BASE_URL:-https://localhost:8050}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
CURL=(curl -s --max-time 10)
if echo "$BASE_URL" | grep -qE '^https://(localhost|127\.0\.0\.1)(:|/)'; then CURL+=(-k); fi
if curl -V | grep -qi schannel; then CURL+=(--ssl-no-revoke); fi
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2"; }

echo "== HU-12 / RF-04 contra $BASE_URL"

echo "1. Criterio 4: GET /api/health responde igual que antes"
CODE="$("${CURL[@]}" -o "$TMP/health.json" -w '%{http_code}' "$BASE_URL/api/health")"
if [ "$CODE" = "200" ] && [ "$(json "$TMP/health.json" 'b.status')" = "ok" ] && [ "$(json "$TMP/health.json" 'b.api')" = "ok" ] && [ "$(json "$TMP/health.json" 'b.db.status')" = "ok" ] && [ -n "$(json "$TMP/health.json" 'b.db.postgis')" ]; then
  pass "200 con status ok, api ok, db ok y la versión de PostGIS ($(json "$TMP/health.json" 'b.db.postgis'))"
else
  fail "health → $CODE $(head -c 200 "$TMP/health.json")"
fi

echo "2. Criterios 1 y 4: en el código de la web no queda nada de las tarjetas de telemetría"
# Se excluyen las pruebas, que nombran estos textos justamente para comprobar que ya no están.
RESTOS="$(cd "$RAIZ/apps/web/src" && grep -rnE "Estado del [Ss]istema|estado-api|estado-db|estado-sw|BACKEND · NESTJS|MODO OFFLINE · PWA|INTERFAZ · NEO LINEAR|Rama experimental local|neo-bento-(section|grid|card|row|value|sub)|useServiceWorkerState|SW_LABEL|tab-sistema|IconSistema" --include=*.ts --include=*.tsx --include=*.css . | grep -v "\.test\.ts" )"
[ -z "$RESTOS" ] && pass "ni el encabezado, ni las 4 tarjetas, ni su estilo, ni el estado del service worker que las alimentaba" || fail "quedan restos: $(echo "$RESTOS" | head -3 | cut -c1-200)"
if grep -qE "fetchHealth" "$RAIZ/apps/web/src/App.tsx" && grep -qE "IndicadorEstado" "$RAIZ/apps/web/src/App.tsx"; then
  pass "el estado de la API se sigue leyendo, pero solo para el indicador «API + PostGIS OK» del pie del menú"
else
  fail "App.tsx no lee la salud de la API para el indicador"
fi

echo "3. Criterios 2 y 3: las pruebas de la web (pestaña «Mapa sin conexión», buscador, indicador y panel del mapa)"
if command -v npx >/dev/null 2>&1; then
  RES="$(cd "$RAIZ/apps/web" && npx vitest run src/ui src/health src/mapa 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Tests ')"
  echo "$RES" | grep -q "failed" && fail "pruebas de la web: $RES" || { [ -n "$RES" ] && pass "pruebas de la web en verde ($(echo "$RES" | xargs))" || fail "no pude correr las pruebas de la web"; }
else
  echo "   (sin npx: no se corrieron las pruebas de la web)"
fi

echo "4. Criterio 5: las guías de HU-12 RF-01, HU-16 RF-03 y RO-01 RF-01 ya no describen la pantalla retirada como si existiera"
# Una mención al «Estado del sistema» solo vale si dice que se retiró / cómo se llamaba antes.
MAL=""
for f in docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-01-entrega.md docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-01-interfaz-neo-buscador.md docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-03-entrega.md docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-03-mapa-sin-conexion.md docs/pruebas/ro-01-ro-01-setup-del-proyecto-y-ent/RF-01-entrega.md docs/pruebas/ro-01-ro-01-setup-del-proyecto-y-ent/RF-01-setup-entorno.md; do
  LINEAS="$(grep -nE "Estado del [Ss]istema|tab-sistema" "$RAIZ/$f" | grep -vE "retir|antes|anterior|HU-12 RF-04|ya no existe|hoy retirada|se veía" )"
  [ -n "$LINEAS" ] && MAL="$MAL [$f: $(echo "$LINEAS" | head -1 | cut -c1-110)]"
done
[ -z "$MAL" ] && pass "cada mención que queda dice que la pantalla se retiró o cómo se llamaba antes" || fail "menciones sin aclarar:$MAL"
bash "$AQUI/RF-01-entrega.sh" >"$TMP/rf01.txt" 2>&1 && pass "el script de entrega de HU-12 RF-01 sigue pasando ($(grep -E '^Resultado' "$TMP/rf01.txt"))" || fail "el script de HU-12 RF-01 falla: $(grep -E '❌|Resultado' "$TMP/rf01.txt" | head -2 | tr '\n' ' ')"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

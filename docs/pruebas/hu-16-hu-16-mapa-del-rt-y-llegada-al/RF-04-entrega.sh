#!/usr/bin/env bash
# HU-16 / RF-04 — Componente de mapa con pines por estado, zoom y nombres que no se pisan.
#
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-04-entrega.sh
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-04-entrega.sh --carga 20
#
# El componente no cambia ninguna API ni pantalla por sí solo (las pantallas lo usan desde RF-05), así que este script
# comprueba lo que se puede comprobar sin un navegador: las pruebas de su lógica, que compila, que la web se arma y que el
# mapa base está disponible. El comportamiento en pantalla (zoom, etiquetas, teclado, tema, edición, celular sin conexión) se
# verificó con Playwright y está en RF-04-guia-visual.md.
# Con --carga N repite N veces la compilación de la web y mide cuánto tarda.

set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then
  CARGA="$2"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB="$REPO_ROOT/apps/web"
TMP="$(mktemp -d)"
OK=0; KO=0; OMITIDOS=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
omit() { echo "  ⏭️  $1"; OMITIDOS=$((OMITIDOS+1)); }
trap 'rm -rf "$TMP"' EXIT

echo "== HU-16 / RF-04 (componente de mapa de edificios)"

echo "1. La lógica del mapa: pruebas, proyección sin distorsión y prioridad de etiquetas (Criterios 2 y 4)"
if (cd "$WEB" && npx vitest run src/mapa/marcadores.test.ts > "$TMP/vitest.log" 2>&1); then
  pass "marcadores.test.ts: $(sed 's/\x1b\[[0-9;]*m//g' "$TMP/vitest.log" | grep -E '^ +Tests ' | sed 's/^ *//')"
else
  fail "fallaron las pruebas de la lógica del mapa: $(tail -8 "$TMP/vitest.log")"
fi

echo "2. Compila y la web se arma (Criterios 1 y 8)"
if (cd "$WEB" && npx tsc --noEmit > "$TMP/tsc.log" 2>&1); then pass "la web compila sin errores de tipos"; else fail "errores de tipos: $(head -3 "$TMP/tsc.log")"; fi
INICIO="$(date +%s%N)"
if (cd "$REPO_ROOT" && npm run build --workspace=@mant-asc/web > "$TMP/build.log" 2>&1); then
  pass "la web se arma en $(( ($(date +%s%N) - INICIO) / 1000000 )) ms ($(sed 's/\x1b\[[0-9;]*m//g' "$TMP/build.log" | grep -E 'precache' | sed 's/^ *//'))"
else
  fail "no se armó la web: $(tail -6 "$TMP/build.log")"
fi

echo "3. El mapa base que dibuja el componente está disponible (Criterios 1 y 8)"
PMTILES="$WEB/public/mapa/caba.pmtiles"
if [ -f "$PMTILES" ]; then
  pass "caba.pmtiles presente ($(( $(wc -c < "$PMTILES") / 1048576 )) MB)"
else
  omit "falta caba.pmtiles: generarlo con «npm run mapa:generar» (necesita internet, no está en git)"
fi
for archivo in "public/mapa/fuentes/Noto Sans Medium/0-255.pbf"; do
  [ -f "$WEB/$archivo" ] && pass "la tipografía de las etiquetas está en la app: $archivo" || fail "falta $archivo (las etiquetas no se dibujarían sin conexión)"
done

echo "4. El componente no pide ubicación al dispositivo (Criterio 8)"
if grep -rEq 'navigator\??\.geolocation|getCurrentPosition|watchPosition|GeolocateControl' "$WEB/src/mapa/MapaEdificios.tsx" "$WEB/src/mapa/marcadores.ts"; then
  fail "el componente usa geolocalización"
else
  pass "ni MapaEdificios ni marcadores.ts usan geolocalización"
fi

if [ "$CARGA" -gt 0 ]; then
  echo
  echo "== Prueba de carga: $CARGA corridas de las pruebas de la lógica del mapa"
  FALLOS=0; MAX_MS=0; TOTAL_MS=0
  for _ in $(seq 1 "$CARGA"); do
    T0="$(date +%s%N)"
    (cd "$WEB" && npx vitest run src/mapa/marcadores.test.ts > /dev/null 2>&1) || FALLOS=$((FALLOS + 1))
    DT=$(( ($(date +%s%N) - T0) / 1000000 ))
    TOTAL_MS=$((TOTAL_MS + DT)); [ "$DT" -gt "$MAX_MS" ] && MAX_MS="$DT"
  done
  echo "  Corridas: $CARGA | Fallos: $FALLOS | Promedio: $((TOTAL_MS / CARGA)) ms | Más lenta: ${MAX_MS} ms"
  [ "$FALLOS" = "0" ] && pass "carga: $CARGA corridas, 0 fallos" || fail "carga con $FALLOS fallos"
fi

echo
echo "Resultado: $OK ok, $KO con error, $OMITIDOS omitidos"
[ "$KO" -eq 0 ]

#!/usr/bin/env bash
# HU-16 / RF-05 — Usar el mapa nuevo en las pantallas y retirar el dibujo anterior.
#
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-05-entrega.sh
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-05-entrega.sh --carga 20
#
# Comprueba lo que se puede comprobar sin un navegador: que no queda nada del dibujo anterior, que las pantallas usan el
# componente nuevo, que el Mapa del RT guarda y recupera sus datos, que no hay geolocalización nueva, y que la web compila y se
# arma. El aspecto de cada pantalla (escritorio y celular de 360 px, y el celular sin conexión) está en RF-05-guia-visual.md.
# Con --carga N repite N veces las pruebas del Mapa del RT y mide cuánto tardan.

set -u
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then
  CARGA="$2"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB="$REPO_ROOT/apps/web"
GUIA="$REPO_ROOT/docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al"
TMP="$(mktemp -d)"
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
trap 'rm -rf "$TMP"' EXIT

echo "== HU-16 / RF-05 (mapa nuevo en las pantallas)"

echo "1. No queda nada del dibujo anterior (Criterio 1)"
RESTOS="$(grep -rnE 'MapaUbicacionConsorcio|Av\. Rivadavia|Av\. 9 de Julio|Av\. Cabildo / Santa Fe' "$WEB/src" || true)"
if [ -z "$RESTOS" ] && [ ! -f "$WEB/src/consorcios/MapaUbicacionConsorcio.tsx" ]; then
  pass "ninguna referencia a MapaUbicacionConsorcio ni a las avenidas dibujadas a mano, y el archivo ya no existe"
else
  fail "quedan referencias: $RESTOS"
fi

echo "2. Las pantallas usan el componente nuevo (Criterio 1)"
for archivo in consorcios/FichaConsorcio.tsx:2 consorcios/FormularioConsorcio.tsx:1 consorcios/SecretariaView.tsx:2 semaforo/SemaforoView.tsx:1 rtmapa/MapaRtView.tsx:1; do
  f="${archivo%%:*}"; esperados="${archivo##*:}"
  n="$(grep -c '<MapaEdificios' "$WEB/src/$f")"
  [ "$n" = "$esperados" ] && pass "$f usa <MapaEdificios> $n vez/veces" || fail "$f: se esperaban $esperados usos y hay $n"
done

echo "3. El Mapa del RT guarda y recupera sus datos sin conexión (Criterio 3)"
if (cd "$WEB" && npx vitest run src/rtmapa > "$TMP/rt.log" 2>&1); then
  pass "pruebas del Mapa del RT: $(sed 's/\x1b\[[0-9;]*m//g' "$TMP/rt.log" | grep -E '^ +Tests ' | sed 's/^ *//')"
else
  fail "fallaron las pruebas del Mapa del RT: $(tail -8 "$TMP/rt.log")"
fi

echo "4. El Semáforo conserva su leyenda y su nota (Criterio 4)"
grep -q 'El mapa muestra solamente edificios: no hay seguimiento de técnicos en vivo' "$WEB/src/semaforo/SemaforoView.tsx" \
  && pass "la nota «El mapa muestra solamente edificios: no hay seguimiento de técnicos en vivo» sigue ahí" || fail "falta la nota del Semáforo"
if (cd "$WEB" && npx vitest run src/semaforo > "$TMP/sem.log" 2>&1); then
  pass "pruebas del Semáforo: $(sed 's/\x1b\[[0-9;]*m//g' "$TMP/sem.log" | grep -E '^ +Tests ' | sed 's/^ *//')"
else
  fail "fallaron las pruebas del Semáforo: $(tail -6 "$TMP/sem.log")"
fi

echo "5. Ninguna geolocalización nueva (Criterio 5)"
USOS="$(grep -rlE 'navigator\??\.geolocation|\.getCurrentPosition\s*\(' "$WEB/src" --include=*.ts --include=*.tsx | grep -v '\.test\.' | sed "s|$WEB/src/||")"
if [ "$USOS" = "auth/ubicacion.ts" ] && (cd "$WEB" && npx vitest run src/auth/ubicacion.test.ts > "$TMP/ubi.log" 2>&1); then
  pass "sólo auth/ubicacion.ts toma la ubicación, y ubicacion.test.ts sigue en verde"
else
  fail "lectores de ubicación: $USOS · $(tail -4 "$TMP/ubi.log" 2>/dev/null)"
fi

echo "6. Compila, se arma y toda la web pasa (Criterio 2)"
if (cd "$WEB" && npx tsc --noEmit > "$TMP/tsc.log" 2>&1); then pass "la web compila sin errores de tipos"; else fail "errores de tipos: $(head -3 "$TMP/tsc.log")"; fi
if (cd "$REPO_ROOT" && npm run build --workspace=@mant-asc/web > "$TMP/build.log" 2>&1); then pass "la web se arma"; else fail "no se armó: $(tail -6 "$TMP/build.log")"; fi
if (cd "$WEB" && npx vitest run > "$TMP/todo.log" 2>&1); then
  pass "toda la web: $(sed 's/\x1b\[[0-9;]*m//g' "$TMP/todo.log" | grep -E '^ +Tests ' | sed 's/^ *//')"
else
  fail "fallaron pruebas de la web: $(sed 's/\x1b\[[0-9;]*m//g' "$TMP/todo.log" | grep -E 'FAIL|✗|×' | head -5)"
fi

echo "7. La guía visual tiene las capturas de las cinco pantallas, en escritorio y celular (Criterio 6)"
FALTAN=""
for pantalla in ficha-lectura ficha-edicion alta-consorcio secretaria-vista-mapa secretaria-monitoreo semaforo mapa-rt; do
  for medida in escritorio celular; do [ -f "$GUIA/imagenes/RF-05-$pantalla-$medida.png" ] || FALTAN="$FALTAN RF-05-$pantalla-$medida.png"; done
done
[ -f "$GUIA/imagenes/RF-05-mapa-rt-sin-conexion-celular.png" ] || FALTAN="$FALTAN RF-05-mapa-rt-sin-conexion-celular.png"
[ -z "$FALTAN" ] && pass "las 15 capturas están en imagenes/" || fail "faltan:$FALTAN"

if [ "$CARGA" -gt 0 ]; then
  echo
  echo "== Prueba de carga: $CARGA corridas de las pruebas del Mapa del RT"
  FALLOS=0; MAX_MS=0; TOTAL_MS=0
  for _ in $(seq 1 "$CARGA"); do
    T0="$(date +%s%N)"
    (cd "$WEB" && npx vitest run src/rtmapa > /dev/null 2>&1) || FALLOS=$((FALLOS + 1))
    DT=$(( ($(date +%s%N) - T0) / 1000000 ))
    TOTAL_MS=$((TOTAL_MS + DT)); [ "$DT" -gt "$MAX_MS" ] && MAX_MS="$DT"
  done
  echo "  Corridas: $CARGA | Fallos: $FALLOS | Promedio: $((TOTAL_MS / CARGA)) ms | Más lenta: ${MAX_MS} ms"
  [ "$FALLOS" = "0" ] && pass "carga: $CARGA corridas, 0 fallos" || fail "carga con $FALLOS fallos"
fi

echo
echo "Resultado: $OK ok, $KO con error"
[ "$KO" -eq 0 ]

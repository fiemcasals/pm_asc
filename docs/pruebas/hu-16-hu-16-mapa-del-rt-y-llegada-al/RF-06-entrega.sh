#!/usr/bin/env bash
# HU-16 / RF-06 — Que los mapas se vean: el archivo del mapa va con el sitio y la app avisa cuando falta.
#
#   BASE_URL=https://localhost:8050 bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-06-entrega.sh
#   BASE_URL=https://<el sitio desplegado> SOLO_SITIO=1 bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-06-entrega.sh   # solo lo que se pide al sitio
#
# Requiere la web levantada en BASE_URL (npm run dev, por defecto https://localhost:8050). No crea ni modifica datos y no necesita sesión: el
# archivo del mapa es estático. Con SOLO_SITIO=1 se saltean las comprobaciones del repositorio local y de las pruebas (sirve para correrlo
# contra el sitio desplegado). Lo que se VE en pantalla (los seis mapas y el cartel) está en RF-06-entrega.md.

set -u
BASE_URL="${BASE_URL:-https://localhost:8050}"
SOLO_SITIO="${SOLO_SITIO:-}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
ARCHIVO="$RAIZ/apps/web/public/mapa/caba.pmtiles"
RUTA_GIT="apps/web/public/mapa/caba.pmtiles"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
CURL=(curl -s --max-time 30)
if echo "$BASE_URL" | grep -qE '^https://(localhost|127\.0\.0\.1)(:|/)'; then CURL+=(-k); fi
if curl -V | grep -qi schannel; then CURL+=(--ssl-no-revoke); fi

echo "== HU-16 / RF-06 contra $BASE_URL"

if [ -z "$SOLO_SITIO" ]; then
  echo "1. Criterio 1: el archivo del mapa está en el repositorio, entero y sin que git le cambie nada"
  if [ -n "$(cd "$RAIZ" && git ls-files "$RUTA_GIT")" ]; then pass "git lo versiona ($RUTA_GIT)"; else fail "git no lo versiona: ¿sigue en el .gitignore?"; fi
  if [ -f "$ARCHIVO" ]; then
    BYTES="$(wc -c < "$ARCHIVO" | tr -d ' ')"
    [ "$BYTES" -gt 1048576 ] && [ "$BYTES" -le 62914560 ] && pass "pesa $(node -e 'console.log((process.argv[1]/1048576).toFixed(2))' "$BYTES") MB (entre 1 y 60 MB)" || fail "pesa $BYTES bytes: fuera de lo esperado"
    CAB="$(node -e '
      const b=require("fs").readFileSync(process.argv[1]).subarray(0,127);const g=(o)=>(b.readInt32LE(o)/1e7).toFixed(3);
      console.log([b.subarray(0,7).toString("latin1"),b[7],b[100],b[101],g(102),g(110),g(106),g(114)].join(" "))' "$ARCHIVO")"
    [ "$CAB" = "PMTiles 3 0 15 -58.535 -58.335 -34.705 -34.525" ] && pass "es un PMTiles v3, zoom 0 a 15, con el recuadro de CABA" || fail "cabecera inesperada: $CAB"
    EN_GIT="$(cd "$RAIZ" && git ls-files -s "$RUTA_GIT" | awk '{print $2}')"; EN_DISCO="$(cd "$RAIZ" && git hash-object "$RUTA_GIT")"
    [ -n "$EN_GIT" ] && [ "$EN_GIT" = "$EN_DISCO" ] && pass "lo que está en git es idéntico al archivo (mismo hash $EN_GIT: no se le cambiaron bytes)" || fail "el archivo difiere de lo que tiene git ($EN_GIT ≠ $EN_DISCO)"
  else
    fail "no existe $ARCHIVO"
  fi
fi

echo "2. Criterios 1 y 5: el sitio sirve el archivo por rangos"
CODIGO="$("${CURL[@]}" -o "$TMP/rango.bin" -D "$TMP/rango.h" -w '%{http_code}' -H 'Range: bytes=0-6' "$BASE_URL/mapa/caba.pmtiles")"
TIPO="$(grep -i '^content-type:' "$TMP/rango.h" | head -1 | tr -d '\r' | cut -d' ' -f2-)"
INICIO="$(head -c 7 "$TMP/rango.bin")"
if [ "$CODIGO" = "206" ] && [ "$INICIO" = "PMTiles" ]; then pass "pidiendo los primeros 7 bytes responde 206 y empieza con «PMTiles» (content-type: ${TIPO:-sin dato})"
else fail "respuesta $CODIGO, empieza con «$(echo "$INICIO" | tr -dc '[:print:]' | cut -c1-20)», content-type ${TIPO:-sin dato}: ¿el servidor responde su página en lugar del archivo?"; fi
TOTAL="$(grep -i '^content-range:' "$TMP/rango.h" | head -1 | tr -d '\r' | sed 's#.*/##')"
if [ -z "$SOLO_SITIO" ] && [ -f "$ARCHIVO" ]; then
  [ -n "$TOTAL" ] && [ "$TOTAL" = "$(wc -c < "$ARCHIVO" | tr -d ' ')" ] && pass "el tamaño que informa el servidor ($TOTAL bytes) es el del archivo del repositorio" || fail "el servidor informa $TOTAL bytes y el archivo local pesa $(wc -c < "$ARCHIVO" | tr -d ' ')"
elif [ -n "$TOTAL" ] && [ "$TOTAL" -gt 1048576 ]; then pass "el servidor informa un archivo de $TOTAL bytes"
else fail "el servidor no informa el tamaño del archivo (content-range)"; fi
CODIGO2="$("${CURL[@]}" -o "$TMP/fin.bin" -w '%{http_code}' -H 'Range: bytes=1000-1999' "$BASE_URL/mapa/caba.pmtiles")"
[ "$CODIGO2" = "206" ] && [ "$(wc -c < "$TMP/fin.bin" | tr -d ' ')" = "1000" ] && pass "un rango del medio del archivo también responde 206, con sus 1000 bytes" || fail "rango del medio → $CODIGO2 ($(wc -c < "$TMP/fin.bin" | tr -d ' ') bytes)"

echo "3. Las tipografías y los íconos del mapa se sirven (no una página)"
MAL=""
for p in "/mapa/sprites/dark.json" "/mapa/sprites/dark.png" "/mapa/sprites/light.json" "/mapa/fuentes/Noto%20Sans%20Regular/0-255.pbf" "/mapa/fuentes/Noto%20Sans%20Medium/0-255.pbf"; do
  R="$("${CURL[@]}" -o /dev/null -w '%{http_code} %{content_type}' "$BASE_URL$p")"
  case "$R" in 200\ text/html*) MAL="$MAL [$p → página]";; 200\ *) ;; *) MAL="$MAL [$p → $R]";; esac
done
[ -z "$MAL" ] && pass "los 5 archivos de muestra responden 200 con su contenido" || fail "no se sirven bien:$MAL"

if [ -z "$SOLO_SITIO" ]; then
  echo "4. Criterio 3: las pruebas de la web (la comprobación del archivo, el cartel y la descarga)"
  if command -v npx >/dev/null 2>&1; then
    RES="$(cd "$RAIZ/apps/web" && npx vitest run src/mapa 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Test Files|Tests ')"
    echo "$RES" | grep -q "failed" && fail "pruebas del mapa en la web: $RES" || { [ -n "$RES" ] && pass "pruebas del mapa en la web en verde ($(echo "$RES" | tr '
' ' ' | xargs))" || fail "no pude correr las pruebas de la web"; }
  else
    echo "   (sin npx: no se corrieron las pruebas de la web)"
  fi

  echo "5. Criterio 4: las guías dejaron de decir que el archivo no va al repositorio"
  VIEJO="$(cd "$RAIZ" && grep -rnE "no está en git|no va (a|al) (git|repositorio)|NO va al repositorio|No está en git" README.md docs scripts apps/web/src --include=*.md --include=*.mjs --include=*.ts --include=*.tsx --include=*.sh 2>/dev/null | grep -v "RF-06" | head -3)"
  [ -z "$VIEJO" ] && pass "ninguna guía ni comentario conserva la receta vieja" || fail "quedan menciones: $(echo "$VIEJO" | cut -c1-160 | head -1)"
fi

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

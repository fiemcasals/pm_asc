#!/usr/bin/env bash
# HU-16 / RF-03 (REQ-1795097971049) — Mapa base de CABA propio, que se dibuja sin conexión.
#
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-03-entrega.sh                  # verifica el archivo, lo que entrega la app y el estilo
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-03-entrega.sh --regenerar      # antes, vuelve a generar el mapa (npm run mapa:generar, ~1 minuto, necesita Internet)
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-03-entrega.sh --carga 100      # además, pide 100 rangos del archivo al servidor y mide
#
# Requiere `npm run dev` (la web en https://localhost:8050). El archivo apps/web/public/mapa/caba.pmtiles NO está en git:
# si falta, viene en el repositorio (git pull) o se genera con `npm run mapa:generar`. Lo que se ve en el navegador (descarga, sin conexión) está en RF-03-mapa-sin-conexion.md.

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
ARCHIVO="$RAIZ/apps/web/public/mapa/caba.pmtiles"
LIMITE_MB=60

REGENERAR=0
CARGA=0
while [ $# -gt 0 ]; do
  case "$1" in
    --regenerar) REGENERAR=1; shift ;;
    --carga) CARGA="${2:-100}"; shift 2 ;;
    *) echo "Argumento desconocido: $1"; exit 2 ;;
  esac
done

CURL=(curl -s --max-time 20)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem"); fi
if curl -V | grep -qi schannel; then CURL+=(--ssl-no-revoke); fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }

if [ "$REGENERAR" -eq 1 ]; then
  echo "== Regenerando el mapa de CABA (npm run mapa:generar)"
  (cd "$RAIZ" && npm run mapa:generar 2>&1 | tail -6) || { echo "No se pudo generar el mapa"; exit 2; }
fi

echo "== HU-16 / RF-03 contra $BASE_URL"

echo "1. El archivo del mapa de CABA"
if [ ! -f "$ARCHIVO" ]; then
  fail "no existe $ARCHIVO: viene en el repositorio (git pull) o se genera con «npm run mapa:generar»"
  echo; echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"; exit 1
fi
(cd "$RAIZ" && node --input-type=module -e '
import { readFileSync } from "node:fs";
import { PMTiles } from "pmtiles";
const buf = readFileSync(process.argv[1]);
const fuente = { getKey: () => "f", getBytes: async (o, l) => { const t = buf.subarray(o, o + l); return { data: t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength) }; } };
const m = new PMTiles(fuente);
const h = await m.getHeader();
const meta = await m.getMetadata();
console.log(JSON.stringify({ tipo: h.tileType, min: h.minZoom, max: h.maxZoom, oeste: h.minLon, sur: h.minLat, este: h.maxLon, norte: h.maxLat, bytes: buf.length, build: meta.build, atribucion: String(meta.attribution || "") }));
' "$ARCHIVO") > "$TMP/cab.json" 2>"$TMP/cab.err" || { fail "no se pudo leer el archivo: $(head -c 200 "$TMP/cab.err")"; }
if [ -s "$TMP/cab.json" ]; then
  BYTES="$(json "$TMP/cab.json" 'b.bytes')"
  MB="$(node -e 'console.log((process.argv[1]/1048576).toFixed(2))' "$BYTES")"
  [ "$BYTES" -le $((LIMITE_MB * 1048576)) ] && pass "pesa $MB MB (el límite es $LIMITE_MB MB)" || fail "pesa $MB MB y el límite es $LIMITE_MB MB: bajá el zoom máximo con --maxzoom 14"
  [ "$(json "$TMP/cab.json" 'b.tipo')" = "1" ] && pass "son mosaicos vectoriales (MVT)" || fail "no son mosaicos vectoriales"
  [ "$(json "$TMP/cab.json" 'b.min+"-"+b.max')" = "0-15" ] && pass "zoom de 0 a 15" || fail "zoom $(json "$TMP/cab.json" 'b.min+"-"+b.max'), se esperaba 0-15"
  [ "$(json "$TMP/cab.json" 'b.oeste.toFixed(3)+","+b.sur.toFixed(3)+","+b.este.toFixed(3)+","+b.norte.toFixed(3)')" = "-58.535,-34.705,-58.335,-34.525" ] && pass "el recuadro es el de CABA (-58.535,-34.705,-58.335,-34.525)" || fail "recuadro distinto del de CABA"
  [ -n "$(json "$TMP/cab.json" 'b.build')" ] && pass "registra de qué compilación de Protomaps sale: $(json "$TMP/cab.json" 'b.build')" || fail "no registra la compilación de origen"
  json "$TMP/cab.json" 'b.atribucion' | grep -q "OpenStreetMap" && pass "la atribución de OpenStreetMap viaja en el propio archivo" || fail "falta la atribución de OpenStreetMap en el archivo"
fi

echo "2. Lo que entrega la app (sin pedirle nada a terceros)"
c="$("${CURL[@]}" -o "$TMP/rango.bin" -w '%{http_code}' -H 'Range: bytes=0-126' "$BASE_URL/mapa/caba.pmtiles")"
[ "$c" = "206" ] && [ "$(head -c 7 "$TMP/rango.bin")" = "PMTiles" ] && pass "pedido por rangos (bytes 0-126) → HTTP 206 y empieza con «PMTiles»" || fail "rango → HTTP $c"
largo="$("${CURL[@]}" -I "$BASE_URL/mapa/caba.pmtiles" | grep -i '^content-length' | tr -dc '0-9')"
[ "$largo" = "${BYTES:-x}" ] && pass "el servidor informa el mismo tamaño que el archivo ($largo bytes)" || fail "tamaño informado '$largo', archivo '${BYTES:-?}'"
MAL=""
for f in "Noto%20Sans%20Regular" "Noto%20Sans%20Medium" "Noto%20Sans%20Italic"; do
  for r in 0-255 256-511 8192-8447; do
    c="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/mapa/fuentes/$f/$r.pbf")"; [ "$c" = "200" ] || MAL="$MAL [$f/$r → $c]"
  done
done
[ -z "$MAL" ] && pass "las 9 tipografías (3 tipos × 3 rangos de caracteres) → HTTP 200" || fail "tipografías:$MAL"
MAL=""
for t in light dark; do
  for s in "$t.json" "$t.png" "$t@2x.json" "$t@2x.png"; do
    c="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/mapa/sprites/$s")"; [ "$c" = "200" ] || MAL="$MAL [$s → $c]"
  done
done
[ -z "$MAL" ] && pass "los íconos de los dos temas (8 archivos) → HTTP 200" || fail "íconos:$MAL"

echo "3. El estilo del mapa y la descarga (tests de la web)"
(cd "$RAIZ" && npx vitest run --root apps/web src/mapa 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests ") > "$TMP/vitest.txt"
grep -q "failed" "$TMP/vitest.txt" && fail "tests del mapa: $(tr '\n' ' ' < "$TMP/vitest.txt")" || pass "tests del mapa: $(grep 'Tests ' "$TMP/vitest.txt" | sed 's/^ *//')"

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA pedidos de rangos de 16 KB al azar dentro del archivo"
  : > "$TMP/t"; fallidos=0
  for _ in $(seq 1 "$CARGA"); do
    ini=$(( (RANDOM * 32768 + RANDOM) % (BYTES - 16384) ))
    s="$(date +%s%N)"
    c="$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Range: bytes=$ini-$((ini + 16383))" "$BASE_URL/mapa/caba.pmtiles")"
    [ "$c" = "206" ] || fallidos=$((fallidos + 1))
    echo $(( ($(date +%s%N) - s) / 1000000 )) >> "$TMP/t"
  done
  sort -n "$TMP/t" | awk -v n="$CARGA" -v f="$fallidos" '{ t[NR]=$1; s+=$1 } END { p=t[int(n*0.95)]; if(p=="")p=t[n]; printf "  pedidos: %d · fallidos: %d · promedio: %d ms · p95: %d ms · el más lento: %d ms\n", n, f, s/n, p, t[n] }'
  [ "$fallidos" -eq 0 ] || FALLAS=$((FALLAS + 1))
fi

echo
echo "== Resultado: $OK verificaciones OK, $FALLAS fallidas"
[ "$FALLAS" -eq 0 ]

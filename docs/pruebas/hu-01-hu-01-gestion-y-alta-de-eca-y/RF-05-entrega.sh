#!/usr/bin/env bash
# HU-01 / RF-05 (REQ-1794493998460) — Datos operativos del edificio y del equipo para la calle.
#
# Verifica encargado, lista de pisos, punto geográfico PostGIS (y exclusión en /mapa cuando falta),
# tipo de máquina ('traccion' | 'hidraulico' | 'montavehiculos') y sala compartida.
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-05-entrega.sh
#   bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-05-entrega.sh --carga 20

set -u

BASE_URL="${BASE_URL:-https://localhost:8050}"
CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-20}"
fi

CURL=(curl -s --max-time 10)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
elif echo "$BASE_URL" | grep -qE '^https://(localhost|127\.0\.0\.1)(:|/)'; then
  CURL+=(-k)
fi
if curl -V | grep -qi schannel; then
  CURL+=(--ssl-no-revoke)
fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

TMP="$(mktemp -d)"
IDS_LIMPIAR=()
cleanup() {
  for id in "${IDS_LIMPIAR[@]}"; do
    "${CURL[@]}" -X DELETE "$BASE_URL/api/consorcios/$id" >/dev/null 2>&1 || true
  done
  rm -rf "$TMP"
}
trap cleanup EXIT

json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v===undefined||v===null?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }

if [ "$CARGA" -gt 0 ]; then
  echo "== Modo carga: $CARGA consultas consecutivas de mapa PostGIS contra $BASE_URL"
  errores=0
  : > "$TMP/tiempos"
  for n in $(seq 1 "$CARGA"); do
    inicio="$(date +%s%N)"
    code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE_URL/api/consorcios/mapa")"
    if [ "$code" != "200" ]; then
      errores=$((errores + 1))
    fi
    echo $(( ($(date +%s%N) - inicio) / 1000000 )) >> "$TMP/tiempos"
  done
  sort -n "$TMP/tiempos" | awk -v n="$CARGA" -v e="$errores" '
    { t[NR] = $1; s += $1 }
    END {
      p95 = t[int(NR * 0.95) > 0 ? int(NR * 0.95) : 1]
      printf "  corridas: %d · fallas HTTP != 200: %d · promedio: %.0f ms · p95: %.0f ms · más lenta: %.0f ms\n",
             n, e, s / NR, p95, t[NR]
    }'
  [ "$errores" -eq 0 ]
  exit $?
fi

echo "== HU-01 / RF-05 contra $BASE_URL"

echo "1. Alta de consorcio completo (encargado, pisos, punto PostGIS, tipos y sala compartida)"
c_geo="$("${CURL[@]}" -o "$TMP/geo.json" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" \
  -H 'Content-Type: application/json' \
  -d '{
    "nombre": "Consorcio RF05 Con Mapa",
    "direccion": "Av. Rivadavia 4500, CABA",
    "encargado": { "nombre": "Carlos Gómez", "telefono": "11-5555-6666" },
    "pisos": ["SS", "PB", "1", "2", "3"],
    "ubicacion": { "latitud": -34.6145, "longitud": -58.4312 },
    "maquinas": [
      { "referenciaAgc": "M1", "descripcion": "Principal", "tipo": "traccion", "salaCompartidaId": "sala-principal" },
      { "referenciaAgc": "M2", "descripcion": "Montacargas", "tipo": "hidraulico", "salaCompartidaId": "sala-principal" },
      { "referenciaAgc": "M3", "descripcion": "Vehículos", "tipo": "montavehiculos", "salaCompartidaId": null }
    ]
  }')"
id_geo="$(json "$TMP/geo.json" 'b.id')"
[ -n "$id_geo" ] && IDS_LIMPIAR+=("$id_geo")

if [ "$c_geo" = "201" ] && [ -n "$id_geo" ] && [ "$(json "$TMP/geo.json" 'b.encargado?.telefono')" = "11-5555-6666" ] && [ "$(json "$TMP/geo.json" 'b.maquinas?.length')" = "3" ]; then
  pass "Edificio con datos operativos, PostGIS y tipos de equipo creado ($id_geo)"
else
  fail "Error creando edificio con mapa (HTTP $c_geo · tel=$(json "$TMP/geo.json" 'b.encargado?.telefono') · maq=$(json "$TMP/geo.json" 'b.maquinas?.length'))"
fi

echo "2. Alta de consorcio sin ubicación geográfica"
c_sin="$("${CURL[@]}" -o "$TMP/singeo.json" -w '%{http_code}' -X POST "$BASE_URL/api/consorcios" \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Consorcio RF05 Sin Mapa","direccion":"Calle Sin Geo 100"}')"
id_sin="$(json "$TMP/singeo.json" 'b.id')"
[ -n "$id_sin" ] && IDS_LIMPIAR+=("$id_sin")

if [ "$c_sin" = "201" ] && [ -z "$(json "$TMP/singeo.json" 'b.ubicacion')" ]; then
  pass "Edificio sin ubicación creado con ubicacion=null ($id_sin)"
else
  fail "Error creando edificio sin ubicación (HTTP $c_sin)"
fi

echo "3. Endpoint /api/consorcios/mapa incluye edificio con ubicación y excluye al edificio sin ubicación"
c_mapa="$("${CURL[@]}" -o "$TMP/mapa.json" -w '%{http_code}' "$BASE_URL/api/consorcios/mapa")"
tiene_geo="$(json "$TMP/mapa.json" "b.some(x => x.id === '$id_geo')")"
tiene_sin="$(json "$TMP/mapa.json" "b.some(x => x.id === '$id_sin')")"
if [ "$c_mapa" = "200" ] && [ "$tiene_geo" = "true" ] && [ "$tiene_sin" = "false" ]; then
  pass "Mapa excluye consorcios sin ubicación e incluye los georreferenciados"
else
  fail "Mapa falló: HTTP=$c_mapa tiene_geo=$tiene_geo tiene_sin=$tiene_sin"
fi

echo "4. Edición operativa vía PUT /api/consorcios/:id"
c_put="$("${CURL[@]}" -o "$TMP/put.json" -w '%{http_code}' -X PUT "$BASE_URL/api/consorcios/$id_sin" \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Consorcio RF05 Sin Mapa","direccion":"Calle Sin Geo 100","encargado":{"nombre":"Marta Encargada","telefono":"11-4000-9999"},"pisos":["PB","1"],"ubicacion":{"latitud":-34.602,"longitud":-58.384},"maquinas":[]}')"
if [ "$c_put" = "200" ] && [ "$(json "$TMP/put.json" 'b.encargado?.nombre')" = "Marta Encargada" ]; then
  pass "Edición operativa persistida y reflejada correctamente"
else
  fail "Error en PUT /api/consorcios/$id_sin (HTTP $c_put)"
fi

echo ""
echo "Resultado: $OK OK · $FALLAS fallas"
[ "$FALLAS" -eq 0 ]

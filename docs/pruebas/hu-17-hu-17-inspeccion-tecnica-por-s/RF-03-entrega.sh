#!/usr/bin/env bash
# HU-17 / RF-03 — Reporte de parada de un equipo fuera de servicio (API).
#
#   bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-03-entrega.sh
#
# Requiere la API levantada (npm run dev) y los datos demo de HU-04 (RF-02-datos-demo.sh crea demo.secretaria y demo.admin). Los reportes son datos
# EN MEMORIA de la API: el de esta prueba queda hasta que se reinicie la API (Ctrl+C y de nuevo npm run dev). Corré el script una sola vez por
# arranque. BASE_URL por defecto http://127.0.0.1:3050.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
SEC="$(login demo.secretaria)"
[ -n "$SEC" ] && [ "$SEC" != "undefined" ] || { echo "  ❌ no pude ingresar como demo.secretaria: corré antes RF-02-datos-demo.sh"; exit 1; }
post() { printf '%s' "$2" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $SEC" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$1")"; }
FOTO='data:image/jpeg;base64,AAAA'; M=MAQ-CALLAO-M1

echo "== HU-17 / RF-03 contra $BASE_URL"
echo "1. «Guardar Reporte de Parada» exige causa y al menos una foto"
post /api/paradas "{\"maquinaId\":\"$M\",\"fotos\":[\"$FOTO\"]}";               [ "$CODE" = "400" ] && pass "sin causa → 400" || fail "sin causa → $CODE"
post /api/paradas "{\"maquinaId\":\"$M\",\"causa\":\"   \",\"fotos\":[\"$FOTO\"]}"; [ "$CODE" = "400" ] && pass "causa en blanco → 400" || fail "causa en blanco → $CODE"
post /api/paradas "{\"maquinaId\":\"$M\",\"causa\":\"Sin energía\",\"fotos\":[]}";  [ "$CODE" = "400" ] && pass "sin fotos → 400" || fail "sin fotos → $CODE"

echo "2. Al guardar, el equipo queda Fuera de Servicio — Pendiente de confirmación y se avisa a la Secretaría y al Firmante"
post /api/paradas "{\"maquinaId\":\"$M\",\"causa\":\"Cabina trabada entre el 2.º y el 3.º\",\"fotos\":[\"$FOTO\"]}"
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.estado')" = "Fuera de Servicio — Pendiente de confirmación" ] && pass "201 y estado «Fuera de Servicio — Pendiente de confirmación»" || fail "guardar → $CODE $(head -c 200 "$TMP/r.json")"
[ "$(json "$TMP/r.json" 'b.avisadoA[0]+"|"+b.avisadoA[1].split(":")[0]')" = "secretaria|firmante" ] && pass "avisado a la Secretaría y al Firmante" || fail "avisos: $(json "$TMP/r.json" 'JSON.stringify(b.avisadoA)')"
curl -s -o "$TMP/l2.json" -H "Authorization: Bearer $SEC" "$BASE_URL/api/paradas"
[ "$(json "$TMP/l2.json" 'b.length+"|"+b[0].maquinaId+"|"+b[0].fotos')" = "1|$M|1" ] && pass "la Secretaría ve el reporte pendiente (con la cantidad de fotos, sin las imágenes)" || fail "lista: $(head -c 200 "$TMP/l2.json")"
post /api/paradas "{\"maquinaId\":\"$M\",\"causa\":\"otra vez\",\"fotos\":[\"$FOTO\"]}"
[ "$CODE" = "409" ] && pass "un segundo reporte del mismo equipo pendiente → 409" || fail "segundo reporte → $CODE"
post /api/paradas "{\"maquinaId\":\"NO-EXISTE\",\"causa\":\"x\",\"fotos\":[\"$FOTO\"]}"
[ "$CODE" = "404" ] && pass "una máquina que no existe → 404" || fail "máquina inexistente → $CODE"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/paradas")"
[ "$CODE" = "401" ] && pass "sin sesión → 401" || fail "sin sesión → $CODE"

echo; echo "Recordá: reiniciá la API para dejar los equipos de ejemplo como estaban."
echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

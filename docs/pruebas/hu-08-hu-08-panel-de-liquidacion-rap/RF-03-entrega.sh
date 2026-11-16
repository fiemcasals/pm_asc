#!/usr/bin/env bash
# HU-08 / RF-03 — El Firmante rechaza un informe (vuelve a la Secretaría) y tiene 5 días hábiles para autorizarlo.
#
#   bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-03-entrega.sh
#
# Requiere la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos demo de HU-04
# (bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh, que crea demo.secretaria).
# OJO: los informes del Firmante son datos de ejemplo EN MEMORIA de la API: el rechazo de esta prueba queda hasta que se
# reinicie la API (Ctrl+C y de nuevo npm run dev). Corré el script una sola vez por arranque.
# BASE_URL por defecto http://127.0.0.1:3050.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
printf '{"usuario":"demo.secretaria","password":"Demo-Clave-2026"}' > "$TMP/l.json"
curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"
SEC="$(json "$TMP/lr.json" 'b.accessToken')"
[ -n "$SEC" ] && [ "$SEC" != "undefined" ] || { echo "  ❌ no pude ingresar como demo.secretaria: corré antes RF-02-datos-demo.sh"; exit 1; }
post() { printf '%s' "$2" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'x-user-name: gonza' -d @"$TMP/b.json" "$BASE_URL$1")"; }
bandeja() { CODE="$(curl -s -o "$TMP/bandeja.json" -w '%{http_code}' -H "Authorization: Bearer $SEC" "$BASE_URL/api/firmante/bandeja-secretaria")"; }
M=MAQ-SANTAFE-M1

echo "== HU-08 / RF-03 contra $BASE_URL"
echo "1. El Firmante rechaza un informe con motivo obligatorio"
post /api/firmante/rechazar "{\"maquinaId\":\"$M\"}"
[ "$CODE" = "400" ] && pass "sin motivo → 400" || fail "sin motivo → $CODE"
post /api/firmante/rechazar "{\"maquinaId\":\"$M\",\"motivo\":\"   \"}"
[ "$CODE" = "400" ] && pass "motivo de sólo espacios → 400" || fail "motivo en blanco → $CODE"
post /api/firmante/rechazar "{\"maquinaId\":\"$M\",\"motivo\":\"La foto de cables no se ve\"}"
[ "$CODE" = "200" ] && [ "$(json "$TMP/r.json" 'b.rechazo.rechazadoPor')" = "gonza" ] && pass "con motivo → 200, a nombre de gonza" || fail "con motivo → $CODE $(cat "$TMP/r.json")"

echo "2. Vuelve a la bandeja de la Secretaría, con el motivo"
bandeja
[ "$CODE" = "200" ] && [ "$(json "$TMP/bandeja.json" 'b.rechazados.length+"|"+b.rechazados[0].maquinaId+"|"+b.rechazados[0].motivo')" = "1|$M|La foto de cables no se ve" ] && pass "la bandeja muestra el informe rechazado y su motivo" || fail "bandeja: $(head -c 300 "$TMP/bandeja.json")"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/firmante/bandeja-secretaria")"
[ "$CODE" = "401" ] && pass "sin sesión la bandeja responde 401" || fail "bandeja sin sesión → $CODE"

echo "3. Un informe rechazado ya no se autoriza ni se vuelve a rechazar"
post /api/firmante/autorizar "{\"maquinaId\":\"$M\"}"
[ "$CODE" = "409" ] && pass "autorizar un informe rechazado → 409" || fail "autorizar rechazado → $CODE"
post /api/firmante/rechazar "{\"maquinaId\":\"$M\",\"motivo\":\"otra vez\"}"
[ "$CODE" = "409" ] && pass "rechazarlo de nuevo → 409" || fail "rechazar de nuevo → $CODE"

echo "4. Más de 5 días hábiles sin autorizar: aviso a la Secretaría, una sola vez"
bandeja
N1="$(json "$TMP/bandeja.json" 'b.avisosPlazo.length')"
[ "$N1" -ge 1 ] && pass "hay $N1 aviso(s) de plazo vencido (los informes de ejemplo son del 4 y 5 de noviembre)" || fail "sin avisos: $(head -c 300 "$TMP/bandeja.json")"
[ "$(json "$TMP/bandeja.json" 'b.avisosPlazo.every(a=>a.diasHabiles>5)')" = "true" ] && pass "todos con más de 5 días hábiles" || fail "algún aviso con 5 días o menos"
[ "$(json "$TMP/bandeja.json" 'b.avisosPlazo.some(a=>a.maquinaId==="'$M'")')" = "false" ] && pass "el informe rechazado a tiempo no genera aviso" || fail "el informe rechazado tiene aviso"
cp "$TMP/bandeja.json" "$TMP/primera.json"; bandeja
[ "$(json "$TMP/bandeja.json" 'JSON.stringify(b.avisosPlazo)')" = "$(json "$TMP/primera.json" 'JSON.stringify(b.avisosPlazo)')" ] && pass "al abrir la bandeja otra vez los avisos son los mismos (no se repiten)" || fail "los avisos cambiaron"

echo; echo "Recordá: reiniciá la API para dejar los informes de ejemplo como estaban."
echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

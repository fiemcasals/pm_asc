#!/usr/bin/env bash
# HU-02 / RF-03 — Un guardado de la terna no pisa una asignación más nueva.
#
#   bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-03-entrega.sh
#
# Requiere `npm run db:up`, la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos demo de
# HU-04: bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh. Entra como demo.secretaria.
# Usa el edificio «DEMO Corrientes 100» y le deja la terna como estaba. BASE_URL por defecto http://127.0.0.1:3050.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"demo.secretaria","password":"Demo-Clave-2026"}' > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
TOKEN="$(login)"; [ -n "$TOKEN" ] && [ "$TOKEN" != "undefined" ] || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
api() { # api <metodo> <ruta> [cuerpo] → $CODE y $TMP/r.json
  if [ -n "${3:-}" ]; then printf '%s' "$3" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$2")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer $TOKEN" "$BASE_URL$2")"; fi
}
terna() { printf '{"rtCalle":{"nombre":"%s","telefono":"%s"},"firmante":{"nombre":"Firmante Demo","email":"f@demo.com"},"eca":{"nombre":"ECA Demo","email":"e@demo.com"}%s}' "$1" "$2" "${3:-}"; }

echo "== HU-02 / RF-03 contra $BASE_URL"
api GET /api/consorcios; ID="$(json "$TMP/r.json" 'b.find(c=>c.nombre==="DEMO Corrientes 100").id')"
[ -n "$ID" ] && [ "$ID" != "undefined" ] || { echo "  ❌ falta el edificio DEMO Corrientes 100"; exit 1; }
api GET "/api/consorcios/$ID/roles"; INICIAL="$(json "$TMP/r.json" 'b.actualizadoEn')"; RT_INICIAL="$(json "$TMP/r.json" 'b.rtCalle.nombre')"; TEL_INICIAL="$(json "$TMP/r.json" 'b.rtCalle.telefono')"

echo "1. Dos personas abren la misma terna; la segunda en guardar recibe un aviso en vez de pisar a la primera"
api PUT "/api/consorcios/$ID/roles" "$(terna rt.carla '11 9999-0000' ",\"actualizadoEn\":\"$INICIAL\"")"
[ "$CODE" = "200" ] && pass "la primera persona guarda con la versión que leyó → 200" || fail "primera persona → $CODE $(cat "$TMP/r.json")"
api PUT "/api/consorcios/$ID/roles" "$(terna rt.diego '11 8888-0000' ",\"actualizadoEn\":\"$INICIAL\"")"
[ "$CODE" = "409" ] && pass "la segunda, con la versión vieja → 409" || fail "segunda persona → $CODE"
[ "$(json "$TMP/r.json" 'b.vigente.rtCalle.nombre')" = "rt.carla" ] && pass "el 409 trae la versión vigente (RT rt.carla, la de la primera persona)" || fail "vigente: $(cat "$TMP/r.json")"
VIGENTE="$(json "$TMP/r.json" 'b.vigente.actualizadoEn')"
api GET "/api/consorcios/$ID/roles"
[ "$(json "$TMP/r.json" 'b.rtCalle.nombre')" = "rt.carla" ] && pass "la terna guardada no cambió: sigue la de la primera persona" || fail "la terna cambió"

echo "2. Con la versión vigente, guardar funciona; y sin mandar la versión también (como antes)"
api PUT "/api/consorcios/$ID/roles" "$(terna rt.diego '11 8888-0000' ",\"actualizadoEn\":\"$VIGENTE\"")"
[ "$CODE" = "200" ] && pass "con la versión vigente → 200" || fail "con la vigente → $CODE"
api PUT "/api/consorcios/$ID/roles" "$(terna "$RT_INICIAL" "$TEL_INICIAL")"
[ "$CODE" = "200" ] && pass "sin actualizadoEn guarda como siempre → 200 (terna devuelta a como estaba)" || fail "sin versión → $CODE"

echo; echo "Falta la parte de pantalla (la guía RF-03-terna-sin-pisar.md, pasos 3 a 6)."
echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

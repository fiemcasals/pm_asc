#!/usr/bin/env bash
# HU-11 / RF-06 — El link del aviso abre el informe sin contraseña, con token imposible de adivinar y vencimiento a los 7 días.
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-06-entrega.sh
#
# Requiere la API levantada (npm run dev con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demostración:
# bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# Entra como demo.secretaria. El vencimiento a los 7 días no se puede esperar en una corrida: lo prueban los tests con reloj
# simulado (apps/api/test/avisos-enlace.spec.ts e informe-aviso.e2e-spec.ts); acá se verifica la fecha de vencimiento informada.
# BASE_URL por defecto http://127.0.0.1:3050 (la API directa).

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
http() { # http <token|-> <metodo> <ruta> [cuerpo] → código en $CODE, cuerpo en $TMP/r.json
  local auth=(); [ "$1" != "-" ] && auth=(-H "Authorization: Bearer $1")
  if [ -n "${4:-}" ]; then printf '%s' "$4" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" "${auth[@]}" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" "${auth[@]}" "$BASE_URL$3")"; fi
}
# Pide una página sin sesión: código en $CODE, cuerpo en $TMP/p.html, encabezados en $TMP/h.txt
pagina() { CODE="$(curl -s -D "$TMP/h.txt" -o "$TMP/p.html" -w '%{http_code}' "$BASE_URL$1")"; }

echo "== HU-11 / RF-06 contra $BASE_URL"
SEC="$(login demo.secretaria)"
{ [ -n "$SEC" ] && [ "$SEC" != "undefined" ]; } || { echo "  ❌ no pude ingresar: corré antes RF-02-datos-demo.sh"; exit 1; }
http - POST /api/fallas-criticas/informes '{"maquinaId":"MAQ-CORRIENTES-M1","inspector":"rt1","fallasCriticas":["BOTON_PARE_FALLA"],"observaciones":"Pulsador trabado en planta baja"}'
ID="$(json "$TMP/r.json" 'b.informe.id')"
http "$SEC" POST "/api/avisos/$ID/aprobar" '{}'
ENLACE="$(json "$TMP/r.json" 'b.enlace')"
VENCE="$(json "$TMP/r.json" 'b.enlaceVenceEn')"
RUTA="/api/informe-aviso/${ENLACE##*/}"
TOKEN="${ENLACE##*/}"
[ "$CODE" = "201" ] && [ -n "$TOKEN" ] && pass "aviso aprobado; el aviso trae su enlace" || { fail "aprobar → $CODE $(head -c 200 "$TMP/r.json")"; exit 1; }

echo "1. El enlace abre el informe sin iniciar sesión"
pagina "$RUTA"
[ "$CODE" = "200" ] && grep -q "Pulsador trabado en planta baja" "$TMP/p.html" && grep -q "Av. Corrientes 1234" "$TMP/p.html" && pass "GET sin sesión → 200 con el informe (equipo, edificio y observaciones)" || fail "enlace → $CODE"
grep -qi "cache-control: no-store" "$TMP/h.txt" && grep -qi "x-robots-tag: noindex" "$TMP/h.txt" && grep -qi "referrer-policy: no-referrer" "$TMP/h.txt" && pass "no se cachea, no se indexa y no se filtra por el Referer" || fail "encabezados: $(cat "$TMP/h.txt")"

echo "2. El token es aleatorio de 128 bits o más; uno inexistente o alterado responde 404 sin revelar nada"
[ "${#TOKEN}" = "43" ] && pass "el token tiene 43 caracteres base64url (256 bits)" || fail "token de ${#TOKEN} caracteres"
ULTIMO="${TOKEN: -1}"; OTRO="A"; [ "$ULTIMO" = "A" ] && OTRO="B"
pagina "/api/informe-aviso/${TOKEN%?}$OTRO"
[ "$CODE" = "404" ] && grep -q "El enlace no es válido" "$TMP/p.html" && ! grep -q "Corrientes" "$TMP/p.html" && pass "token alterado → 404 sin datos" || fail "alterado → $CODE"
pagina "/api/informe-aviso/$(printf 'A%.0s' $(seq 1 43))"
[ "$CODE" = "404" ] && pass "token inexistente → 404" || fail "inexistente → $CODE"
pagina "/api/informe-aviso/ALT-MAICON-001"
[ "$CODE" = "404" ] && pass "el id de una alerta no abre nada → 404" || fail "id de alerta → $CODE"

echo "3. Vence a los 7 días del envío"
DIAS="$(node -e 'console.log(Math.round((Date.parse(process.argv[1])-Date.now())/86400000*10)/10)' "$VENCE")"
[ "$DIAS" = "7" ] && pass "el aviso informa que el enlace vence en 7 días ($VENCE)" || fail "vence en $DIAS días"
echo "     (el 410 «Este enlace venció» pasados los 7 días lo prueban los tests con reloj simulado)"

echo "4. Muestra sólo el informe de ese aviso"
http - POST /api/fallas-criticas/informes '{"maquinaId":"MAQ-CALLAO-M1","inspector":"rt1","fallasCriticas":["BOTON_PARE_FALLA"],"observaciones":"Otro edificio distinto"}'
ID2="$(json "$TMP/r.json" 'b.informe.id')"
http "$SEC" POST "/api/avisos/$ID2/aprobar" '{}'
ENLACE2="$(json "$TMP/r.json" 'b.enlace')"
RUTA2="/api/informe-aviso/${ENLACE2##*/}"
pagina "$RUTA"; A="$(cat "$TMP/p.html")"; pagina "$RUTA2"; B="$(cat "$TMP/p.html")"
{ echo "$A" | grep -q "Pulsador trabado" && ! echo "$A" | grep -q "Otro edificio distinto" && ! echo "$A" | grep -q "Callao"; } && pass "el primer enlace no muestra el segundo edificio" || fail "el primer enlace mezcla datos"
{ echo "$B" | grep -q "Otro edificio distinto" && ! echo "$B" | grep -q "Pulsador trabado" && ! echo "$B" | grep -q "Corrientes"; } && pass "el segundo enlace no muestra el primero" || fail "el segundo enlace mezcla datos"

echo "5. El token no queda en el historial de WhatsApp (que no pide sesión)"
curl -s "$BASE_URL/api/whatsapp/historial?alertaId=$ID" > "$TMP/hist.json"
! grep -q "$TOKEN" "$TMP/hist.json" && pass "el historial público no contiene el token" || fail "el token aparece en el historial público"

echo; echo "Resultado: $OK ok, $KO con error"
[ "$KO" = "0" ]

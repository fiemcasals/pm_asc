#!/usr/bin/env bash
# HU-11 / RF-13 (REQ-1795263642719) — Pedir sesión de la Secretaría para ver el historial de envíos de WhatsApp.
#
#   bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-13-entrega.sh
#
# Requiere la API levantada (BASE_URL, por defecto http://127.0.0.1:3050) con los datos de demo de HU-04 RF-02
# (demo.secretaria, demo.admin, rt.beto, demo.firmante y demo.eca, todos con clave Demo-Clave-2026).
# Con --carga N pide N veces el historial como Secretaría y mide cuánto tarda.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
CARGA=0
if [ "${1:-}" = "--carga" ] && [ -n "${2:-}" ]; then CARGA="$2"; fi
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { # login <usuario> → token (vacío si falla)
  printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"
  curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"
  json "$TMP/lr.json" 'b.accessToken||""'
}
historial() { # historial [token] → código HTTP; el cuerpo queda en $TMP/h.json
  if [ -n "${1:-}" ]; then curl -s -o "$TMP/h.json" -w '%{http_code}' -H "Authorization: Bearer $1" "$BASE_URL/api/whatsapp/historial"
  else curl -s -o "$TMP/h.json" -w '%{http_code}' "$BASE_URL/api/whatsapp/historial"; fi
}

echo "== HU-11 / RF-13 contra $BASE_URL"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/health")" = "200" ] || { echo "  ❌ la API no responde en $BASE_URL"; exit 2; }
SEC="$(login demo.secretaria)"; [ -n "$SEC" ] || { echo "  ❌ no pude ingresar como demo.secretaria: corré antes RF-02-datos-demo.sh"; exit 2; }

echo "1. Sin sesión responde 401"
C="$(historial)"; [ "$C" = "401" ] && ! grep -q '"registros"' "$TMP/h.json" && pass "sin sesión → 401, sin envíos en la respuesta" || fail "sin sesión → $C"
C="$(historial no-es-un-token)"; [ "$C" = "401" ] && pass "con un token inválido → 401" || fail "con un token inválido → $C"

echo "2. RT de Calle, Firmante o ECA reciben 403"
for u in rt.beto demo.firmante demo.eca; do
  T="$(login "$u")"
  if [ -z "$T" ]; then fail "no pude ingresar como $u"; continue; fi
  C="$(historial "$T")"; [ "$C" = "403" ] && ! grep -q '"registros"' "$TMP/h.json" && pass "$u → 403" || fail "$u → $C"
done

echo "3. La Secretaría y el Administrador reciben 200, y la bandeja sigue mostrando los envíos"
C="$(historial "$SEC")"; [ "$C" = "200" ] && [ "$(json "$TMP/h.json" 'Array.isArray(b.registros)')" = "true" ] && pass "demo.secretaria → 200 con $(json "$TMP/h.json" 'b.total') envíos" || fail "demo.secretaria → $C"
ADM="$(login demo.admin)"; C="$(historial "$ADM")"; [ "$C" = "200" ] && pass "demo.admin → 200" || fail "demo.admin → $C"
(cd "$REPO_ROOT/apps/web" && NO_COLOR=1 npx vitest run src/avisos > "$TMP/w.txt" 2>&1)
grep -qE "Tests +[0-9]+ passed" "$TMP/w.txt" && ! grep -qE "Tests .* failed" "$TMP/w.txt" \
  && pass "pruebas de la bandeja: $(grep -E '^ +Tests ' "$TMP/w.txt" | tr -s ' ' | sed 's/^ //'); la bandeja pide el historial con fetchConSesion" || fail "pruebas de la bandeja"
grep -q "cargarHistorialWhatsApp(fetchConSesion)" "$REPO_ROOT/apps/web/src/avisos/BandejaAvisos.tsx" || fail "la bandeja no pide el historial con la sesión"

echo "4. Pruebas automáticas de la API"
(cd "$REPO_ROOT/apps/api" && NO_COLOR=1 npx jest test/whatsapp-historial-sesion.e2e-spec.ts test/informe-aviso.e2e-spec.ts > "$TMP/a.txt" 2>&1)
grep -qE "^Tests: +[0-9]+ passed" "$TMP/a.txt" && pass "whatsapp-historial-sesion e informe-aviso: $(grep -E '^Tests:' "$TMP/a.txt" | tr -s ' ')" || { fail "pruebas de la API"; grep -E "✕|●" "$TMP/a.txt" | head; }

if [ "$CARGA" -gt 0 ]; then
  echo "== Prueba de carga: $CARGA pedidos del historial como Secretaría"
  FALLOS=0; T0="$(node -e 'console.log(Date.now())')"
  for _ in $(seq 1 "$CARGA"); do [ "$(historial "$SEC")" = "200" ] || FALLOS=$((FALLOS+1)); done
  DT=$(( $(node -e 'console.log(Date.now())') - T0 ))
  echo "  Pedidos: $CARGA | Fallos: $FALLOS | Promedio: $((DT / CARGA)) ms (incluye arrancar curl)"
  [ "$FALLOS" -eq 0 ] && pass "carga: $CARGA pedidos sin fallos" || fail "carga: $FALLOS fallos"
fi

echo "== Resultado: $OK bien, $KO mal"
[ "$KO" -eq 0 ]

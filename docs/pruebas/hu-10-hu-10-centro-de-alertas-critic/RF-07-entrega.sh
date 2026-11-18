#!/usr/bin/env bash
# HU-10 / RF-07 — FIX: Los símbolos del remito PDF salen como caracteres rotos.
#
# Descarga el remito PDF de las dos alertas reales de la API (cuyos títulos traen emoji), lee el texto que el PDF dibuja de verdad y
# comprueba las 4 condiciones de aprobación:
#   bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-07-entrega.sh
#
# Requiere la API levantada (npm run dev, o sólo la API con BASE_URL=http://127.0.0.1:3050) y node. Con `npm run db:up` y docker también
# borra los acuses de prueba de la base (descargar un remito registra el acuse legal).
# Aviso: la API recuerda en memoria el acuse de la alerta hasta que se reinicia.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
DB_NAME="${DB_NAME:-ascensores}"
USUARIO="RF07-entrega-$$@maicon.test"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"

CURL=(curl -s --max-time 20)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem"); fi
if curl -V 2>/dev/null | grep -qi schannel; then CURL+=(--ssl-no-revoke); fi

OK=0; FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }
TMP="$(mktemp -d)"
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d "$DB_NAME" -tAc "$1" 2>/dev/null; }
HAY_DB=0; if command -v docker >/dev/null 2>&1 && [ -n "$(sql 'select 1')" ]; then HAY_DB=1; fi
limpiar() { [ "$HAY_DB" -eq 1 ] && sql "delete from acuses_recibo_legal where usuario like 'RF07-entrega-%'" >/dev/null; rm -rf "$TMP"; }
trap limpiar EXIT

descargar() { # descargar <alertaId> <archivo-de-texto-salida>
  local code
  code="$("${CURL[@]}" -o "$TMP/$1.pdf" -D "$TMP/$1.hdr" -w '%{http_code}' -G --data-urlencode "usuario=$USUARIO" --data-urlencode "formato=pdf" "$BASE_URL/api/eca/remito/$1")"
  [ "$code" = "200" ] && [ "$(head -c 5 "$TMP/$1.pdf")" = "%PDF-" ] || return 1
  node "$AQUI/RF-07-pdf-a-texto.js" "$TMP/$1.pdf" > "$2"
}
tiene() { grep -qxF -- "$2" "$1"; }          # una línea exacta
contiene() { grep -qF -- "$2" "$1"; }        # un fragmento

echo "== HU-10 / RF-07 (símbolos del remito PDF) contra $BASE_URL"
[ "$HAY_DB" -eq 1 ] || echo "   (sin docker: no se limpian los acuses de prueba de la base)"
for A in ALT-MAICON-001 ALT-CP-001; do
  descargar "$A" "$TMP/$A.txt" || { fail "no pude descargar el remito PDF de $A (¿la API está levantada?)"; exit 1; }
done
pass "se descargaron los dos remitos PDF reales (200, %PDF-)"
M="$TMP/ALT-MAICON-001.txt"; C="$TMP/ALT-CP-001.txt"

echo "1. El texto del PDF no tiene caracteres rotos"
for f in "$M" "$C"; do
  if grep -qF -e "þ" -e "&" "$f"; then fail "$(basename "$f"): quedan «þ» o «&» (símbolos rotos): $(grep -m1 -F -e "þ" -e "&" "$f")"; else pass "$(basename "$f" .txt): sin «þ» ni «&» (antes salía «& þ»)"; fi
done
RAROS="$(cat "$M" "$C" | LC_ALL=C.UTF-8 node -e 'const t=require("fs").readFileSync(0,"utf8");const ok=/[\x20-\x7E\xA0-\xFF\n–—‘’“”•…€™ˆ˜‚ƒ„†‡‰Š‹ŒŽšœžŸ]/;console.log([...t].filter(c=>!ok.test(c)).join(""))')"
[ -z "$RAROS" ] && pass "todos los caracteres del texto se pueden dibujar con la fuente del PDF" || fail "caracteres fuera de la codificación: $RAROS"

echo "2. Los estados se leen como palabras"
{ tiene "$M" "ATENCIÓN · Critico" || contiene "$M" "ATENCIÓN · Falla"; } && pass "los ítems del checklist dicen «ATENCIÓN · <estado>»" || fail "falta «ATENCIÓN · …» en el checklist"
for f in "$M" "$C"; do
  tiene "$f" "OK · Acuse Legal Registrado: " && tiene "$f" "OK · Usuario Notificado: " && pass "$(basename "$f" .txt): el acuse dice «OK · Acuse Legal Registrado» y «OK · Usuario Notificado»" || fail "$(basename "$f" .txt): faltan las etiquetas «OK ·» del acuse"
done
grep -qF -e "⚠" -e "✓" -e "✔" "$M" "$C" && fail "quedan símbolos de advertencia o tilde en el texto" || pass "ya no quedan símbolos de advertencia ni de tilde"

echo "3. Un título con emoji se imprime sin el emoji"
contiene "$M" "DIAGNÓSTICO TÉCNICO DE FALLA CRÍTICA: REPARACIÓN URGENTE" && pass "ALT-MAICON-001 (título «⚠️ Reparación urgente…»): «DIAGNÓSTICO TÉCNICO DE FALLA CRÍTICA: REPARACIÓN URGENTE…»" || fail "título de ALT-MAICON-001: $(grep -m1 'DIAGNÓSTICO' "$M")"
contiene "$C" "DIAGNÓSTICO TÉCNICO DE FALLA CRÍTICA: FUERA DE SERVICIO: CABINA TRABADA" && pass "ALT-CP-001 (título «🚨 Fuera de servicio: cabina trabada»): «…FALLA CRÍTICA: FUERA DE SERVICIO: CABINA TRABADA»" || fail "título de ALT-CP-001: $(grep -m1 'DIAGNÓSTICO' "$C")"

echo "4. El contenido del documento sigue igual y las pruebas del ECA siguen en verde"
FALTA=""
for f in "$M" "$C"; do
  for s in "MAICON S.R.L. · SISTEMA DE INSPECCIÓN Y SEGURIDAD VERTICAL" "Habilitación AGC Registro Oficial CABA · Conforme Ley 6100 y Ordenanza 49308" "REMITO TÉCNICO OFICIAL DE NOTIFICACIÓN CRÍTICA" "DATOS DEL CONSORCIO Y MÁQUINA INSPECCIONADA" "CERTIFICADO DE ACUSE DE RECIBO LEGAL Y DESLINDE FEHACIENTE" "SÍ (Conforme Ley CABA)"; do contiene "$f" "$s" || FALTA="$FALTA [$(basename "$f" .txt)] $s;"; done
done
[ -z "$FALTA" ] && pass "membrete, datos del consorcio y la máquina, diagnóstico y certificado de acuse están en los dos PDF" || fail "falta contenido:$FALTA"
contiene "$M" "Freno electromagnético" && contiene "$M" "CHECKLIST DE SEGURIDAD INSPECCIONADO" && pass "el checklist de seguridad con sus ítems sigue en el PDF" || fail "falta el checklist"
if command -v npx >/dev/null 2>&1; then
  RES="$(cd "$RAIZ/apps/api" && npx jest test/pdf-texto test/remito-pdf-simbolos test/eca 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^Tests:')"
  echo "$RES" | grep -q "failed" && fail "pruebas del ECA: $RES" || { [ -n "$RES" ] && pass "pruebas del ECA y del remito PDF en verde ($RES)" || fail "no pude correr las pruebas del ECA"; }
else
  echo "   (sin npx: no se corrieron las pruebas del ECA)"
fi

echo; echo "Resultado: $OK ok, $FALLAS con error"
[ "$FALLAS" -eq 0 ]

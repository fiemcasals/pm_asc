#!/usr/bin/env bash
# HU-06 / RF-03 — La lista de fallas críticas que definió el cliente.
#
#   bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-03-entrega.sh
#
# Requiere la API levantada (npm run dev) y los datos demo de HU-04 (bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh,
# que crea demo.secretaria). OJO: los informes de fallas son datos EN MEMORIA de la API: los de esta prueba quedan hasta que se reinicie la
# API (Ctrl+C y de nuevo npm run dev). Corré el script una sola vez por arranque. BASE_URL por defecto http://127.0.0.1:3050.

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
informe() { printf '{"maquinaId":"%s","inspector":"Ing. Prueba","fallasCriticas":%s}' "$1" "$2" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $SEC" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL/api/fallas-criticas/informes")"; }
TRACCION=MAQ-CORRIENTES-M1; HIDRAULICA=MAQ-CORRIENTES-M2

echo "== HU-06 / RF-03 contra $BASE_URL"
echo "1. Cada ítem de la lista del cliente genera la alerta de Falla Crítica"
for c in CABLES_DESGASTADOS CORTE_FUERZA_MOTRIZ_NO_ACTUA BOTON_PARE_FALLA PARACAIDAS_ANOMALIA DESTRABE_MANUAL_TRABADO_INEXISTENTE CERRADURA_NO_TRABA CONTACTO_ELECTRICO_PUENTEADO_FALLA ESPACIO_ENTRE_PUERTAS_MAYOR_12CM INSTALACIONES_AJENAS_SI ESPACIOS_CON_ABERTURAS LIMITES_FALLAN_ANULADOS STOP_FOSA_DEFICIENTE_INEXISTENTE LIMITADOR_ANULADO; do
  informe $TRACCION "[\"$c\"]"
  [ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.eventoEmitido')" = "true" ] || fail "$c → HTTP $CODE, alerta: $(json "$TMP/r.json" 'b.eventoEmitido')"
done
[ "$KO" = "0" ] && pass "las 13 fallas críticas de tracción (incluido «limitador anulado», que sigue hasta que MAICON responda) emiten la alerta"

echo "2. Lo que el cliente sacó se registra como falla común y no genera alerta"
for c in PERDIDA_ACEITE_CRITICA LIMITADOR_DEFICIENTE TABLERO_FUERA_DE_NORMA PUERTA_TIJERA ALARMA PISO_MADERA BARANDA_TECHO EXTENSION_CABLES; do
  informe $TRACCION "[\"$c\"]"
  [ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.eventoEmitido+"|"+b.informe.fallasComunes[0]')" = "false|$c" ] || fail "$c → $CODE $(head -c 150 "$TMP/r.json")"
done
[ "$KO" = "0" ] && pass "las 8 fallas que el cliente sacó quedan como falla común, sin alerta"

echo "3. «Aceite de batea insuficiente» sólo en máquinas hidráulicas"
informe $TRACCION '["ACEITE_BATEA_INSUFICIENTE"]'
[ "$CODE" = "400" ] && pass "en una máquina de tracción → 400: $(json "$TMP/r.json" 'b.errores?b.errores[0]:JSON.stringify(b.message)')" || fail "tracción → $CODE"
informe $HIDRAULICA '["ACEITE_BATEA_INSUFICIENTE"]'
[ "$CODE" = "201" ] && [ "$(json "$TMP/r.json" 'b.eventoEmitido')" = "true" ] && pass "en la máquina hidráulica → 201 con alerta" || fail "hidráulica → $CODE"

echo "4. La alerta de la Secretaría muestra el nombre legible, agrupado por zona"
informe $TRACCION '["STOP_FOSA_DEFICIENTE_INEXISTENTE","PARACAIDAS_ANOMALIA","CERRADURA_NO_TRABA"]'
curl -s -o "$TMP/ev.json" -H "Authorization: Bearer $SEC" "$BASE_URL/api/fallas-criticas/informes"
[ "$(json "$TMP/ev.json" 'b[b.length-1].fallasDetalle.map(d=>d.zona+": "+d.nombre).join(" | ")')" = "Cabina: Paracaídas: Anomalía | Accesos: Cerradura: No traba | Fosa: Stop de fosa: DEFICIENTE / INEXISTENTE" ] && pass "el último evento trae cada falla con su nombre y zona, en el orden de las zonas" || fail "detalle: $(json "$TMP/ev.json" 'JSON.stringify(b[b.length-1].fallasDetalle)')"
ID="$(json "$TMP/r.json" 'b.informe.id')"
curl -s -o "$TMP/inf.html" "$BASE_URL/api/fallas-criticas/informes/$ID"
grep -q "<h3>Cabina</h3>" "$TMP/inf.html" && grep -q "<h3>Fosa</h3>" "$TMP/inf.html" && pass "el informe legible agrupa por zona (Cabina, Accesos, Fosa)" || fail "el informe no está agrupado por zona"

echo; echo "Recordá: reiniciá la API para dejar los informes de ejemplo como estaban."
echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

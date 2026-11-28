#!/usr/bin/env bash
# HU-19 / RF-11 — [FIX] chat-hilo.e2e-spec carga los 205 mensajes directo en el repositorio y no se pasa del tope con la máquina ocupada.
#
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-11-entrega.sh
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-11-entrega.sh --carga 20
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-11-entrega.sh --estres
#
# Sin argumentos: comprueba cómo quedó la prueba (los 205 mensajes se cargan en el repositorio, la lectura sigue por HTTP con sesión, no se
# sube ningún tope ni hay reintentos, son las mismas pruebas que en dev), que cada una de sus pruebas tarda menos de 1 s (3 corridas) y que
# sigue fallando cuando los datos no son los esperados. Con --carga N repite N corridas más y mide. Con --estres corre ADEMÁS la suite
# completa de la API con la máquina ocupada (docs/decisiones/2026-11-28-pruebas-intermitentes/estres-suite-api.sh, ~7 minutos) y mira qué
# le pasó a chat-hilo.e2e-spec. No modifica ningún archivo del repositorio (la copia que usa para el paso 5 la borra al terminar).

set -u
CARGA=0
ESTRES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --carga) CARGA="${2:-0}"; shift ;;
    --estres) ESTRES=1 ;;
  esac
  shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API="$REPO_ROOT/apps/api"
SPEC="$API/test/chat-hilo.e2e-spec.ts"
MUTANTE="$API/test/chat-hilo-mutante-rf11.e2e-spec.ts"
TMP="$(mktemp -d)"
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
trap 'rm -rf "$TMP"; rm -f "$MUTANTE"' EXIT

echo "== HU-19 / RF-11 (chat-hilo.e2e-spec sin 205 pedidos HTTP seguidos)"

echo "1. Cómo quedó la prueba (Criterios 1 y 3)"
N_ESCRIBIR="$(grep -c 'escribir(205)' "$SPEC")"
N_CARGAR="$(grep -c 'cargar(205)' "$SPEC")"
if [ "$N_ESCRIBIR" = "0" ] && [ "$N_CARGAR" = "2" ]; then
  pass "las dos pruebas de 205 mensajes los cargan con cargar(205); ninguna los escribe por HTTP"
else
  fail "se esperaba 0 usos de escribir(205) y 2 de cargar(205): hay $N_ESCRIBIR y $N_CARGAR"
fi
grep -q "chat.guardarMensaje(" "$SPEC" && grep -q "app.get(ChatRepository) as InMemoryChatRepository" "$SPEC" \
  && pass "cargar() guarda con ChatRepository.guardarMensaje, del repositorio en memoria que usa la app de la prueba" || fail "cargar() no usa ChatRepository.guardarMensaje"
if grep -q "pedir('?sala=global').expect(200)" "$SPEC" && grep -q "tokens.firmante" "$SPEC" && grep -q "x-hay-anteriores" "$SPEC"; then
  pass "la lectura sigue por HTTP, con la sesión del Firmante, y comprueba el encabezado X-Hay-Anteriores"
else
  fail "la lectura ya no es por HTTP con sesión"
fi
for aserto in "toHaveLength(200)" "'msg 6'" "'msg 205'" "['msg 1', 'msg 2', 'msg 3', 'msg 4', 'msg 5']"; do
  grep -qF "$aserto" "$SPEC" || fail "falta la comprobación $aserto"
done

echo "2. No se subió ningún tope ni se agregaron reintentos, y no se quitó ninguna prueba (Criterio 4)"
if grep -nE 'jest\.setTimeout|testTimeout|retryTimes|\bretry\b|, *[0-9]{4,}\)' "$SPEC" > "$TMP/topes.txt"; then
  fail "la prueba declara topes o reintentos: $(head -3 "$TMP/topes.txt")"
else
  pass "chat-hilo.e2e-spec.ts no declara ningún tope de tiempo ni reintento"
fi
if git -C "$REPO_ROOT" rev-parse --verify -q origin/dev > /dev/null 2>&1; then
  BASE="$(git -C "$REPO_ROOT" merge-base origin/dev HEAD)"
  CAMBIOS="$(git -C "$REPO_ROOT" diff --name-only "$BASE" -- apps | tr '\n' ' ')"   # contra el árbol de trabajo: sirve antes y después de commitear
  # Antes de mergear cambia sólo ese archivo; ya mergeado en dev no hay diferencia contra dev. En los dos casos no puede haber ningún otro.
  OTROS="$(printf '%s\n' $CAMBIOS | grep -v '^apps/api/test/chat-hilo.e2e-spec.ts$' | tr '\n' ' ')"
  [ -z "$OTROS" ] && pass "de apps/ no cambia nada más que apps/api/test/chat-hilo.e2e-spec.ts (ni la API, ni package.json, ni la configuración de Jest, ni create-test-app)" || fail "cambian otros archivos de apps/: $OTROS"
  git -C "$REPO_ROOT" show "origin/dev:apps/api/test/chat-hilo.e2e-spec.ts" | grep -E "^\s+it(\.each)?\(" > "$TMP/pruebas-dev.txt"
  grep -E "^\s+it(\.each)?\(" "$SPEC" > "$TMP/pruebas-ahora.txt"
  if diff -q "$TMP/pruebas-dev.txt" "$TMP/pruebas-ahora.txt" > /dev/null; then
    pass "las $(wc -l < "$TMP/pruebas-ahora.txt") definiciones de prueba (it / it.each) son exactamente las de dev"
  else
    fail "cambian las pruebas respecto de dev: $(diff "$TMP/pruebas-dev.txt" "$TMP/pruebas-ahora.txt" | head -4)"
  fi
else
  echo "  (omitido: no hay origin/dev para comparar)"
fi
for arch in chat.e2e-spec.ts chat-validacion.e2e-spec.ts; do
  [ -f "$API/test/$arch" ] && grep -q "post('/api/chat/mensajes')" "$API/test/$arch" \
    && pass "$arch sigue probando el envío por HTTP" || fail "$arch no prueba el envío por HTTP"
done

# Corre chat-hilo.e2e-spec una vez y deja en $1 el JSON de Jest; imprime «máximo_ms total_pruebas fallidas»
correr() {
  (cd "$API" && NO_COLOR=1 npx jest chat-hilo.e2e-spec --json --outputFile="$1" > "$1.log" 2>&1)
  node -e "
    const r = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    const t = r.testResults.flatMap((s) => s.assertionResults);
    const lenta = t.reduce((m, x) => (x.duration > m.duration ? x : m), { duration: 0, title: '' });
    console.log([Math.round(lenta.duration), t.length, t.filter((x) => x.status !== 'passed').length, JSON.stringify(lenta.title)].join(' '));
  " "$1"
}

echo "3. Cada prueba tarda menos de 1 s con la máquina libre (Criterio 1)"
for i in 1 2 3; do
  read -r MAX TOTAL FALLAN LENTA < <(correr "$TMP/corrida-$i.json")
  if [ "${FALLAN:-1}" = "0" ] && [ "${TOTAL:-0}" = "12" ] && [ "${MAX:-99999}" -lt 1000 ]; then
    pass "corrida $i: $TOTAL pruebas bien, la más lenta $MAX ms ($LENTA)"
  else
    fail "corrida $i: $TOTAL pruebas, $FALLAN fallaron, la más lenta $MAX ms ($LENTA): $(tail -5 "$TMP/corrida-$i.json.log")"
  fi
done
node -e "
  for (const f of process.argv.slice(1)) {
    const r = JSON.parse(require('fs').readFileSync(f, 'utf8'));
    const d = Object.fromEntries(r.testResults.flatMap((s) => s.assertionResults).filter((x) => /con más de 200|id del más viejo/.test(x.title)).map((x) => [x.title.slice(0, 40), Math.round(x.duration) + ' ms']));
    console.log('     ' + JSON.stringify(d));
  }
" "$TMP/corrida-1.json" "$TMP/corrida-2.json" "$TMP/corrida-3.json"

echo "4. La prueba sigue fallando cuando los datos no son los esperados (Criterio 3)"
sed 's/cargar(205)/cargar(204)/' "$SPEC" > "$MUTANTE"
if (cd "$API" && NO_COLOR=1 npx jest chat-hilo-mutante-rf11 > "$TMP/mutante.log" 2>&1); then
  fail "con 204 mensajes en vez de 205 la prueba igual pasó: no comprueba lo que dice"
else
  FALLADAS="$(grep -cE "^  ● .* › (con más de 200|con el id del más viejo)" "$TMP/mutante.log")"
  [ "$FALLADAS" -ge 2 ] && pass "con 204 mensajes en vez de 205 fallan las dos pruebas del límite (los 200 más nuevos y los anteriores)" || fail "con 204 mensajes fallaron $FALLADAS de las 2 pruebas del límite"
fi
rm -f "$MUTANTE"

if [ "$CARGA" -gt 0 ]; then
  echo
  echo "== Prueba de carga: $CARGA corridas más de chat-hilo.e2e-spec"
  FALLOS=0; PEOR=0; TIEMPOS=()
  for i in $(seq 1 "$CARGA"); do
    read -r MAX TOTAL FALLAN LENTA < <(correr "$TMP/carga-$i.json")
    TIEMPOS+=("$MAX")
    [ "${MAX:-99999}" -gt "$PEOR" ] && PEOR="$MAX"
    { [ "${FALLAN:-1}" != "0" ] || [ "${MAX:-99999}" -ge 1000 ]; } && FALLOS=$((FALLOS+1))
  done
  P95="$(printf '%s\n' "${TIEMPOS[@]}" | sort -n | awk -v n="$CARGA" 'BEGIN{k=int(n*0.95); if (k<n*0.95) k++} NR==k{print}')"
  echo "  Corridas: $CARGA | Fallidas o de 1 s o más: $FALLOS | La prueba más lenta de cada corrida: p95 ${P95} ms, peor ${PEOR} ms"
  [ "$FALLOS" = "0" ] && pass "carga: $CARGA corridas, 0 fallos, ninguna prueba llegó a 1 s" || fail "carga con $FALLOS corridas fallidas o lentas"
fi

if [ "$ESTRES" = "1" ]; then
  echo
  echo "== Con la máquina ocupada: la suite completa de la API (Criterio 2) — tarda unos 7 minutos"
  bash "$REPO_ROOT/docs/decisiones/2026-11-28-pruebas-intermitentes/estres-suite-api.sh" > "$TMP/estres.log" 2>&1
  sed -n '1,/Salida completa/p' "$TMP/estres.log" | sed 's/^/     /'
  LOG="$(grep -E '^Salida completa: ' "$TMP/estres.log" | sed 's/^Salida completa: //')"
  if [ -f "$LOG" ]; then
    ESTADO="$(grep -E '^(PASS|FAIL) .*chat-hilo\.e2e-spec' "$LOG" | head -1)"
    TOPE_HILO="$(grep -E 'chat-hilo\.e2e-spec' -A3 "$LOG" | grep -c 'Exceeded timeout')"
    echo "     chat-hilo.e2e-spec: ${ESTADO:-no aparece en la salida}"
    if echo "$ESTADO" | grep -q '^PASS' && [ "$TOPE_HILO" = "0" ]; then
      pass "con la máquina ocupada chat-hilo.e2e-spec pasó, sin «Exceeded timeout»"
    else
      fail "con la máquina ocupada chat-hilo.e2e-spec: ${ESTADO:-no aparece}; «Exceeded timeout» cerca de él: $TOPE_HILO"
    fi
    OTROS="$(grep -E '^  ● .* › ' "$LOG" | sort -u | head -5)"
    [ -n "$OTROS" ] && echo "     (otras pruebas que fallaron bajo la carga, que no son de esta tarea:)" && echo "$OTROS" | sed 's/^/       /'
  else
    fail "el script de estrés no dejó su salida"
  fi
fi

echo
echo "Resultado: $OK ok, $KO con error"
[ "$KO" -eq 0 ]

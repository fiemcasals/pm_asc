#!/usr/bin/env bash
# HU-16 / RF-07 — [FIX] La guía de Android incluye el mapa en las 8 pantallas y la prueba del Mapa del RT sin señal.
#
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-07-entrega.sh
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-07-entrega.sh --sin-navegador
#   bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-07-entrega.sh --carga 20
#
# Es un cambio de documentación (no toca código de la app): comprueba que la guía de docs/android dice lo que la app hace hoy.
# Sin argumentos, además recorre las pantallas con Playwright en un celular de 360 px (RF-07-navegador.cjs), para lo que hace falta
# la API con los datos de demo de HU-04 RF-02 y la web compilada y servida (npm run build -w apps/web && npm run preview -w apps/web,
# en https://localhost:4173). --sin-navegador se salta ese recorrido y lo dice. Con --carga N abre N veces el Mapa del RT y mide.

set -u
NAVEGADOR=1
CARGA=0
while [ $# -gt 0 ]; do
  case "$1" in
    --sin-navegador) NAVEGADOR=0 ;;
    --carga) CARGA="${2:-0}"; shift ;;
  esac
  shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB="$REPO_ROOT/apps/web"
GUIA_ANDROID="${GUIA_ANDROID:-$REPO_ROOT/docs/android/INSTALAR-Y-PROBAR-EN-ANDROID.md}"   # se puede apuntar a otra copia para ver que las comprobaciones fallan
CARPETA="$REPO_ROOT/docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al"
WEB_URL="${WEB_URL:-https://localhost:4173}"
TMP="$(mktemp -d)"
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
trap 'rm -rf "$TMP"' EXIT

echo "== HU-16 / RF-07 (la guía de Android y el mapa en las 8 pantallas)"

echo "1. La ruta al mapa sin conexión dice lo que la app dice hoy (Criterio 1)"
if grep -q "label: 'Mapa sin conexión', shortLabel: 'Sin conexión'" "$WEB/src/ui/navegacion.ts"; then
  pass "la app llama a la pestaña «Mapa sin conexión» (en el celular, «Sin conexión»)"
else
  fail "ui/navegacion.ts ya no tiene la pestaña «Mapa sin conexión» / «Sin conexión»: revisar la guía"
fi
if grep -rq "Estado del Sistema" "$WEB/src" --include=*.ts --include=*.tsx; then
  fail "la app todavía usa «Estado del Sistema»: la guía tendría que decir otra cosa"
else
  pass "«Estado del Sistema» ya no existe en la app"
fi
if grep -q "Andá a \*\*Estado del Sistema\*\*" "$GUIA_ANDROID"; then
  fail "la guía sigue mandando a «Estado del Sistema»"
elif grep -q "Andá a la pestaña \*\*Mapa sin conexión\*\*" "$GUIA_ANDROID" && grep -q "la barra de abajo la llama \*\*Sin conexión\*\*" "$GUIA_ANDROID"; then
  pass "el paso 1 del 5.1 manda a la pestaña «Mapa sin conexión» y dice cómo se llama en la barra del celular"
else
  fail "el paso 1 del 5.1 no menciona la pestaña «Mapa sin conexión»"
fi

echo "2. La guía tiene una sección con las 8 pantallas del mapa (Criterio 2)"
SECCION="$(sed -n '/^### 5\.2 El mapa en las demás pantallas/,/^### 5\.3 /p' "$GUIA_ANDROID")"
if [ -z "$SECCION" ]; then
  fail "no hay una sección «5.2 El mapa en las demás pantallas»"
else
  FILAS="$(printf '%s\n' "$SECCION" | grep -cE '^\| [1-8] \| ')"
  [ "$FILAS" = "8" ] && pass "la tabla tiene las 8 filas (una por pantalla)" || fail "la tabla tiene $FILAS filas de pantallas y tienen que ser 8"
  for pantalla in "Ficha del edificio, en lectura" "Ficha, en edición" "Alta de consorcio" "Vista de mapa" "Monitoreo" "Semáforo" "Mapa del RT" "Mapa sin conexión"; do
    printf '%s\n' "$SECCION" | grep -q "\*\*$pantalla" || fail "la tabla no nombra «$pantalla»"
  done
  for mira in "Calles y nombres" "Tocar un pin" "verde" "rojo" "amarillo"; do
    printf '%s\n' "$SECCION" | grep -qF "$mira" || fail "la sección no dice qué mirar: falta «$mira» (calles con nombre, pines por estado, abrir un pin)"
  done
  printf '%s\n' "$SECCION" | grep -q "Mapa del RT sin señal, con el mapa ya bajado" && pass "está la prueba del Mapa del RT sin señal con el mapa ya bajado" || fail "falta la prueba del Mapa del RT sin señal"
fi

echo "3. Cada pantalla de la tabla existe en la app, con el identificador que usa la prueba de navegador (Criterio 2)"
FALTAN=""
for id in mapa-lectura-ficha mapa-editar-ficha mapa-alta-consorcio mapa-global-consorcios mapa-monitoreo mapa-semaforo mapa-rt-pines mapa-sistema; do
  grep -rq "testId=\"$id\"" "$WEB/src" --include=*.tsx || FALTAN="$FALTAN $id"
done
[ -z "$FALTAN" ] && pass "los 8 mapas están en la app (mapa-lectura-ficha, mapa-editar-ficha, mapa-alta-consorcio, mapa-global-consorcios, mapa-monitoreo, mapa-semaforo, mapa-rt-pines y mapa-sistema)" || fail "ya no están en la app:$FALTAN"
if (cd "$WEB" && npx vitest run src/ui/navegacion.test.ts > "$TMP/nav.log" 2>&1); then
  pass "navegacion.test.ts (nombre de la pestaña): $(sed 's/\x1b\[[0-9;]*m//g' "$TMP/nav.log" | grep -E '^ +Tests ' | sed 's/^ *//')"
else
  fail "falló navegacion.test.ts: $(tail -6 "$TMP/nav.log")"
fi

echo "4. El registro de la prueba tiene una columna por pantalla del mapa (Criterio 3)"
REGISTRO="$(sed -n '/^## 10\. Registro de la prueba/,$p' "$GUIA_ANDROID")"
ENCABEZADO="$(printf '%s\n' "$REGISTRO" | grep -E '^\| Fecha \|' | head -1)"
FALTAN=""
for columna in "1 Ficha (lectura)" "2 Ficha (edición)" "3 Alta" "4 Vista Mapa" "5 Monitoreo" "6 Semáforo" "7 Mapa del RT" "8 Mapa sin conexión" "RT sin señal"; do
  printf '%s' "$ENCABEZADO" | grep -qF "| $columna |" || FALTAN="$FALTAN «$columna»"
done
[ -z "$FALTAN" ] && pass "el registro tiene las 8 columnas de las pantallas y la de «RT sin señal»" || fail "al encabezado del registro le faltan:$FALTAN"
COLS="$(printf '%s' "$ENCABEZADO" | awk -F'|' '{print NF-2}')"
FILA_VACIA="$(printf '%s\n' "$REGISTRO" | grep -E '^\| *\|' | head -1 | awk -F'|' '{print NF-2}')"
[ "$COLS" = "$FILA_VACIA" ] && pass "el encabezado y la fila para completar tienen las mismas $COLS columnas" || fail "el encabezado tiene $COLS columnas y la fila vacía $FILA_VACIA"
grep -q "se recorrieron en un navegador de escritorio que emula 360 px, no en un Android real" "$GUIA_ANDROID" \
  && pass "la sección «Qué falta» dice que las 8 pantallas no se probaron todavía en un Android real" || fail "la sección «Qué falta» no aclara que no se probó en un Android real"

echo "5. Las capturas y los vínculos de la guía existen (Criterio 4)"
FALTAN=""
for archivo in RF-07-ficha RF-07-semaforo RF-07-mapa-rt RF-07-mapa-rt-sin-conexion RF-07-mapa-sin-conexion; do
  [ -s "$CARPETA/imagenes/$archivo.png" ] || FALTAN="$FALTAN $archivo.png"
done
[ -z "$FALTAN" ] && pass "las 5 capturas están en imagenes/" || fail "faltan capturas:$FALTAN"
ROTOS=""; TOTAL=0
while IFS= read -r destino; do
  TOTAL=$((TOTAL+1))
  [ -e "$(dirname "$GUIA_ANDROID")/$destino" ] || ROTOS="$ROTOS $destino"
done < <(grep -oE '\]\([^)]+\)' "$GUIA_ANDROID" | sed -E 's/^\]\(//; s/\)$//; s/#.*$//' | grep -vE '^(https?:|mailto:|$)' | sort -u)
[ -z "$ROTOS" ] && pass "los $TOTAL vínculos a archivos de la guía llevan a un archivo que existe" || fail "vínculos rotos:$ROTOS"

echo "6. No se cambió código de la app (es sólo documentación)"
if git -C "$REPO_ROOT" rev-parse --verify -q origin/dev > /dev/null 2>&1; then
  CAMBIOS="$(git -C "$REPO_ROOT" diff --name-only "$(git -C "$REPO_ROOT" merge-base origin/dev HEAD)" HEAD -- apps | tr '\n' ' ')"
  [ -z "$CAMBIOS" ] && pass "ningún archivo de apps/ cambia respecto de dev" || fail "cambian archivos de la app: $CAMBIOS"
else
  echo "  (omitido: no hay origin/dev para comparar)"
fi

if [ "$NAVEGADOR" = "1" ]; then
  echo "7. Recorrido en un celular de 360 px con Playwright (Criterio 2)"
  if ! curl -sk -o /dev/null --max-time 10 "$WEB_URL" || ! curl -s --ssl-no-revoke -o /dev/null --max-time 10 http://127.0.0.1:3050/api/health; then
    fail "no hay web en $WEB_URL o API en 127.0.0.1:3050: levantalas (npm run dev, o build + preview) o corré con --sin-navegador"
  else
    mkdir -p "$TMP/capturas"
    if WEB_URL="$WEB_URL" node "$CARPETA/RF-07-navegador.cjs" "$TMP/capturas" > "$TMP/nav-playwright.log" 2>&1; then
      N="$(grep -c '^OK ' "$TMP/nav-playwright.log")"
      [ "$N" = "9" ] && pass "las 9 comprobaciones del recorrido salieron bien" || fail "se esperaban 9 comprobaciones bien y hay $N: $(grep -E '^(FALLA|ERROR)' "$TMP/nav-playwright.log" | head -3)"
      grep -E '^(Mapa del RT|Mapa sin conexión|Semáforo|Ficha)' "$TMP/nav-playwright.log" | sed 's/^/     /'
    else
      fail "el recorrido falló: $(grep -E '^(FALLA|ERROR)' "$TMP/nav-playwright.log" | head -3)"
    fi
  fi
else
  echo "7. Recorrido con Playwright: OMITIDO a pedido (--sin-navegador); no cuenta como ok"
fi

if [ "$CARGA" -gt 0 ]; then
  echo
  echo "== Prueba de carga: $CARGA aperturas del Mapa del RT en el celular emulado"
  if CARGA="$CARGA" WEB_URL="$WEB_URL" node "$CARPETA/RF-07-navegador.cjs" "$TMP/capturas" > "$TMP/carga.log" 2>&1; then
    LINEA="$(grep '^CARGA ' "$TMP/carga.log")"
    echo "  $LINEA"
    pass "carga: $CARGA aperturas, 0 fallos"
  else
    fail "la carga falló: $(grep -E '^(FALLA|ERROR)' "$TMP/carga.log" | head -3)"
  fi
fi

echo
echo "Resultado: $OK ok, $KO con error"
[ "$KO" -eq 0 ]

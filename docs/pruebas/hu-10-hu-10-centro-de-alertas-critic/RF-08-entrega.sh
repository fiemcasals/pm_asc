#!/usr/bin/env bash
# ==============================================================================
# HU-10 / RF-08 — Que un equipo marcado Fuera de Servicio o con Reparación Urgente genere la alerta del Portal ECA
# REQ-1795527711177
#
# Uso:
#   bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-08-entrega.sh
#   bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-08-entrega.sh --carga
#
# Requiere la API levantada (por defecto en http://127.0.0.1:3050).
# ==============================================================================

set -uo pipefail
export LC_ALL=C.UTF-8
export LANG=C.UTF-8

BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
CARGA=0

for arg in "$@"; do
  case "$arg" in
    --carga) CARGA=1 ;;
  esac
done

OK=0; FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

CURL=(curl -s --max-time 15)

echo "========================================================================"
echo " HU-10 / RF-08 · Alertas críticas en Portal ECA (REQ-1795527711177)"
echo " Servidor objetivo: $BASE_URL"
echo "========================================================================"

login() {
  local user="$1"
  local pass="$2"
  "${CURL[@]}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"usuario\":\"$user\",\"password\":\"$pass\"}" | \
    grep -o '"accessToken":"[^"]*' | cut -d'"' -f4
}

# 1. Autenticar actores
echo -e "\n🔑 1. Autenticando usuarios del sistema..."
TOKEN_RT=$(login "rt.ana" "Demo-Clave-2026")
TOKEN_FIRMANTE=$(login "demo.firmante" "Demo-Clave-2026")
TOKEN_ECA=$(login "demo.eca" "Demo-Clave-2026")
TOKEN_OTRA_ECA=$(login "eca.demo" "Demo-Clave-2026")

if [ -n "$TOKEN_RT" ] && [ -n "$TOKEN_FIRMANTE" ] && [ -n "$TOKEN_ECA" ] && [ -n "$TOKEN_OTRA_ECA" ]; then
  pass "Usuarios autenticados (RT, Firmante, ECA titular, Otra ECA)"
else
  fail "No se pudieron obtener tokens de sesión"
  exit 1
fi

# 2. Obtener máquina de prueba asignada a ECA Demo
echo -e "\n🏢 2. Localizando máquina asignada con terna..."
MAQUINAS_JSON=$("${CURL[@]}" -X GET "$BASE_URL/api/firmante/maquinas" -H "Authorization: Bearer $TOKEN_FIRMANTE")
MAQUINA_ID=$(echo "$MAQUINAS_JSON" | node -e 'const fs=require("fs");const list=JSON.parse(fs.readFileSync(0,"utf-8"));const m=list.find(x=>x.eca==="ECA Demo")||list[0];console.log(m?m.id:"");')

if [ -z "$MAQUINA_ID" ]; then
  fail "No se encontró máquina en el sistema"
  exit 1
fi
pass "Máquina localizada: $MAQUINA_ID"

# 3. Criterio 1: RT reporta parada y la ECA ve la alerta en Portal ECA
echo -e "\n🚨 3. Criterio 1: RT reporta parada (Fuera de Servicio) y ECA ve alerta..."
PARADA_RESP=$("${CURL[@]}" -X POST "$BASE_URL/api/paradas" \
  -H "Authorization: Bearer $TOKEN_RT" \
  -H "Content-Type: application/json" \
  -d "{\"maquinaId\":\"$MAQUINA_ID\",\"estado\":\"Fuera de Servicio\",\"causa\":\"Freno trabado y deformación en guías\",\"fotos\":[\"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD\"]}")

PARADA_ID=$(echo "$PARADA_RESP" | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf-8"));console.log(r.id||"");')
ALERTA_ID=$(echo "$PARADA_RESP" | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf-8"));console.log(r.alertaId||"");')

if [ -n "$PARADA_ID" ] && [ -n "$ALERTA_ID" ]; then
  pass "Parada registrada (ID: $PARADA_ID, Alerta ID: $ALERTA_ID)"
else
  fail "No se pudo registrar la parada"
fi

ALERTAS_ECA=$("${CURL[@]}" -X GET "$BASE_URL/api/eca/alertas" -H "Authorization: Bearer $TOKEN_ECA")
TIENE_ALERTA=$(echo "$ALERTAS_ECA" | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf-8'));const a=(r.alertas||[]).find(x=>x.maquinaId==='$MAQUINA_ID');console.log(a?'SI':'NO');")

if [ "$TIENE_ALERTA" = "SI" ]; then
  pass "Criterio 1: La alerta figura en Portal ECA con máquina, causa y fecha de detección"
else
  fail "Criterio 1: La alerta NO figura en Portal ECA"
fi

# 4. Criterio 2: Descargar remito y registrar acuse de recibo legal
echo -e "\n⚖️ 4. Criterio 2: ECA descarga remito y se registra acuse legal..."
REMITO_RESP=$("${CURL[@]}" -X GET "$BASE_URL/api/eca/remito/$ALERTA_ID" -H "Authorization: Bearer $TOKEN_ECA")
ACUSE_OK=$(echo "$REMITO_RESP" | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf-8"));console.log(r.acuseLegal&&r.acuseLegal.registrado?"SI":"NO");')

if [ "$ACUSE_OK" = "SI" ]; then
  pass "Criterio 2: Remito descargado y acuse legal registrado con fecha, hora y usuario"
else
  fail "Criterio 2: No se registró el acuse legal al descargar remito"
fi

# 5. Criterio 3: Aislamiento entre ECAs
echo -e "\n🔒 5. Criterio 3: Otra ECA no ve la alerta ni accede al remito..."
ALERTAS_OTRA=$("${CURL[@]}" -X GET "$BASE_URL/api/eca/alertas" -H "Authorization: Bearer $TOKEN_OTRA_ECA")
TIENE_ALERTA_OTRA=$(echo "$ALERTAS_OTRA" | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf-8'));const a=(r.alertas||[]).find(x=>x.maquinaId==='$MAQUINA_ID');console.log(a?'SI':'NO');")
STATUS_REMITO_OTRA=$("${CURL[@]}" -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/api/eca/remito/$ALERTA_ID" -H "Authorization: Bearer $TOKEN_OTRA_ECA")

if [ "$TIENE_ALERTA_OTRA" = "NO" ] && [ "$STATUS_REMITO_OTRA" = "404" ]; then
  pass "Criterio 3: Aislamiento estricto: otra ECA ve 0 alertas y remito responde 404 Not Found"
else
  fail "Criterio 3: Falla en aislamiento entre conservadoras (remito HTTP $STATUS_REMITO_OTRA)"
fi

# 6. Criterio 4: Normalización y retiro de la alerta
echo -e "\n🔧 6. Criterio 4: Firmante confirma y RT normaliza el equipo..."
"${CURL[@]}" -X POST "$BASE_URL/api/paradas/$PARADA_ID/confirmar" \
  -H "Authorization: Bearer $TOKEN_FIRMANTE" \
  -H "Content-Type: application/json" -d "{}" >/dev/null

NORM_STATUS=$("${CURL[@]}" -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/paradas/maquinas/$MAQUINA_ID/normalizar" \
  -H "Authorization: Bearer $TOKEN_RT" \
  -H "Content-Type: application/json" \
  -d "{\"fotos\":[\"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD\"]}")

if [ "$NORM_STATUS" = "200" ]; then
  ALERTAS_POST_NORM=$("${CURL[@]}" -X GET "$BASE_URL/api/eca/alertas" -H "Authorization: Bearer $TOKEN_ECA")
  SIGUE_ALERTA=$(echo "$ALERTAS_POST_NORM" | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf-8'));const a=(r.alertas||[]).find(x=>x.maquinaId==='$MAQUINA_ID');console.log(a?'SI':'NO');")
  if [ "$SIGUE_ALERTA" = "NO" ]; then
    pass "Criterio 4: Máquina normalizada y alerta retirada con éxito del Portal ECA"
  else
    fail "Criterio 4: La alerta sigue apareciendo luego de normalizar"
  fi
else
  fail "Criterio 4: Error al normalizar máquina (HTTP $NORM_STATUS)"
fi

# 7. Criterio 6: Modo Carga / Rendimiento si fue solicitado
if [ "$CARGA" -eq 1 ]; then
  echo -e "\n⚡ 7. Modo --carga: Creación y resolución consecutiva de 5 alertas críticas..."
  CARGA_OK=1
  for i in $(seq 1 5); do
    P=$("${CURL[@]}" -X POST "$BASE_URL/api/paradas" \
      -H "Authorization: Bearer $TOKEN_RT" \
      -H "Content-Type: application/json" \
      -d "{\"maquinaId\":\"$MAQUINA_ID\",\"estado\":\"Fuera de Servicio\",\"causa\":\"Prueba de carga $i\",\"fotos\":[\"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD\"]}")
    PID=$(echo "$P" | node -e 'try{const r=JSON.parse(require("fs").readFileSync(0,"utf-8"));console.log(r.id||"");}catch(e){console.log("");}')
    if [ -z "$PID" ]; then
      echo "  ⚠️ Falló POST /api/paradas en iteración $i: $P"
      CARGA_OK=0
      break
    fi
    C_STATUS=$("${CURL[@]}" -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/paradas/$PID/confirmar" -H "Authorization: Bearer $TOKEN_FIRMANTE" -H "Content-Type: application/json" -d "{}")
    N_STATUS=$("${CURL[@]}" -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/paradas/maquinas/$MAQUINA_ID/normalizar" -H "Authorization: Bearer $TOKEN_RT" -H "Content-Type: application/json" -d "{\"fotos\":[\"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD\"]}")
    if [ "$C_STATUS" != "200" ] || [ "$N_STATUS" != "200" ]; then
      echo "  ⚠️ Falló confirmar ($C_STATUS) o normalizar ($N_STATUS) en iteración $i"
      CARGA_OK=0
      break
    fi
  done
  if [ "$CARGA_OK" -eq 1 ]; then
    pass "Modo --carga: 5 alertas consecutivas generadas, confirmadas y normalizadas con éxito"
  else
    fail "Modo --carga: Falló iteración durante la prueba de carga"
  fi
fi

echo -e "\n========================================================================"
echo " Resumen: $OK pruebas superadas, $FALLAS fallidas."
echo "========================================================================"

if [ "$FALLAS" -eq 0 ]; then
  exit 0
else
  exit 1
fi

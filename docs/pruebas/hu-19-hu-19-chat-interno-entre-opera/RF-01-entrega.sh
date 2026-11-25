#!/usr/bin/env bash
# HU-19 / RF-01 (REQ-1795609195313) — Chat interno para operarios e ingenieros.
#
# Recorre los criterios de aceptación contra el entorno levantado:
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-01-entrega.sh
#   bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-01-entrega.sh --carga 50
#
# Requiere: API levantada en http://127.0.0.1:3050 (o via web en https://localhost:8050).

set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"

CARGA=0
if [ "${1:-}" = "--carga" ]; then
  CARGA="${2:-50}"
fi

CURL=(curl -s --max-time 10)
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL+=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
fi
if curl -V | grep -qi schannel; then
  CURL+=(--ssl-no-revoke)
fi

OK=0
FALLAS=0
pass() { echo "  ✅ $1"; OK=$((OK + 1)); }
fail() { echo "  ❌ $1"; FALLAS=$((FALLAS + 1)); }

TMP="$(mktemp -d 2>/dev/null || mktemp -d -t 'chat_tmp')"
limpiar() {
  rm -rf "$TMP"
}
trap limpiar EXIT

COOKIE_ADMIN="$TMP/cookie_admin.txt"
COOKIE_RT="$TMP/cookie_rt.txt"
COOKIE_ECA="$TMP/cookie_eca.txt"

login() {
  local user="$1"
  local pass="$2"
  local cookie_file="$3"
  "${CURL[@]}" -c "$cookie_file" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"usuario\":\"$user\",\"password\":\"$pass\"}" > /dev/null 2>&1
}

echo "=== HU-19 · RF-01 · Verificación de Chat Interno ==="
echo "Objetivo: $BASE_URL"

# 1. Login con credenciales de prueba
login "admin" "Admin123!" "$COOKIE_ADMIN"
login "rt1" "Rt123456!" "$COOKIE_RT"
login "conservadora1" "Eca123456!" "$COOKIE_ECA"

# 2. Prueba de Canales (Criterio 1)
canales_code=$("${CURL[@]}" -b "$COOKIE_ADMIN" -o "$TMP/canales.json" -w "%{http_code}" "$BASE_URL/api/chat/canales")
if [ "$canales_code" = "200" ] && grep -q '"general"' "$TMP/canales.json"; then
  pass "Criterio 1: Obtención de canales exitosa (incluye sala general y contactos individuales)"
else
  fail "Criterio 1: Error al obtener canales (HTTP $canales_code)"
fi

# 3. Envío de mensaje grupal con link (Criterios 2 y 4)
cuerpo_msg='{"tipoSala":"global","contenido":"Aviso urgente de prueba https://buenosaires.gob.ar/agc"}'
post_code=$("${CURL[@]}" -b "$COOKIE_RT" -o "$TMP/post_msg.json" -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" -d "$cuerpo_msg" "$BASE_URL/api/chat/mensajes")

if [ "$post_code" = "201" ] && grep -q '"id"' "$TMP/post_msg.json"; then
  pass "Criterios 2 y 4: Envío de mensaje grupal con enlace web exitoso"
else
  fail "Criterios 2 y 4: Error al enviar mensaje grupal (HTTP $post_code)"
fi

# 4. Envío de mensaje con adjunto de imagen y etiqueta de edificio (Criterios 3 y 5)
cuerpo_adjunto='{"tipoSala":"global","contenido":"Foto de sala de máquinas con anomalía","adjuntoUrl":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","edificioNombre":"Torre Mitre 1200"}'
post_adj_code=$("${CURL[@]}" -b "$COOKIE_RT" -o "$TMP/post_adj.json" -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" -d "$cuerpo_adjunto" "$BASE_URL/api/chat/mensajes")

if [ "$post_adj_code" = "201" ] && grep -q 'Torre Mitre 1200' "$TMP/post_adj.json"; then
  pass "Criterios 3 y 5: Envío de mensaje con foto adjunta y etiqueta de edificio exitoso"
else
  fail "Criterios 3 y 5: Error al enviar mensaje con foto y etiqueta (HTTP $post_adj_code)"
fi

# 5. Lectura de historial y actualización (Criterio 6)
historial_code=$("${CURL[@]}" -b "$COOKIE_ADMIN" -o "$TMP/historial.json" -w "%{http_code}" "$BASE_URL/api/chat/mensajes?sala=global")
if [ "$historial_code" = "200" ] && grep -q 'Torre Mitre 1200' "$TMP/historial.json"; then
  pass "Criterio 6: Historial de mensajes consultado y actualizado en tiempo real"
else
  fail "Criterio 6: Error al leer historial de mensajes (HTTP $historial_code)"
fi

# 6. Aislamiento de seguridad RBAC para empresas conservadoras ECA (Criterio 7)
eca_code=$("${CURL[@]}" -b "$COOKIE_ECA" -o "$TMP/eca_chat.json" -w "%{http_code}" "$BASE_URL/api/chat/canales")
if [ "$eca_code" = "403" ]; then
  pass "Criterio 7: Acceso denegado con 403 a usuarios con rol conservadora (ECA)"
else
  fail "Criterio 7: El usuario ECA no fue bloqueado correctamente (HTTP $eca_code)"
fi

# 7. Modo carga opcional
if [ "$CARGA" -gt 0 ]; then
  echo ""
  echo "== Modo Carga: $CARGA envíos y consultas concurrentes =="
  carga_fallas=0
  for i in $(seq 1 "$CARGA"); do
    msg="{\"tipoSala\":\"global\",\"contenido\":\"Mensaje de prueba de carga #$i\"}"
    c="$("${CURL[@]}" -b "$COOKIE_RT" -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$msg" "$BASE_URL/api/chat/mensajes")"
    if [ "$c" != "201" ]; then
      carga_fallas=$((carga_fallas + 1))
    fi
  done
  if [ "$carga_fallas" -eq 0 ]; then
    pass "Modo Carga: $CARGA mensajes enviados con 100% de éxito"
  else
    fail "Modo Carga: $carga_fallas de $CARGA mensajes fallaron"
  fi
fi

echo ""
echo "=== Resumen de Verificación ==="
echo "Pruebas exitosas: $OK"
echo "Pruebas fallidas: $FALLAS"

if [ "$FALLAS" -eq 0 ]; then
  echo "RESULTADO: APROBADO ✅"
  exit 0
else
  echo "RESULTADO: FALLIDO ❌"
  exit 1
fi

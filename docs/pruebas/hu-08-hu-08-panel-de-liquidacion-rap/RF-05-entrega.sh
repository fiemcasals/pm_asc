#!/usr/bin/env bash
# HU-08 / RF-05 — Las visitas, firmas AGC, rechazos y avisos de plazo del Portal Firmante sobreviven a un reinicio de la API.
#
#   1) bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-05-entrega.sh antes
#   2) Reiniciar la API a mano (Ctrl+C en la terminal de `npm run dev` y volver a correrlo, o `npm run dev -w apps/api`).
#   3) bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-05-entrega.sh despues
#
# `antes` firma una máquina, rechaza otra y abre la bandeja de la Secretaría (genera los avisos de plazo), y guarda lo que vio.
# `despues` comprueba que, con la API recién arrancada, la firma, el rechazo y los avisos son los mismos y no se repitió ningún aviso.
# Requiere `npm run db:up`, la API levantada (con DATABASE_APP_PASSWORD y AUTH_JWT_SECRET) y los datos de demo de HU-04
# (RF-02-datos-demo.sh). Entra como demo.admin (crea un Firmante de prueba «gonza», dueño de las máquinas de ejemplo) y demo.secretaria.
# `despues` (o `limpiar`) deja la base como estaba: borra las visitas y avisos guardados y el Firmante de prueba.
# BASE_URL por defecto http://127.0.0.1:3050 (la API directa). Estado entre las dos fases: $ESTADO (por defecto en el directorio temporal).

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
ESTADO="${ESTADO:-${TMPDIR:-/tmp}/rf05-estado.json}"
FASE="${1:-}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
login() { printf '{"usuario":"%s","password":"Demo-Clave-2026"}' "$1" > "$TMP/l.json"; curl -s -o "$TMP/lr.json" -X POST -H 'Content-Type: application/json' -d @"$TMP/l.json" "$BASE_URL/api/auth/login"; json "$TMP/lr.json" 'b.accessToken'; }
http() { # http <token> <metodo> <ruta> [cuerpo] → código en $CODE, cuerpo en $TMP/r.json
  if [ -n "${4:-}" ]; then printf '%s' "$4" > "$TMP/b.json"; CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d @"$TMP/b.json" "$BASE_URL$3")";
  else CODE="$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X "$2" -H "Authorization: Bearer $1" "$BASE_URL$3")"; fi
}
MAQUINAS="'MAQ-CORRIENTES-M1','MAQ-SANTAFE-M1','MAQ-SANTAFE-M2','MAQ-CALLAO-M1'"
limpiar() {
  sql "delete from firma_visitas where maquina_id in ($MAQUINAS)" >/dev/null
  sql "delete from firma_avisos_plazo where maquina_id in ($MAQUINAS)" >/dev/null
  sql "delete from usuarios where usuario='gonza'" >/dev/null
}
# La vista de la bandeja y de las máquinas, reducida a lo que tiene que repetirse tras el reinicio.
resumen() { # resumen <token firmante> <token secretaria> → JSON en stdout
  http "$1" GET "/api/firmante/maquinas"; cp "$TMP/r.json" "$TMP/maq.json"
  http "$2" GET "/api/firmante/bandeja-secretaria"; cp "$TMP/r.json" "$TMP/ban.json"
  node -e '
    const fs=require("fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const b=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
    const v=(id)=>{const x=m.find(q=>q.id===id); return x&&x.visita ? {autorizada:x.visita.autorizada, fecha:x.visita.fechaAutorizacion, por:x.visita.autorizadoPor, protocolo:x.visita.protocoloAGC} : null;};
    console.log(JSON.stringify({firmada:v("MAQ-CORRIENTES-M1"), rechazados:b.rechazados.map(r=>({id:r.maquinaId,motivo:r.motivo,por:r.rechazadoPor,fecha:r.fecha})), avisos:b.avisosPlazo.map(a=>a.visitaId+"@"+a.fecha).sort()}));
  ' "$TMP/maq.json" "$TMP/ban.json"
}

case "$FASE" in
antes)
  echo "== HU-08 / RF-05 (antes del reinicio) contra $BASE_URL"
  ADMIN="$(login demo.admin)"
  [ -n "$ADMIN" ] && [ "$ADMIN" != "undefined" ] || { echo "  ❌ no pude ingresar como demo.admin: corré antes RF-02-datos-demo.sh"; exit 1; }
  limpiar
  http "$ADMIN" POST "/api/usuarios" '{"usuario":"gonza","nombre":"Firmante de prueba","rol":"firmante","password":"Demo-Clave-2026"}'
  FIRM="$(login gonza)"; SEC="$(login demo.secretaria)"
  { [ -n "$FIRM" ] && [ "$FIRM" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ]; } || { echo "  ❌ no pude crear o ingresar con el Firmante de prueba"; exit 1; }
  echo "1. El Firmante firma la visita de la máquina M1 de Av. Corrientes 1234"
  http "$FIRM" POST "/api/firmante/autorizar" '{"maquinaId":"MAQ-CORRIENTES-M1"}'
  [ "$CODE" = "200" ] && pass "autorizar → 200, protocolo $(json "$TMP/r.json" 'b.autorizacion.protocoloAGC')" || fail "autorizar → $CODE $(cat "$TMP/r.json")"
  echo "2. El Firmante rechaza el informe de la máquina M1 de Av. Santa Fe 3200 con su motivo"
  http "$FIRM" POST "/api/firmante/rechazar" '{"maquinaId":"MAQ-SANTAFE-M1","motivo":"Faltan fotos del foso"}'
  [ "$CODE" = "200" ] && pass "rechazar → 200" || fail "rechazar → $CODE $(cat "$TMP/r.json")"
  echo "3. La Secretaría abre su bandeja: aparecen el rechazo y los avisos de plazo vencido"
  RES="$(resumen "$FIRM" "$SEC")"
  [ "$(node -e 'const r=JSON.parse(process.argv[1]);console.log(r.firmada&&r.firmada.autorizada&&r.rechazados.length>0&&r.avisos.length>0)' "$RES")" = "true" ] && pass "firma, rechazo y $(node -e 'console.log(JSON.parse(process.argv[1]).avisos.length)' "$RES") aviso(s) de plazo a la vista" || fail "la bandeja no muestra lo esperado: $RES"
  sleep 1  # los avisos se guardan en segundo plano
  [ "$(sql "select count(*) from firma_visitas where maquina_id in ($MAQUINAS)")" -ge 2 ] && pass "las visitas quedaron guardadas en firma_visitas" || fail "no hay filas en firma_visitas"
  [ "$(sql "select count(*) from firma_avisos_plazo where maquina_id in ($MAQUINAS)")" -ge 1 ] && pass "los avisos quedaron guardados en firma_avisos_plazo" || fail "no hay filas en firma_avisos_plazo"
  printf '%s' "$RES" > "$ESTADO"
  echo
  echo "Ahora reiniciá la API y corré: bash $0 despues"
  echo "== Resultado: $OK bien, $KO mal"
  [ "$KO" -eq 0 ]
  ;;
despues)
  echo "== HU-08 / RF-05 (después del reinicio) contra $BASE_URL"
  [ -f "$ESTADO" ] || { echo "  ❌ no encuentro $ESTADO: corré antes la fase «antes»"; exit 1; }
  FIRM="$(login gonza)"; SEC="$(login demo.secretaria)"
  { [ -n "$FIRM" ] && [ "$FIRM" != "undefined" ] && [ -n "$SEC" ] && [ "$SEC" != "undefined" ]; } || { echo "  ❌ no pude ingresar: ¿corriste la fase «antes»?"; exit 1; }
  ANTES="$(cat "$ESTADO")"; DESPUES="$(resumen "$FIRM" "$SEC")"
  echo "1. La firma AGC sigue igual (fecha, protocolo y quién la autorizó)"
  [ "$(node -e 'const a=JSON.parse(process.argv[1]),d=JSON.parse(process.argv[2]);console.log(JSON.stringify(a.firmada)===JSON.stringify(d.firmada)&&d.firmada.autorizada===true)' "$ANTES" "$DESPUES")" = "true" ] && pass "la misma firma: $(node -e 'const f=JSON.parse(process.argv[1]).firmada;console.log(f.por+", "+f.protocolo)' "$DESPUES")" || fail "la firma cambió: antes $ANTES / después $DESPUES"
  echo "2. El rechazo con su motivo sigue en la bandeja de la Secretaría"
  [ "$(node -e 'const a=JSON.parse(process.argv[1]),d=JSON.parse(process.argv[2]);console.log(JSON.stringify(a.rechazados)===JSON.stringify(d.rechazados)&&d.rechazados.length>0)' "$ANTES" "$DESPUES")" = "true" ] && pass "el mismo rechazo, con su motivo y su fecha" || fail "el rechazo cambió"
  http "$FIRM" POST "/api/firmante/autorizar" '{"maquinaId":"MAQ-SANTAFE-M1"}'
  [ "$CODE" = "409" ] && pass "el informe rechazado sigue sin poder autorizarse (409)" || fail "autorizar un rechazado → $CODE"
  echo "3. Los avisos de plazo no se perdieron ni se repitieron"
  [ "$(node -e 'const a=JSON.parse(process.argv[1]),d=JSON.parse(process.argv[2]);console.log(JSON.stringify(a.avisos)===JSON.stringify(d.avisos))' "$ANTES" "$DESPUES")" = "true" ] && pass "los mismos avisos, con las mismas fechas" || fail "los avisos cambiaron"
  [ "$(sql "select count(*) from firma_avisos_plazo where maquina_id in ($MAQUINAS)")" = "$(node -e 'console.log(JSON.parse(process.argv[1]).avisos.length)' "$DESPUES")" ] && pass "una fila por aviso en la base: ninguno duplicado" || fail "la cantidad de avisos en la base no coincide"
  echo "4. Una firma ya dada no se puede dar dos veces"
  http "$FIRM" POST "/api/firmante/rechazar" '{"maquinaId":"MAQ-CORRIENTES-M1","motivo":"tarde"}'
  [ "$CODE" = "409" ] && pass "rechazar una visita ya firmada → 409" || fail "rechazar una firmada → $CODE"
  echo "Dejando los datos como estaban…"
  limpiar
  rm -f "$ESTADO"
  echo "== Resultado: $OK bien, $KO mal"
  [ "$KO" -eq 0 ]
  ;;
limpiar)
  limpiar; echo "Listo: se borraron las visitas y avisos guardados de las máquinas de ejemplo y el Firmante de prueba."
  ;;
*)
  echo "Uso: bash $0 antes | despues | limpiar"; exit 2
  ;;
esac

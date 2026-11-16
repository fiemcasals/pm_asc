#!/usr/bin/env bash
# HU-10 / RF-05 — El acuse de recibo guardado se vuelve a leer al reiniciar la API y no se duplica por alerta.
#
#   bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-05-entrega.sh                       # parte 1: registra y prueba la unicidad
#   (reiniciá la API: Ctrl+C en la terminal de `npm run dev` y volvé a correr `npm run dev`)
#   bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-05-entrega.sh --despues-de-reiniciar   # parte 2: lo relee y limpia
#
# Requiere `npm run db:up` y la API levantada (BASE_URL por defecto http://127.0.0.1:3050). Usa la alerta ALT-MAICON-001
# de la ECA «MAICON Mantenimiento» y deja la base como estaba al terminar la parte 2.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
ALERTA="ALT-MAICON-001"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OK=0; KO=0
pass() { echo "  ✅ $1"; OK=$((OK+1)); }
fail() { echo "  ❌ $1"; KO=$((KO+1)); }
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
json() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(eval(process.argv[2]))' "$1" "$2"; }
acuse() { curl -s -o "$TMP/$2.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "{\"usuario\":\"$1\"}" "$BASE_URL/api/eca/alertas/$ALERTA/acuse"; }

if [ "${1:-}" = "--despues-de-reiniciar" ]; then
  echo "== HU-10 / RF-05, parte 2: después de reiniciar la API"
  curl -s -o "$TMP/al.json" "$BASE_URL/api/eca/alertas?eca=maicon"
  U="$(json "$TMP/al.json" 'JSON.stringify((b.alertas.find(a=>a.alerta.id==="'$ALERTA'").alerta.acuseRecibo||{}).usuario||null)')"
  [ "$U" = '"RF05.entrega.primero"' ] && pass "la alerta figura con su acuse guardado: usuario RF05.entrega.primero" || fail "la alerta no muestra el acuse guardado (usuario: $U)"
  F="$(json "$TMP/al.json" 'b.alertas.find(a=>a.alerta.id==="'$ALERTA'").alerta.acuseRecibo.fechaHora')"
  [ "$F" = "$(sql "select to_char(fecha_hora at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from acuses_recibo_legal where alerta_id='$ALERTA'")" ] && pass "con la misma fecha y hora que la fila de la base ($F)" || fail "la fecha informada ($F) no es la de la base"
  sql "delete from acuses_recibo_legal where usuario like 'RF05.entrega.%'" >/dev/null
  echo "Limpiado: quedan $(sql "select count(*) from acuses_recibo_legal where usuario like 'RF05.entrega.%'") acuses de la prueba."
  echo; echo "== Resultado: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]; exit $?
fi

echo "== HU-10 / RF-05, parte 1 contra $BASE_URL"
sql "delete from acuses_recibo_legal where alerta_id='$ALERTA'" >/dev/null
echo "1. El primer POST registra el acuse"
c="$(acuse RF05.entrega.primero p1)"
[ "$c" = "201" ] && [ "$(json "$TMP/p1.json" 'b.yaRegistrado')" = "false" ] && pass "POST → $c, yaRegistrado: false" || fail "primer POST → $c $(cat "$TMP/p1.json")"
echo "2. Un segundo POST de la misma alerta no crea otra fila y devuelve el acuse ya registrado"
c="$(acuse RF05.entrega.segundo p2)"
[ "$c" = "201" ] && [ "$(json "$TMP/p2.json" 'b.yaRegistrado+"|"+b.acuse.usuario')" = "true|RF05.entrega.primero" ] && pass "POST → $c, yaRegistrado: true y el usuario es el del primero (no el del segundo)" || fail "segundo POST → $c $(cat "$TMP/p2.json")"
[ "$(json "$TMP/p1.json" 'b.acuse.fechaHora')" = "$(json "$TMP/p2.json" 'b.acuse.fechaHora')" ] && pass "con la misma fecha y hora" || fail "las fechas difieren"
[ "$(sql "select count(*) from acuses_recibo_legal where alerta_id='$ALERTA'")" = "1" ] && pass "en la base hay 1 sola fila de esa alerta" || fail "hay más de una fila"
echo "3. La base impide sola un segundo acuse de la misma alerta"
out="$(sql "insert into acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, tipo_alerta) values ('$ALERTA','M','MAICON Mantenimiento','RF05.entrega.directo','Falla')" 2>&1)"
echo "$out" | grep -q "acuses_recibo_alerta_unica" && pass "el INSERT directo falla por la restricción acuses_recibo_alerta_unica" || fail "el INSERT directo no fue rechazado: $out"
echo
echo "Ahora reiniciá la API y corré este script con --despues-de-reiniciar."
echo "== Resultado parte 1: $OK verificaciones OK, $KO fallidas"; [ "$KO" = "0" ]

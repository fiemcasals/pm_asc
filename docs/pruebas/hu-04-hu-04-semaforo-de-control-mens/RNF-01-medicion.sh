#!/usr/bin/env bash
# HU-04 / RNF-01 — Mide el semáforo con volumen: 500 edificios y 20.000 inspecciones, SIN y CON el índice por fecha.
#
#   bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RNF-01-medicion.sh            # siembra, mide y limpia
#
# Requiere `npm run db:up`, la API levantada (npm run dev) y los datos de RF-02-datos-demo.sh (se usa su Secretaría
# `demo.secretaria` para consultar). Los 500 edificios "VOL …" y sus inspecciones se borran al terminar.
# Mide GET /api/semaforo?fecha=2026-11-25 100 veces (p50/p95/máximo) y muestra el EXPLAIN de la consulta del semáforo.
#
# Resultado esperado: con el índice el plan usa inspecciones_checklist_created_at_idx (Index Only Scan o Bitmap Index Scan) y el
# p95 de la API es menor a 500 ms. Sin el índice el plan lee toda la tabla ("Seq Scan on inspecciones_checklist").

set -u
API="${API_URL:-http://127.0.0.1:3050/api}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
DB_NAME="${DB_NAME:-ascensores}"
IDX=inspecciones_checklist_created_at_idx

sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d "$DB_NAME" -tAc "$1"; }
sqlf() { docker exec -i "$DB_CONTAINER" psql -U ascensores -d "$DB_NAME" -v ON_ERROR_STOP=1 -q; }

limpiar() {
  sql "delete from inspecciones_checklist where consorcio_id in (select id::text from consorcios where nombre like 'VOL %')" >/dev/null
  sql "delete from consorcios where nombre like 'VOL %'" >/dev/null
}
trap limpiar EXIT

echo "== Sembrando 500 edificios, 1.000 máquinas y 20.000 inspecciones (últimos 24 meses) =="
limpiar
sqlf <<'SQL'
insert into consorcios (nombre, direccion, eca_nombre)
  select 'VOL ' || g, 'Calle ' || g, 'ECA-VOL' from generate_series(1, 500) g;
insert into maquinas (consorcio_id, referencia_agc)
  select c.id, 'M' || n from consorcios c, generate_series(1, 2) n where c.nombre like 'VOL %';
insert into inspecciones_checklist (consorcio_id, maquina_id, referencia_agc, tipo_maquina, version_checklist, created_at)
  select m.consorcio_id::text, m.id::text, m.referencia_agc, 'traccion', 'vol',
         timestamptz '2026-11-12 12:00-03' - (random() * interval '730 days')
    from maquinas m join consorcios c on c.id = m.consorcio_id and c.nombre like 'VOL %',
         generate_series(1, 20) k;
vacuum analyze inspecciones_checklist;
vacuum analyze maquinas;
vacuum analyze consorcios;
SQL
echo "Edificios VOL: $(sql "select count(*) from consorcios where nombre like 'VOL %'") · inspecciones VOL: $(sql "select count(*) from inspecciones_checklist where version_checklist = 'vol'")"

TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"usuario":"demo.secretaria","password":"Demo-Clave-2026"}' | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(r.accessToken||r.token||'')")
if [ -z "$TOKEN" ]; then echo "No pude iniciar sesión como demo.secretaria: corré antes RF-02-datos-demo.sh"; exit 1; fi

medir() {
  API="$API" TOKEN="$TOKEN" node -e "
    (async () => {
      const t = [];
      for (let i = 0; i < 110; i++) {
        const a = performance.now();
        const r = await fetch(process.env.API + '/semaforo?fecha=2026-11-25', { headers: { Authorization: 'Bearer ' + process.env.TOKEN } });
        const j = await r.json();
        if (r.status !== 200) { console.log('HTTP', r.status); process.exit(1); }
        if (i >= 10) t.push(performance.now() - a); // las 10 primeras calientan la conexión
        if (i === 0) console.log('  edificios devueltos:', j.edificios.length);
      }
      t.sort((x, y) => x - y);
      const p = (q) => t[Math.min(t.length - 1, Math.ceil(q * t.length) - 1)].toFixed(1);
      console.log('  100 consultas: p50', p(0.5), 'ms · p95', p(0.95), 'ms · máximo', t[t.length - 1].toFixed(1), 'ms');
    })();"
}

explicar() {
  sqlf <<'SQL' | grep -E "Scan|Execution Time|Planning Time"
set app.rol_actual = 'administrador';
explain (analyze, costs off, timing off)
WITH ventana AS (
  SELECT make_timestamp(2026, 11, 1, 0, 0, 0) AT TIME ZONE 'America/Argentina/Buenos_Aires' AS desde,
         (make_timestamp(2026, 11, 25, 0, 0, 0) + interval '1 day') AT TIME ZONE 'America/Argentina/Buenos_Aires' AS hasta
), insp AS (
  SELECT m.consorcio_id, m.id AS maquina_id, i.created_at
    FROM inspecciones_checklist i
    JOIN maquinas m ON m.id::text = i.maquina_id AND m.consorcio_id::text = i.consorcio_id
    JOIN ventana v ON i.created_at >= v.desde AND i.created_at < v.hasta
)
SELECT c.id,
       (SELECT count(DISTINCT maquina_id) FROM insp WHERE insp.consorcio_id = c.id),
       (SELECT max(created_at) FROM insp WHERE insp.consorcio_id = c.id)
  FROM consorcios c;
SQL
}

echo; echo "== SIN el índice =="
sql "drop index if exists $IDX" >/dev/null
medir; explicar

echo; echo "== CON el índice (el que crea la migración 015) =="
sql "create index if not exists $IDX on inspecciones_checklist (created_at) include (consorcio_id, maquina_id)" >/dev/null
sql "vacuum analyze inspecciones_checklist" >/dev/null
medir; explicar

echo; echo "Limpiando los datos VOL…"

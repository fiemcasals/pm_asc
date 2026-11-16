#!/usr/bin/env bash
# HU-02 / RNF-01 — Abrir la pestaña de Asignación de Roles con 500 edificios: una sola llamada contra 500 lecturas.
#
#   bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RNF-01-medicion.sh
#
# Requiere `npm run db:up`, la API levantada y los datos demo de HU-04 (se entra como demo.secretaria). Siembra 500 edificios
# «VOL2 …» con su terna, mide cómo abría la pestaña antes (un GET de roles por edificio, todos a la vez) y como abre ahora
# (GET /api/consorcios/roles, una llamada), y borra todo al terminar. BASE_URL por defecto http://127.0.0.1:3050.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3050}"
DB_CONTAINER="${DB_CONTAINER:-mant-asc-db}"
sql() { docker exec "$DB_CONTAINER" psql -U ascensores -d ascensores -tAc "$1"; }
limpiar() { sql "delete from consorcios where nombre like 'VOL2 %'" >/dev/null; }
trap limpiar EXIT

limpiar
echo "== Sembrando 500 edificios con su terna"
sql "insert into consorcios (nombre, direccion, eca_nombre) select 'VOL2 ' || lpad(g::text, 3, '0'), 'Calle ' || g, 'ECA-VOL' from generate_series(1, 500) g" >/dev/null
sql "insert into roles_edificio (consorcio_id, rt_calle_nombre, rt_calle_telefono, firmante_nombre, firmante_email, eca_nombre, eca_email)
     select id, 'RT ' || nombre, '11 4000-0000', 'Firmante', 'f@vol.com', 'ECA', 'e@vol.com' from consorcios where nombre like 'VOL2 %'" >/dev/null
echo "Edificios VOL2: $(sql "select count(*) from consorcios where nombre like 'VOL2 %'") · ternas: $(sql "select count(*) from roles_edificio r join consorcios c on c.id=r.consorcio_id where c.nombre like 'VOL2 %'")"

BASE_URL="$BASE_URL" node - <<'JS'
(async () => {
  const B = process.env.BASE_URL + '/api';
  const l = await (await fetch(`${B}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'demo.secretaria', password: 'Demo-Clave-2026' }) })).json();
  if (!l.accessToken) { console.log('No pude ingresar como demo.secretaria: corré antes RF-02-datos-demo.sh'); process.exit(1); }
  const h = { Authorization: `Bearer ${l.accessToken}` };
  const lista = await (await fetch(`${B}/consorcios`, { headers: h })).json();
  const mios = lista.filter((c) => c.nombre.startsWith('VOL2 '));
  console.log(`La lista de consorcios trae ${lista.length} edificios (${mios.length} de la prueba)`);

  // ANTES: la pestaña pedía la terna de cada edificio, todas a la vez (Promise.all).
  let t0 = performance.now();
  const resp = await Promise.all(lista.map((c) => fetch(`${B}/consorcios/${c.id}/roles`, { headers: h }).then((r) => r.status).catch(() => 'red')));
  const antes = performance.now() - t0;
  const fallos = resp.filter((s) => s !== 200);
  console.log(`\nANTES  (${lista.length} lecturas, una por edificio): ${antes.toFixed(0)} ms · errores de lectura: ${fallos.length}${fallos.length ? ' (' + [...new Set(fallos)].join(', ') + ')' : ''}`);

  // AHORA: una sola llamada. 20 veces para el p50 y el p95.
  const t = [];
  let ternas = 0;
  for (let i = 0; i < 20; i++) {
    t0 = performance.now();
    const r = await fetch(`${B}/consorcios/roles`, { headers: h });
    const j = await r.json();
    if (r.status !== 200) { console.log('AHORA falló: HTTP', r.status); process.exit(1); }
    ternas = j.length;
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  console.log(`AHORA  (1 llamada, ${ternas} ternas, 20 repeticiones): p50 ${t[9].toFixed(0)} ms · p95 ${t[18].toFixed(0)} ms · máximo ${t[19].toFixed(0)} ms · errores: 0`);
})();
JS
echo; echo "Limpiando los datos VOL2…"

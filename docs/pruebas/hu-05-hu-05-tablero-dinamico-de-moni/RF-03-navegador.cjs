// HU-05 / RF-03 — Prueba con Playwright: el visor del backoffice rotula la foto del frente como «Frente de cabina y botonera».
//
//   node docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-03-navegador.cjs [carpeta-de-capturas]
//   CARGA=30 node docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-03-navegador.cjs        # además mide 30 pedidos del detalle de la visita
//
// Necesita la API con los datos de demo de HU-04 RF-02 y la web compilada (WEB_URL, por defecto https://localhost:4173:
// npm run build -w apps/web && npm run preview -w apps/web). La API en vivo ya no tiene las máquinas de ejemplo (HU-08 RF-06), así que el
// recorrido es real: crea un edificio de prueba con su terna (rt.beto, demo.firmante y ECA Demo), el RT rt.beto cierra un informe con las dos
// fotos obligatorias de HU-17 RF-11, el Portal Firmante crea la visita (HU-08 RF-07) y demo.secretaria la mira en Secretaría › Monitoreo ›
// «Ver fotos e informe». Al terminar borra el edificio por la API (se llevan en cascada su informe y la máquina de la vista de firma) y la
// visita guardada en la base: no deja nada. Deja RF-03-paso-1.png y RF-03-paso-2.png en imagenes/.
const path = require('path');
const { execFileSync } = require('child_process');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const API = process.env.API_URL || 'http://127.0.0.1:3050/api';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const CARGA = Number(process.env.CARGA || 0);
const CLAVE = 'Demo-Clave-2026';
const ROTULO = 'Frente de cabina y botonera';
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };
const T = (id) => `[data-testid="${id}"]`;

async function api(metodo, ruta, token, cuerpo) {
  const r = await fetch(API + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* sin cuerpo */ }
  return { status: r.status, json, texto };
}
const ingresar = async (usuario) => (await api('POST', '/auth/login', null, { usuario, password: CLAVE })).json?.accessToken;

async function captura(p, sel, archivo) {
  await p.addStyleTag({ path: CSS });
  const el = p.locator(sel).first();
  await el.evaluate((e) => { e.classList.add('scrum-qa-foco'); e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(SALIDA, archivo) });
  await el.evaluate((e) => e.classList.remove('scrum-qa-foco'));
}

(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  let edificio = null;
  const tokens = {};
  try {
    for (const u of ['demo.admin', 'rt.beto', 'demo.secretaria']) {
      tokens[u] = await ingresar(u);
      if (!tokens[u]) throw new Error(`No pude ingresar como ${u}: corré antes RF-02-datos-demo.sh de HU-04`);
    }
    // 1) Un edificio de prueba con su terna: rt.beto, demo.firmante y ECA Demo
    const e = await api('POST', '/consorcios', tokens['demo.admin'], { nombre: 'DEMO HU05 rótulo del frente', direccion: 'Calle Rótulo 1', maquinas: [{ referenciaAgc: 'M1' }] });
    edificio = e.json?.id;
    ok(e.status === 201 && edificio, `se crea el edificio de prueba «Calle Rótulo 1» → ${e.status}`);
    const roles = await api('PUT', `/consorcios/${edificio}/roles`, tokens['demo.admin'], {
      rtCalle: { nombre: 'rt.beto', telefono: '11 0000-0000', email: 'rt@demo.com' },
      firmante: { nombre: 'demo.firmante', telefono: '11 0000-0001', email: 'f@demo.com' },
      eca: { nombre: 'ECA Demo', telefono: '11 0000-0002', email: 'e@demo.com' },
    });
    ok(roles.status === 200, `se le asigna la terna → ${roles.status}`);
    const maquinaId = e.json.maquinas?.[0]?.id ?? (await api('GET', `/consorcios/${edificio}`, tokens['demo.admin'])).json.maquinas[0].id;

    // 2) El RT cierra un informe con las dos fotos obligatorias (dibujadas en el momento: no hay cámara)
    await p.goto(WEB, { waitUntil: 'load' });
    const foto = await p.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 400;
      const x = c.getContext('2d');
      x.fillStyle = '#cfd8dc'; x.fillRect(0, 0, 640, 400);
      x.fillStyle = '#90a4ae'; x.fillRect(120, 30, 400, 340);
      x.fillStyle = '#b0bec5'; x.fillRect(130, 40, 190, 320); x.fillRect(320, 40, 190, 320);
      x.fillStyle = '#263238'; x.font = 'bold 22px sans-serif'; x.fillText('foto de prueba', 20, 26);
      return c.toDataURL('image/jpeg', 0.7);
    });
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=';
    const trazo = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);
    const informe = await api('POST', '/informes-visita', tokens['rt.beto'], {
      consorcioId: edificio, horaDispositivo: new Date().toISOString(),
      equipos: [{ maquinaId, referenciaAgc: 'M1', tipo: 'traccion', estadoEquipo: 'en_uso', respuestas: { cabina: { a: 'ok' } }, observaciones: {},
        fotos: { 'obligatoria:frente': { dataUrl: foto }, 'obligatoria:cables': { dataUrl: foto } } }],
      firma: { nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', imagen: png, trazos: [trazo] },
    });
    ok(informe.status === 201, `rt.beto cierra el informe con las dos fotos obligatorias → ${informe.status} ${informe.status === 201 ? '' : informe.texto.slice(0, 160)}`);

    // 3) Por la API: el detalle de la visita rotula la foto del frente como «Frente de cabina y botonera»
    const idVisita = `MAQ-${edificio}-${maquinaId}`;
    const detalle = await api('GET', `/backoffice/visitas/${idVisita}`, tokens['demo.secretaria']);
    const etiquetas = (detalle.json?.fotos || []).map((f) => f.etiqueta);
    ok(detalle.status === 200 && etiquetas.join() === `Cables,${ROTULO}`, `criterio 1 (API): el detalle trae las fotos «${etiquetas.join('», «')}»`);
    ok(!detalle.texto.includes('Frente del edificio'), 'criterio 1 (API): y ya no dice «Frente del edificio»');

    // 4) En el navegador: Secretaría › Monitoreo › Ver fotos e informe
    await p.goto(WEB, { waitUntil: 'load' });
    await p.fill(T('login-usuario'), 'demo.secretaria');
    await p.fill(T('login-password'), CLAVE);
    await p.keyboard.press('Enter');
    await p.locator('[data-testid="tab-secretaria"]:visible').first().waitFor({ timeout: 30000 });
    await p.locator('[data-testid="tab-secretaria"]:visible').first().click();
    await p.click(T('pestana-monitoreo'));
    await p.fill('[aria-label="Filtrar por dirección"]', 'Calle Rótulo');
    const fila = p.locator(T('fila-monitoreo'), { hasText: 'Calle Rótulo 1' });
    await fila.first().waitFor({ timeout: 20000 });
    ok((await fila.count()) === 1 && /Recorrida/.test(await fila.first().textContent()), 'la visita del edificio de prueba figura «Recorrida» en la tabla');
    await captura(p, T('tabla-monitoreo'), 'RF-03-paso-1.png');
    await fila.first().locator(T('accion-ver')).click();
    await p.waitForSelector(T('visor-fotos'), { timeout: 15000 });
    const rotulos = await p.locator(`${T('visor-fotos')} figcaption`).allTextContents();
    ok(rotulos.join('|') === `Cables|${ROTULO}`, `criterio 1 (pantalla): el visor rotula las fotos «${rotulos.join('», «')}»`);
    ok(!(await p.locator(T('visor-fotos')).textContent()).includes('del edificio'), 'criterio 1 (pantalla): ningún rótulo dice «del edificio»');
    ok((await p.locator(`${T('visor-fotos')} img`).count()) === 2, 'las dos fotos se ven como imagen');
    await captura(p, T('visor-fotos'), 'RF-03-paso-2.png');

    // 5) Carga (opcional): N pedidos del detalle
    if (CARGA > 0) {
      const t = []; let fallas = 0;
      for (let i = 0; i < CARGA; i++) { const t0 = Date.now(); const r = await api('GET', `/backoffice/visitas/${idVisita}`, tokens['demo.secretaria']); if (r.status !== 200 || !r.texto.includes(ROTULO)) fallas++; t.push(Date.now() - t0); }
      t.sort((a, c) => a - c);
      console.log(`CARGA ${CARGA}: el detalle → ${fallas} fallidos · promedio ${Math.round(t.reduce((s, v) => s + v, 0) / t.length)} ms · p95 ${t[Math.ceil(t.length * 0.95) - 1]} ms · máx ${t[t.length - 1]} ms`);
      if (fallas) process.exitCode = 1;
    }
  } finally {
    // Limpieza: borrar el edificio por la API (lleva en cascada el informe y saca la máquina de la vista de firma) y la visita guardada
    if (edificio) {
      const d = await api('DELETE', `/consorcios/${edificio}`, tokens['demo.admin']);
      console.log(`limpieza: el edificio de prueba se borra → ${d.status}`);
      try {
        execFileSync('docker', ['exec', 'mant-asc-db', 'psql', '-U', 'ascensores', '-d', 'ascensores', '-tAc', `delete from firma_visitas where maquina_id like 'MAQ-${edificio}-%'`], { stdio: 'ignore' });
        console.log('limpieza: la visita guardada en la base se borra');
      } catch { console.log('limpieza: no se pudo borrar la visita guardada (sin docker): queda sin efecto, el edificio ya no existe'); }
      const mon = await api('GET', '/backoffice/monitoreo?direccion=R%C3%B3tulo', tokens['demo.secretaria']);
      console.log(`limpieza: el monitoreo ya no lista el edificio de prueba → ${(mon.json?.items || []).length === 0}`);
    }
    await b.close();
  }
})().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });

// HU-17 / RF-12 — Prueba con Playwright: la foto de la alerta de una parada llega por una ruta aparte, con sesión y una sola vez.
//
//   node docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-12-navegador.cjs [carpeta-de-capturas]
//   CARGA=30 node docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-12-navegador.cjs        # además mide 30 pedidos de la lista y de la foto
//
// Necesita la API con los datos de demo de HU-04 RF-02 y la web compilada (WEB_URL, por defecto https://localhost:4173:
// npm run build -w apps/web && npm run preview -w apps/web). Como rt.beto carga un reporte de parada con una foto de «DEMO Cabildo 1540 · M1»,
// mira por la API que la lista no trae la imagen, entra al navegador como demo.eca y comprueba que la alerta muestra la foto pedida por su
// ruta, con la sesión, una sola vez. Al terminar, el Firmante (demo.firmante) rechaza el reporte y el equipo vuelve a Normal: no deja nada.
// Deja RF-12-paso-1.png y RF-12-paso-2.png en imagenes/.
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const API = process.env.API_URL || 'http://127.0.0.1:3050/api';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const CARGA = Number(process.env.CARGA || 0);
const CLAVE = 'Demo-Clave-2026';
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };
const T = (id) => `[data-testid="${id}"]`;

async function api(metodo, ruta, token, cuerpo) {
  const r = await fetch(API + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON (una imagen) */ }
  return { status: r.status, json, texto, bytes: Buffer.byteLength(texto) };
}
const ingresar = async (usuario) => (await api('POST', '/auth/login', null, { usuario, password: CLAVE })).json.accessToken;

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
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1180, height: 900 } });
  const p = await ctx.newPage();
  let reporteId = null;
  let tokens = {};
  try {
    for (const u of ['demo.eca', 'rt.beto', 'demo.firmante', 'demo.secretaria']) {
      tokens[u] = await ingresar(u);
      if (!tokens[u]) throw new Error(`No pude ingresar como ${u}: corré antes RF-02-datos-demo.sh de HU-04`);
    }
    const flota = (await api('GET', '/eca/maquinas', tokens['demo.eca'])).json;
    const maquina = (flota.maquinas || flota).find((m) => /Cabildo 1540/.test(m.edificio?.consorcio || m.edificio?.direccion || '') && m.codigoAGC === 'M1');
    if (!maquina) throw new Error('No encontré DEMO Cabildo 1540 · M1 en la flota de demo.eca');
    // Si quedó un reporte pendiente de otra corrida, el Firmante lo rechaza para empezar limpio
    const previos = (await api('GET', '/paradas', tokens['demo.secretaria'])).json.filter((r) => r.maquinaId === maquina.id && r.confirmacion === 'Pendiente de confirmación');
    for (const r of previos) await api('POST', `/paradas/${r.id}/rechazar`, tokens['demo.firmante'], { motivo: 'Limpieza antes de la prueba de RF-12' });

    // Una foto de cabina trabada dibujada en el momento (no hay cámara): ~1280 px, JPEG
    await p.goto(WEB, { waitUntil: 'load' });
    const foto = await p.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 800;
      const x = c.getContext('2d');
      x.fillStyle = '#37474f'; x.fillRect(0, 0, 1280, 800);
      x.fillStyle = '#546e7a'; x.fillRect(240, 60, 800, 680);
      x.fillStyle = '#78909c'; x.fillRect(260, 80, 380, 640); x.fillRect(640, 80, 380, 640);
      x.fillStyle = '#ffd54f'; x.fillRect(260, 700, 760, 24);
      x.fillStyle = '#cfd8dc'; x.font = 'bold 44px sans-serif'; x.fillText('CABINA TRABADA (foto de prueba)', 300, 60);
      for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},0.35)`; x.fillRect(Math.random() * 1280, Math.random() * 800, 5, 5); }
      return c.toDataURL('image/jpeg', 0.7);
    });
    const bytesFoto = Buffer.from(foto.split(',')[1], 'base64').length;

    // 1) El RT carga el reporte con la foto: la respuesta no repite la imagen
    const r = await api('POST', '/paradas', tokens['rt.beto'], { maquinaId: maquina.id, estado: 'Fuera de Servicio', causa: 'Cabina trabada entre pisos (prueba RF-12)', fotos: [foto] });
    ok(r.status === 201, `el RT carga el reporte con una foto de ${Math.round(bytesFoto / 1024)} KB → ${r.status}`);
    reporteId = r.json.id;
    ok(!r.texto.includes('base64') && r.json.fotoRuta === `/api/paradas/${reporteId}/foto`, `criterio 1: la respuesta no repite la imagen y trae la ruta ${r.json.fotoRuta}`);

    // 2) La lista de la Secretaría trae la cantidad y ninguna imagen
    const lista = await api('GET', '/paradas', tokens['demo.secretaria']);
    const fila = lista.json.find((x) => x.id === reporteId);
    ok(fila && fila.fotos === 1 && !('fotoUrl' in fila) && !lista.texto.includes('base64'), `criterio 1: la lista trae fotos=${fila?.fotos}, sin fotoUrl ni imágenes`);
    // Cada corrida deja un reporte rechazado en la lista de demo: se mide lo que pesa cada reporte, no el total (el de 5 reportes de 500 KB está en paradas-fotos.e2e-spec)
    const porReporte = Math.round(lista.bytes / lista.json.length);
    ok(porReporte < 2048 && porReporte < bytesFoto / 10, `criterio 3: la lista pesa ${lista.bytes} bytes para ${lista.json.length} reporte(s): ${porReporte} bytes por reporte, y la foto pesa ${bytesFoto}`);

    // 3) La ruta de la foto pide sesión y la sirve con caché de un año
    const sinSesion = await fetch(`${API}/paradas/${reporteId}/foto`);
    ok(sinSesion.status === 401, `criterio 2: sin sesión, la ruta responde ${sinSesion.status}`);
    const conSesion = await fetch(`${API}/paradas/${reporteId}/foto`, { headers: { Authorization: `Bearer ${tokens['demo.eca']}` } });
    const cabeceras = conSesion.headers;
    ok(conSesion.status === 200 && /^image\/jpeg/.test(cabeceras.get('content-type')) && cabeceras.get('cache-control') === 'private, max-age=31536000, immutable', `criterio 2: con la sesión de la ECA → 200 ${cabeceras.get('content-type')}, cache-control «${cabeceras.get('cache-control')}»`);
    ok((await conSesion.arrayBuffer()).byteLength === bytesFoto, 'criterio 2: y es la misma foto que mandó el RT (mismos bytes)');

    // 4) En el navegador: la ECA ve la foto de su alerta, pedida por la ruta, con sesión y una sola vez
    const pedidosDeFoto = [];
    p.on('request', (q) => { if (/\/api\/paradas\/[^/]+\/foto$/.test(q.url())) pedidosDeFoto.push({ url: q.url(), autorizacion: Boolean(q.headers()['authorization']) }); });
    await p.goto(WEB, { waitUntil: 'load' });
    await p.fill(T('login-usuario'), 'demo.eca');
    await p.fill(T('login-password'), CLAVE);
    await p.keyboard.press('Enter');
    await p.waitForSelector(T('alerta-fuera-de-servicio'), { timeout: 30000 });
    const img = p.locator(T('foto-cabina-trabada'));
    await img.waitFor({ timeout: 20000 });
    await p.waitForFunction(() => { const i = document.querySelector('[data-testid="foto-cabina-trabada"]'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 20000 });
    const origen = await img.getAttribute('data-origen');
    const ancho = await img.evaluate((i) => i.naturalWidth);
    ok(origen === 'ruta' && ancho === 1280, `criterio 2: la alerta de la ECA muestra la foto pedida por la ruta (data-origen=${origen}, ${ancho} px de ancho)`);
    ok(pedidosDeFoto.length === 1 && pedidosDeFoto[0].autorizacion && pedidosDeFoto[0].url.endsWith(`/api/paradas/${reporteId}/foto`), `criterio 2: un solo pedido de la foto, con la sesión (${pedidosDeFoto.length})`);
    await captura(p, T('contenedor-foto-cabina-trabada'), 'RF-12-paso-1.png');

    // 5) Cambiar de pantalla y volver no la baja de nuevo
    await p.locator('[data-testid="tab-firmante"]:visible').first().click();
    await p.waitForTimeout(800);
    ok((await p.locator(T('foto-cabina-trabada')).count()) === 0, 'al cambiar de pantalla la foto sale de la pantalla');
    await p.locator('[data-testid="tab-eca"]:visible').first().click();
    await p.waitForSelector(T('foto-cabina-trabada'), { timeout: 20000 });
    await p.waitForTimeout(500);
    ok(pedidosDeFoto.length === 1, `criterio 2: al salir y volver al Portal ECA la foto no se baja de nuevo (pedidos: ${pedidosDeFoto.length})`);

    // 6) En un celular de 360 px
    await p.setViewportSize({ width: 360, height: 740 });
    await p.waitForTimeout(600);
    await captura(p, T('contenedor-foto-cabina-trabada'), 'RF-12-paso-2.png');
    ok((await img.evaluate((i) => i.getBoundingClientRect().width)) <= 360, 'la foto entra en un celular de 360 px');

    // 7) Carga (opcional): N pedidos de la lista y de la foto
    if (CARGA > 0) {
      const medir = async (f) => { const t = []; let fallas = 0; for (let i = 0; i < CARGA; i++) { const t0 = Date.now(); const x = await f(); if (!x) fallas++; t.push(Date.now() - t0); } t.sort((a, c) => a - c); return { fallas, prom: Math.round(t.reduce((s, v) => s + v, 0) / t.length), p95: t[Math.ceil(t.length * 0.95) - 1], max: t[t.length - 1] }; };
      const l = await medir(async () => (await api('GET', '/paradas', tokens['demo.secretaria'])).status === 200);
      const f = await medir(async () => { const x = await fetch(`${API}/paradas/${reporteId}/foto`, { headers: { Authorization: `Bearer ${tokens['demo.eca']}` } }); await x.arrayBuffer(); return x.status === 200; });
      console.log(`CARGA ${CARGA}: la lista → ${l.fallas} fallidos · promedio ${l.prom} ms · p95 ${l.p95} ms · máx ${l.max} ms (${lista.bytes} bytes)`);
      console.log(`CARGA ${CARGA}: la foto  → ${f.fallas} fallidos · promedio ${f.prom} ms · p95 ${f.p95} ms · máx ${f.max} ms (${bytesFoto} bytes)`);
      if (l.fallas + f.fallas > 0) process.exitCode = 1;
    }
  } finally {
    // Deja los datos de demo como estaban: el Firmante rechaza el reporte y el equipo vuelve a Normal
    if (reporteId && tokens['demo.firmante']) {
      const limpio = await api('POST', `/paradas/${reporteId}/rechazar`, tokens['demo.firmante'], { motivo: 'Cierre de la prueba de RF-12' });
      console.log(`limpieza: el Firmante rechazó el reporte de prueba → ${limpio.status}`);
    }
    await b.close();
  }
})().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });

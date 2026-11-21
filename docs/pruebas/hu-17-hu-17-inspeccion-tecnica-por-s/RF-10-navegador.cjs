// HU-17 / RF-10 — Prueba con Playwright, en un celular de 360 px: la Inspección Técnica arranca desde el inicio de visita.
//
//   node docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-10-navegador.cjs
//
// Necesita la API con los datos de demo de HU-04 RF-02 y la web compilada (WEB_URL, por defecto https://localhost:4173:
// npm run build -w apps/web && npm run preview -w apps/web). Entra como rt.beto con la ubicación del celular en «DEMO Cabildo 1540»,
// abre la inspección sin visita, inicia la visita desde el mapa, recarga con y sin señal, y cierra sesión. Deja RF-10-paso-1.png a
// RF-10-paso-3.png en imagenes/. Registra un inicio de inspección de rt.beto en ese edificio (como haría el RT).
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const CABILDO = { latitude: -34.56, longitude: -58.45, accuracy: 8 }; // el punto de «DEMO Cabildo 1540» en los datos de demo
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };

async function captura(p, sel, archivo) {
  await p.addStyleTag({ path: CSS });
  const el = p.locator(sel).first();
  await el.evaluate((e) => { e.classList.add('scrum-qa-foco'); e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SALIDA, archivo) });
  await el.evaluate((e) => e.classList.remove('scrum-qa-foco'));
}
const irAInspeccion = (p) => p.locator('[data-testid="tab-inspeccion"]:visible, [data-testid="mob-tab-inspeccion"]:visible').first().click();

(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, geolocation: CABILDO, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  try {
    await p.goto(WEB, { waitUntil: 'load' });
    await p.fill('[data-testid="login-usuario"]', 'rt.beto');
    await p.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(2500);
    if (await p.locator('[data-testid="consentimiento-aceptar"]').count()) { await p.click('[data-testid="consentimiento-aceptar"]'); await p.waitForTimeout(1500); }
    await p.evaluate(() => localStorage.removeItem('mant_asc_inspeccion_rt'));

    // Criterio 2: sin visita iniciada, la inspección explica cómo iniciarla
    await irAInspeccion(p);
    await p.waitForSelector('[data-testid="inspeccion-sin-visita"]', { timeout: 15000 });
    const texto = await p.textContent('[data-testid="inspeccion-sin-visita-texto"]');
    ok(/Mapa del RT/.test(texto) && /Iniciar inspección/.test(texto), `criterio 2: sin visita dice «${texto.replace(/\s+/g, ' ').trim().slice(0, 90)}…»`);
    const demo = await p.evaluate(() => /Callao 450|Selector provisorio|Principal Tracción|Montavehículos/.test(document.body.innerText));
    ok(!demo, 'criterio 3: no aparece el edificio de demo ni el selector provisorio');
    await captura(p, '[data-testid="inspeccion-sin-visita"]', 'RF-10-paso-1.png');

    // Criterio 1: iniciar la visita desde el mapa abre la inspección de ese edificio
    await p.click('[data-testid="inspeccion-ir-al-mapa"]');
    const pin = p.locator('[data-testid="mapa-rt-pines"] .mapa-pin[aria-label^="DEMO Cabildo 1540"]');
    await pin.waitFor({ timeout: 30000 });
    await pin.evaluate((e) => e.click());
    await p.click('[data-testid="tarjeta-verificar"]');
    await p.waitForSelector('[data-testid="tarjeta-iniciar"]', { timeout: 15000 });
    await p.click('[data-testid="tarjeta-iniciar"]');
    await p.waitForSelector('[data-testid="select-equipo-inspeccion"]', { timeout: 20000 });
    const edificio = await p.textContent('[data-testid="inspeccion-edificio"]');
    const equipos = await p.locator('[data-testid="select-equipo-inspeccion"] option').allTextContents();
    ok(edificio === 'DEMO Cabildo 1540' && equipos.length === 2 && equipos.every((e) => /^M[12]/.test(e)), `criterio 1: la inspección es de «${edificio}» con sus equipos: ${equipos.join(' | ')}`);
    await captura(p, '.inspeccion-header', 'RF-10-paso-2.png');

    // Criterio 4: el borrador sin señal sigue en el mismo edificio, aunque se recargue con y sin señal
    await p.reload({ waitUntil: 'load' });
    await irAInspeccion(p).catch(() => {});
    await p.waitForSelector('[data-testid="inspeccion-edificio"]', { timeout: 15000 });
    ok((await p.textContent('[data-testid="inspeccion-edificio"]')) === 'DEMO Cabildo 1540', 'criterio 4: recargando, la inspección sigue en DEMO Cabildo 1540');
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'load' }).catch(() => {});
    await p.waitForTimeout(2500);
    await irAInspeccion(p).catch(() => {});
    const sinSenal = await p.locator('[data-testid="inspeccion-edificio"]').textContent({ timeout: 15000 }).catch(() => '');
    ok(sinSenal === 'DEMO Cabildo 1540', `criterio 4: recargando sin señal, la inspección sigue en «${sinSenal}»`);
    await captura(p, '[data-testid="estado-persistencia-idb"]', 'RF-10-paso-3.png');
    await ctx.setOffline(false);

    // Al cerrar sesión se olvida el edificio
    await p.locator('[aria-label="Cerrar sesión"]:visible').first().click();
    await p.waitForSelector('[data-testid="login-usuario"]', { timeout: 15000 });
    ok(await p.evaluate(() => localStorage.getItem('mant_asc_inspeccion_rt') === null), 'al cerrar sesión se borra el edificio en inspección');
  } finally {
    await b.close();
  }
})().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });

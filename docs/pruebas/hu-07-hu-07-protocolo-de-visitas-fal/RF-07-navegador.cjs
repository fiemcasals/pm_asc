// HU-07 / RF-07 — Prueba con Playwright, en un celular de 360 px: la lista «Edificios pendientes de hoy» del RT sin conexión.
//
//   node docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-07-navegador.cjs
//
// Necesita la API (API por detrás de la web) con los datos de demo de HU-04 RF-02 y la web compilada
// (WEB_URL, por defecto https://localhost:4173: npm run build -w apps/web && npm run preview -w apps/web).
// Entra como rt.beto, corta y devuelve la red, fuerza un error del servidor y cierra sesión. Deja las capturas
// RF-07-paso-1.png a RF-07-paso-3.png en imagenes/. Termina con código 1 si algún criterio no se cumple.
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const CLAVE = 'mant_asc_recorrido_rt';
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };

const lista = '[data-testid="recorrido-rt"]';
const estado = (p) => p.getAttribute(lista, 'data-estado');
const esperarEstado = (p, e, ms = 20000) =>
  p.waitForFunction(([s, x]) => document.querySelector(s)?.dataset.estado === x, [lista, e], { timeout: ms }).then(() => true, () => false);

async function captura(p, sel, nombre) {
  await p.addStyleTag({ path: CSS });
  const el = p.locator(sel).first();
  await el.evaluate((e) => e.classList.add('scrum-qa-foco'));
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); // la barra inferior fija tapa lo que queda abajo
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SALIDA, nombre) });
  await el.evaluate((e) => e.classList.remove('scrum-qa-foco'));
}

(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, timezoneId: 'America/Argentina/Buenos_Aires' });
  const p = await ctx.newPage();
  try {
    await p.goto(WEB, { waitUntil: 'load' });
    await p.fill('[data-testid="login-usuario"]', 'rt.beto');
    await p.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(2000);
    if (await p.locator('[data-testid="consentimiento-aceptar"]').count()) await p.click('[data-testid="consentimiento-aceptar"]');
    await p.waitForSelector(lista, { timeout: 20000 });

    // Con conexión: la lista llega del servidor y queda guardada.
    ok(await esperarEstado(p, 'servidor'), 'con conexión la lista llega del servidor');
    const n = await p.locator('[data-testid="recorrido-edificio"]').count();
    ok(n > 0, `rt.beto tiene ${n} edificios pendientes`);
    ok(await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null')?.usuario, CLAVE) === 'rt.beto', 'la lista quedó guardada a nombre de rt.beto');

    // Criterio 1: sin conexión y sin lista guardada.
    await p.evaluate((k) => localStorage.removeItem(k), CLAVE);
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'load' }).catch(() => {});
    await p.waitForSelector(lista, { timeout: 20000 });
    const c1 = await esperarEstado(p, 'sin_conexion');
    const t1 = c1 ? await p.textContent('[data-testid="recorrido-sin-conexion"]') : '';
    ok(c1 && /Sin conexión/.test(t1) && (await p.locator('[data-testid="recorrido-reintentar"]').isVisible()), `criterio 1: «${t1.replace(/Reintentar\s*$/, '').trim()}» con «Reintentar», y no «Cargando…»`);
    ok(!(await p.textContent(lista)).includes('Cargando tus edificios'), 'criterio 1: ya no dice «Cargando tus edificios…»');
    await captura(p, '[data-testid="recorrido-sin-conexion"]', 'RF-07-paso-1.png');

    // Criterio 3: vuelve la conexión → la lista se actualiza sola, sin cerrar sesión.
    await ctx.setOffline(false);
    const c3 = await esperarEstado(p, 'servidor');
    ok(c3 && (await p.locator('[data-testid="recorrido-edificio"]').count()) === n, `criterio 3: al volver la red la lista se carga sola (${await p.locator('[data-testid="recorrido-edificio"]').count()} edificios), sin cerrar sesión`);

    // Criterio 2: sin conexión con la lista ya descargada → la última lista con su hora.
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'load' }).catch(() => {});
    await p.waitForSelector(lista, { timeout: 20000 });
    const c2 = await esperarEstado(p, 'guardado');
    const t2 = c2 ? await p.textContent('[data-testid="recorrido-guardado"]') : '';
    const n2 = await p.locator('[data-testid="recorrido-edificio"]').count();
    ok(c2 && /las \d{2}:\d{2} del \d{2}\/\d{2}\/\d{4}/.test(t2) && n2 === n, `criterio 2: ${n2} edificios y «${t2.replace(/Reintentar\s*$/, '').trim()}»`);
    await captura(p, lista, 'RF-07-paso-2.png');
    // «Reintentar» sin red no rompe nada: vuelve a la lista guardada.
    await p.click('[data-testid="recorrido-reintentar"]');
    ok(await esperarEstado(p, 'guardado'), '«Reintentar» sin red vuelve a mostrar la lista guardada');
    await ctx.setOffline(false);
    await esperarEstado(p, 'servidor');

    // Criterio 4: error del servidor con conexión → aviso con «Reintentar»; al reintentar, la lista.
    await p.route('**/api/recorrido', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"error"}' }));
    await p.click('[data-testid="recorrido-reintentar"]').catch(async () => { await p.reload({ waitUntil: 'load' }); });
    if ((await estado(p)) !== 'error') { await p.reload({ waitUntil: 'load' }); await p.waitForSelector(lista); }
    const c4 = await esperarEstado(p, 'error');
    const t4 = c4 ? await p.textContent('[data-testid="recorrido-error"]') : '';
    ok(c4 && /No se pudo cargar/.test(t4), `criterio 4: error del servidor → «${t4.replace(/Reintentar\s*$/, '').trim()}»`);
    await captura(p, '[data-testid="recorrido-error"]', 'RF-07-paso-3.png');
    await p.unroute('**/api/recorrido');
    await p.click('[data-testid="recorrido-reintentar"]');
    ok(await esperarEstado(p, 'servidor'), 'criterio 4: «Reintentar» con el servidor de vuelta trae la lista');

    // Criterio 5: al cerrar sesión se borra la lista guardada.
    ok(await p.evaluate((k) => localStorage.getItem(k) !== null, CLAVE), 'antes de salir la lista está guardada');
    await p.locator('[aria-label="Cerrar sesión"]:visible').first().click();
    await p.waitForSelector('[data-testid="login-usuario"]', { timeout: 15000 });
    ok(await p.evaluate((k) => localStorage.getItem(k) === null, CLAVE), 'criterio 5: al cerrar sesión la lista guardada se borra');
  } finally {
    await b.close();
  }
})().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });

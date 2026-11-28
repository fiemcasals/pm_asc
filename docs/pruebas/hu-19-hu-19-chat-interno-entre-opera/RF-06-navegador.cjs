// HU-19 / RF-06 — Prueba con Playwright (Chrome): el chat avisa cuando un mensaje no se envió y muestra el estado real de la conexión.
//
//   RF06_RT=<usuario RT> node docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-06-navegador.cjs
//
// Lo corre RF-06-entrega.sh con un RT temporal (clave Demo-Clave-2026). Necesita la API y la web compilada en WEB_URL (por defecto
// https://localhost:4173). Corta la red del navegador, simula un error del servidor, provoca un rechazo real de la API (400) y demora un envío
// para probar el doble envío. Deja RF-06-paso-1.png a RF-06-paso-5.png en imagenes/.
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const RT = process.env.RF06_RT || 'h19e-rt';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };
const ESTADO = '[data-testid="chat-estado-conexion"]';
const AVISO = '[data-testid="chat-aviso-envio-texto"]';
const esPost = (r) => r.url().endsWith('/api/chat/mensajes') && r.method() === 'POST';

async function captura(p, sel, archivo) {
  await p.addStyleTag({ path: CSS });
  const el = p.locator(sel).first();
  await el.evaluate((e) => { e.classList.add('scrum-qa-foco'); e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SALIDA, archivo) });
  await el.evaluate((e) => e.classList.remove('scrum-qa-foco'));
}
const estado = async (p) => (await p.textContent(ESTADO)).trim();
const esperarEstado = (p, texto, ms = 12000) => p.waitForFunction(([s, t]) => document.querySelector(s)?.textContent.trim() === t, [ESTADO, texto], { timeout: ms });
const enHilo = (p, texto) => p.evaluate((t) => [...document.querySelectorAll('[data-testid="chat-globo-mensaje"]')].some((g) => g.textContent.includes(t)), texto);

(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 820 } });
  const p = await ctx.newPage();
  let posts = 0;
  p.on('request', (r) => { if (esPost(r)) posts++; });
  try {
    await p.goto(WEB, { waitUntil: 'load' });
    await p.fill('[data-testid="login-usuario"]', RT);
    await p.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(2500);
    if (await p.locator('[data-testid="consentimiento-aceptar"]').count()) { await p.click('[data-testid="consentimiento-aceptar"]'); await p.waitForTimeout(1500); }
    await p.locator('[data-testid="tab-chat"]:visible, [data-testid="mob-tab-chat"]:visible').first().click();
    await p.click('[data-testid="chat-canal-global"]');

    // Criterio 3: con la red bien, «Conectado»
    await esperarEstado(p, 'Conectado');
    ok(true, 'criterio 3: con la red bien, la cabecera dice «Conectado»');
    const fijos = await p.evaluate(() => /Equipo conectado|En línea/.test(document.querySelector('.chat-header')?.textContent || ''));
    ok(!fijos, 'criterio 3: ya no aparecen «Equipo conectado» ni «En línea»');

    // Criterios 1 y 3: sin red
    await ctx.setOffline(true);
    await esperarEstado(p, 'Sin conexión, reintentando…');
    ok(true, 'criterio 3: al cortar la red, la cabecera pasa sola a «Sin conexión, reintentando…»');
    const sinRed = `Mensaje sin red ${Date.now()}`;
    await p.fill('[data-testid="chat-input-texto"]', sinRed);
    await p.click('[data-testid="chat-btn-enviar"]');
    await p.waitForSelector(AVISO, { timeout: 8000 });
    const avisoRed = (await p.textContent(AVISO)).trim();
    const caja = await p.inputValue('[data-testid="chat-input-texto"]');
    const hayReintentar = await p.locator('[data-testid="chat-btn-reintentar"]').isVisible();
    ok(/no se pudo enviar el mensaje: no hay conexión/i.test(avisoRed) && caja === sinRed && hayReintentar,
      `criterio 1: sin red aparece «${avisoRed}», el texto sigue en la caja y está «Reintentar»`);
    await captura(p, '[data-testid="chat-aviso-envio"]', 'RF-06-paso-1.png');

    // Vuelve la red: la cabecera vuelve sola a «Conectado» y «Reintentar» lo envía
    await ctx.setOffline(false);
    await esperarEstado(p, 'Conectado');
    ok(true, 'criterio 3: al volver la red, la cabecera vuelve sola a «Conectado»');
    await p.click('[data-testid="chat-btn-reintentar"]');
    await p.waitForFunction((t) => [...document.querySelectorAll('[data-testid="chat-globo-mensaje"]')].some((g) => g.textContent.includes(t)), sinRed, { timeout: 10000 });
    const sinAviso = (await p.locator('[data-testid="chat-aviso-envio"]').count()) === 0;
    ok(sinAviso && (await p.inputValue('[data-testid="chat-input-texto"]')) === '', 'criterio 1: «Reintentar» lo envía: el mensaje aparece en el hilo, la caja queda vacía y el aviso se va');
    await captura(p, ESTADO, 'RF-06-paso-2.png');

    // Criterio 1: un error del servidor al enviar (simulado: la API contesta 500)
    await p.route('**/api/chat/mensajes', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"statusCode":500,"message":"Internal server error"}' }) : r.continue()));
    const conError = `Mensaje con error del servidor ${Date.now()}`;
    await p.fill('[data-testid="chat-input-texto"]', conError);
    await p.click('[data-testid="chat-btn-enviar"]');
    await p.waitForSelector(AVISO, { timeout: 8000 });
    const avisoServidor = (await p.textContent(AVISO)).trim();
    ok(/el servidor tuvo un problema/.test(avisoServidor) && (await p.inputValue('[data-testid="chat-input-texto"]')) === conError && !(await enHilo(p, conError)),
      `criterio 1: con un error 500 aparece «${avisoServidor}», el texto se conserva y no aparece en el hilo`);
    await p.unroute('**/api/chat/mensajes');
    await p.click('[data-testid="chat-btn-reintentar"]');
    await p.waitForFunction((t) => [...document.querySelectorAll('[data-testid="chat-globo-mensaje"]')].some((g) => g.textContent.includes(t)), conError, { timeout: 10000 });
    ok(true, 'criterio 1: con el servidor bien de nuevo, «Reintentar» lo envía');

    // Criterio 3: una actualización del hilo que falla por el servidor también cuenta como sin conexión
    await p.route('**/api/chat/mensajes?*', (r) => r.fulfill({ status: 503, body: '' }));
    await esperarEstado(p, 'Sin conexión, reintentando…');
    await captura(p, ESTADO, 'RF-06-paso-3.png');
    await p.unroute('**/api/chat/mensajes?*');
    await esperarEstado(p, 'Conectado');
    ok(true, 'criterio 3: si el servidor falla (503) dice «Sin conexión, reintentando…» y vuelve solo a «Conectado»');

    // Criterio 2: un rechazo real de la API (400), con su motivo: el envío sale con un edificio que no es válido
    await p.route('**/api/chat/mensajes', (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      const cuerpo = JSON.parse(r.request().postData());
      return r.continue({ postData: JSON.stringify({ ...cuerpo, consorcioId: 'no-es-un-edificio' }) });
    });
    const rechazado = `Mensaje que el servidor rechaza ${Date.now()}`;
    await p.fill('[data-testid="chat-input-texto"]', rechazado);
    await p.click('[data-testid="chat-btn-enviar"]');
    await p.waitForSelector(AVISO, { timeout: 8000 });
    const avisoRechazo = (await p.textContent(AVISO)).trim();
    const sinBotonReintentar = (await p.locator('[data-testid="chat-btn-reintentar"]').count()) === 0;
    ok(avisoRechazo === 'No se envió el mensaje: El edificio elegido no es válido.' && sinBotonReintentar && (await p.inputValue('[data-testid="chat-input-texto"]')) === rechazado,
      `criterio 2: la API rechazó con 400 y el aviso dice «${avisoRechazo}» (sin «Reintentar», porque reenviarlo igual no sirve), y el texto se conserva`);
    await captura(p, '[data-testid="chat-aviso-envio"]', 'RF-06-paso-4.png');
    await p.unroute('**/api/chat/mensajes');

    // Criterio 4: mientras se envía, Enviar está deshabilitado y no sale dos veces
    await p.route('**/api/chat/mensajes', async (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      await new Promise((ok2) => setTimeout(ok2, 2500));
      return r.continue();
    });
    const doble = `Mensaje enviado una sola vez ${Date.now()}`;
    await p.fill('[data-testid="chat-input-texto"]', doble);
    const antes = posts;
    await p.click('[data-testid="chat-btn-enviar"]');
    await p.waitForTimeout(300);
    const deshabilitado = await p.locator('[data-testid="chat-btn-enviar"]').isDisabled();
    const textoBoton = (await p.textContent('[data-testid="chat-btn-enviar"]')).trim();
    await captura(p, '[data-testid="chat-btn-enviar"]', 'RF-06-paso-5.png');
    await p.click('[data-testid="chat-btn-enviar"]', { force: true }).catch(() => {});
    await p.press('[data-testid="chat-input-texto"]', 'Enter');
    await p.press('[data-testid="chat-input-texto"]', 'Enter');
    await p.waitForFunction((t) => [...document.querySelectorAll('[data-testid="chat-globo-mensaje"]')].some((g) => g.textContent.includes(t)), doble, { timeout: 10000 });
    await p.unroute('**/api/chat/mensajes');
    await p.waitForTimeout(4000);
    const veces = await p.evaluate((t) => [...document.querySelectorAll('[data-testid="chat-globo-mensaje"]')].filter((g) => g.textContent.includes(t)).length, doble);
    ok(deshabilitado && textoBoton === 'Enviando…' && posts - antes === 1 && veces === 1,
      `criterio 4: mientras se envía el botón dice «${textoBoton}» y está deshabilitado; con un clic más y dos Enter salió ${posts - antes} envío y el mensaje está ${veces} vez en el hilo`);
  } catch (e) {
    ok(false, `error inesperado: ${e.message}`);
  } finally {
    await b.close();
  }
})();

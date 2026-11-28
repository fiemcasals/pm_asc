// HU-19 / RF-07 — Prueba con Playwright (Chrome): la etiqueta de edificio del chat se elige para cada mensaje y la ven todos los que lo leen.
//
//   RF07_MARCA=<texto único> node docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-07-navegador.cjs
//
// Lo corre RF-07-entrega.sh. Usa los usuarios de demostración (HU-04 RF-02, clave Demo-Clave-2026): rt.beto tiene asignados DEMO Cabildo 1540 y
// DEMO Corrientes 100; rt.ana, solo DEMO Rivadavia 1234; demo.secretaria ve los 5 edificios. Necesita la API con este cambio y la web compilada en
// WEB_URL (por defecto https://localhost:4173). Los mensajes llevan la marca RF07_MARCA para que el script los borre. Deja RF-07-paso-1.png a
// RF-07-paso-4.png en imagenes/.
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const MARCA = process.env.RF07_MARCA || `RF07-${Date.now()}`;
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };
const SELECTOR = '[data-testid="chat-select-consorcio"]';
const MAQUINA = '[data-testid="chat-input-maquina"]';

async function captura(p, sel, archivo) {
  await p.addStyleTag({ path: CSS });
  const el = p.locator(sel).last();
  await el.evaluate((e) => { e.classList.add('scrum-qa-foco'); e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SALIDA, archivo) });
  await el.evaluate((e) => e.classList.remove('scrum-qa-foco'));
}

async function entrar(b, usuario) {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 820 } });
  const p = await ctx.newPage();
  await p.goto(WEB, { waitUntil: 'load' });
  await p.fill('[data-testid="login-usuario"]', usuario);
  await p.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(2500);
  if (await p.locator('[data-testid="consentimiento-aceptar"]').count()) { await p.click('[data-testid="consentimiento-aceptar"]'); await p.waitForTimeout(1500); }
  await p.locator('[data-testid="tab-chat"]:visible, [data-testid="mob-tab-chat"]:visible').first().click();
  await p.click('[data-testid="chat-canal-global"]');
  await p.waitForFunction((s) => document.querySelectorAll(`${s} option`).length >= 1, SELECTOR);
  await p.waitForTimeout(1500); // la lista de edificios llega aparte
  return { ctx, p };
}
const opciones = (p) => p.$$eval(`${SELECTOR} option`, (os) => os.map((o) => o.textContent.trim()));
const enviarTexto = async (p, texto) => {
  await p.fill('[data-testid="chat-input-texto"]', texto);
  await p.click('[data-testid="chat-btn-enviar"]');
  await p.waitForFunction((t) => [...document.querySelectorAll('[data-testid="chat-globo-mensaje"]')].some((g) => g.textContent.includes(t)), texto, { timeout: 10000 });
};
const etiquetaDe = (p, texto) => p.evaluate((t) => {
  const g = [...document.querySelectorAll('[data-testid="chat-globo-mensaje"]')].find((x) => x.textContent.includes(t));
  return g ? g.querySelector('[data-testid="chat-tag-edificio"]')?.textContent.trim() ?? null : undefined;
}, texto);

(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  try {
    // Criterio 4: cada uno ve en el selector los edificios que puede ver
    const beto = await entrar(b, 'rt.beto');
    const deBeto = await opciones(beto.p);
    ok(JSON.stringify(deBeto) === JSON.stringify(['(Opcional) Vincular Edificio…', 'DEMO Cabildo 1540', 'DEMO Corrientes 100']), `criterio 4: rt.beto (Técnico) ve sus dos edificios asignados: ${deBeto.slice(1).join(', ')}`);

    // Criterio 3: la máquina aparece solo con un edificio elegido y admite hasta 40 caracteres
    const sinEdificio = await beto.p.locator(MAQUINA).count();
    await beto.p.selectOption(SELECTOR, { label: 'DEMO Cabildo 1540' });
    await beto.p.waitForSelector(MAQUINA);
    await beto.p.fill(MAQUINA, 'M'.repeat(45));
    const largo = (await beto.p.inputValue(MAQUINA)).length;
    ok(sinEdificio === 0 && largo === 40, `criterio 3: sin edificio no hay campo de máquina; con edificio aparece y de 45 caracteres deja ${largo}`);
    await beto.p.fill(MAQUINA, 'M1');
    await captura(beto.p, '.chat-input-context-row', 'RF-07-paso-1.png');

    // Criterio 1: después de enviar, el selector vuelve a «(Opcional)…», la máquina se va y el siguiente mensaje sale sin etiqueta
    const conEdificio = `${MARCA} cables de tracción gastados`;
    await enviarTexto(beto.p, conEdificio);
    const valor = await beto.p.$eval(SELECTOR, (s) => s.options[s.selectedIndex].textContent.trim());
    const maquinaVisible = await beto.p.locator(MAQUINA).count();
    ok(valor === '(Opcional) Vincular Edificio…' && maquinaVisible === 0, `criterio 1 y 3: después de enviar, el selector dice «${valor}» y el campo de máquina desapareció (vacío)`);
    const sinEtiqueta = `${MARCA} consulta general sin edificio`;
    await enviarTexto(beto.p, sinEtiqueta);
    const e1 = await etiquetaDe(beto.p, conEdificio);
    const e2 = await etiquetaDe(beto.p, sinEtiqueta);
    ok(e1 === '📍 DEMO Cabildo 1540 · Ascensor M1' && e2 === null, `criterio 1: el primero lleva «${e1}» y el siguiente sale sin etiqueta`);
    await captura(beto.p, '[data-testid="chat-tag-edificio"]', 'RF-07-paso-2.png');

    // Criterio 2: rt.ana NO tiene asignado DEMO Cabildo 1540 y ve la etiqueta igual
    const ana = await entrar(b, 'rt.ana');
    const deAna = await opciones(ana.p);
    ok(JSON.stringify(deAna) === JSON.stringify(['(Opcional) Vincular Edificio…', 'DEMO Rivadavia 1234']), `criterio 4: rt.ana ve solo su edificio asignado: ${deAna.slice(1).join(', ')} (no ve DEMO Cabildo 1540)`);
    await ana.p.waitForFunction((t) => [...document.querySelectorAll('[data-testid="chat-globo-mensaje"]')].some((g) => g.textContent.includes(t)), conEdificio, { timeout: 15000 });
    const vistaAna = await etiquetaDe(ana.p, conEdificio);
    ok(vistaAna === '📍 DEMO Cabildo 1540 · Ascensor M1', `criterio 2: rt.ana, sin ese edificio asignado, ve la etiqueta «${vistaAna}» en el mensaje de rt.beto`);
    await captura(ana.p, '[data-testid="chat-tag-edificio"]', 'RF-07-paso-3.png');

    // Criterio 4: la Secretaría ve todos los edificios
    const sec = await entrar(b, 'demo.secretaria');
    const deSec = await opciones(sec.p);
    ok(deSec.length - 1 === 5, `criterio 4: demo.secretaria ve los ${deSec.length - 1} edificios: ${deSec.slice(1).join(', ')}`);
    await sec.p.click(SELECTOR);
    await captura(sec.p, SELECTOR, 'RF-07-paso-4.png');

    for (const x of [beto, ana, sec]) await x.ctx.close();
  } catch (e) {
    ok(false, `error inesperado: ${e.message}`);
  } finally {
    await b.close();
  }
})();

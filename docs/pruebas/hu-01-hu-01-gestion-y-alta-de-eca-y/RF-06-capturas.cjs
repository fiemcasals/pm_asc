// HU-01 / RF-06 — Prueba y capturas con Playwright: la ficha del edificio (lectura y edición) y el alta de consorcio en un celular de
// 360 px y en escritorio.
//
//   node docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-06-capturas.cjs
//
// Necesita la API con los datos de demo de HU-04 RF-02 y la web compilada (WEB_URL, por defecto https://localhost:4173:
// npm run build -w apps/web && npm run preview -w apps/web). Comprueba que la página no se desplaza hacia los costados y que el mapa
// entra completo; deja RF-06-paso-1.png a RF-06-paso-4.png en imagenes/. Termina con código 1 si algo no se cumple.
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };

async function abrir(b, viewport, movil) {
  const p = await (await b.newContext({ ignoreHTTPSErrors: true, viewport, isMobile: movil, hasTouch: movil })).newPage();
  await p.goto(WEB, { waitUntil: 'load' });
  await p.fill('[data-testid="login-usuario"]', 'demo.secretaria');
  await p.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(2500);
  for (let i = 0; i < 20 && (await p.getByRole('button', { name: 'Entendido' }).count()); i++) { await p.getByRole('button', { name: 'Entendido' }).first().click(); await p.waitForTimeout(200); }
  await p.getByText('Secretaría (Edificios y Máquinas)', { exact: true }).first().click().catch(() => {});
  await p.waitForSelector('[data-testid="lista-consorcios"]', { timeout: 15000 });
  await p.addStyleTag({ path: CSS });
  return p;
}
/** Ancho de la página y del mapa: no hay desplazamiento lateral si scrollWidth == ancho de la ventana, y el mapa entra si su borde derecho está adentro. */
const medir = (p, mapa) =>
  p.evaluate((sel) => {
    const ancho = document.documentElement.clientWidth;
    const m = sel ? document.querySelector(sel)?.getBoundingClientRect() : null;
    return { ancho, scroll: document.documentElement.scrollWidth, mapa: m ? { izq: Math.round(m.left), der: Math.round(m.right), w: Math.round(m.width) } : null };
  }, mapa);
async function capturar(p, sel, archivo) {
  const el = p.locator(sel).first();
  await el.evaluate((e) => { e.classList.add('scrum-qa-foco'); e.scrollIntoView({ block: 'start' }); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(SALIDA, archivo) });
  await el.evaluate((e) => e.classList.remove('scrum-qa-foco'));
}

(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  try {
    for (const [nombre, viewport, movil, pasoFicha, pasoAlta] of [
      ['celular 360 px', { width: 360, height: 740 }, true, 'RF-06-paso-1.png', 'RF-06-paso-2.png'],
      ['escritorio 1280 px', { width: 1280, height: 800 }, false, 'RF-06-paso-3.png', 'RF-06-paso-4.png'],
    ]) {
      const p = await abrir(b, viewport, movil);
      // Ficha (lectura)
      await p.locator('[data-testid^="item-consorcio-"]', { hasText: 'DEMO Rivadavia 1234' }).first().click();
      await p.waitForTimeout(2000);
      let m = await medir(p, '[data-testid="contenedor-ficha-tecnica"] .maplibregl-map');
      ok(m.scroll <= m.ancho && m.mapa && m.mapa.izq >= 0 && m.mapa.der <= m.ancho, `${nombre} · ficha: página ${m.scroll}/${m.ancho} px, mapa de ${m.mapa?.w} px entre ${m.mapa?.izq} y ${m.mapa?.der}`);
      await capturar(p, '[data-testid="contenedor-ficha-tecnica"]', pasoFicha);
      // Ficha (edición)
      await p.locator('[data-testid="btn-editar-operativos"]').evaluate((e) => e.click());
      await p.waitForTimeout(2000);
      m = await medir(p, '[data-testid="mapa-editar-ficha"] .maplibregl-map');
      ok(m.scroll <= m.ancho && m.mapa && m.mapa.izq >= 0 && m.mapa.der <= m.ancho, `${nombre} · ficha en edición: página ${m.scroll}/${m.ancho} px, mapa de ${m.mapa?.w} px`);
      await p.reload({ waitUntil: 'load' });
      await p.waitForTimeout(2000);
      await p.getByText('Secretaría (Edificios y Máquinas)', { exact: true }).first().click().catch(() => {});
      await p.addStyleTag({ path: CSS });
      // Alta de consorcio
      await p.getByText('+ Alta de Nuevo Consorcio').first().click();
      await p.waitForTimeout(2000);
      m = await medir(p, '[data-testid="mapa-alta-consorcio"] .maplibregl-map');
      const botones = await p.evaluate(() => [...document.querySelectorAll('.consorcio-form-card button, .consorcio-form-card input, .consorcio-form-card select')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().right)));
      ok(m.scroll <= m.ancho && m.mapa && m.mapa.der <= m.ancho && botones.every((r) => r <= m.ancho), `${nombre} · alta: página ${m.scroll}/${m.ancho} px, mapa de ${m.mapa?.w} px, ${botones.length} campos y botones adentro`);
      await capturar(p, '.consorcio-form-card', pasoAlta);
      if (!movil) {
        const lista = await p.evaluate(() => Math.round(document.querySelector('.consorcios-list-card')?.getBoundingClientRect().width ?? 0));
        ok(lista === 340, `escritorio: la lista de edificios sigue en su columna de 340 px (${lista})`);
      }
      await p.context().close();
    }
  } finally {
    await b.close();
  }
})().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });

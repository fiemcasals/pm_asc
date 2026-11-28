// HU-16 / RF-07 — Prueba con Playwright, en un celular de 360 px: las pantallas con el mapa nuevo que la guía de Android manda a probar.
//
//   node docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-07-navegador.cjs [carpeta-de-capturas]
//   CARGA=5 node docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-07-navegador.cjs        # además abre cada pantalla N veces y mide
//
// Necesita la API con los datos de demo de HU-04 RF-02 y la web compilada (WEB_URL, por defecto https://localhost:4173:
// npm run build -w apps/web && npm run preview -w apps/web) con el mapa generado (npm run mapa:generar). Recorre, con el usuario de cada una,
// las 8 pantallas (y el Mapa del RT sin conexión) de docs/android/INSTALAR-Y-PROBAR-EN-ANDROID.md: comprueba que el mapa se dibuja (data-estado=listo) y cuántos pines
// tiene, y deja 5 capturas en imagenes/ (RF-07-ficha.png, RF-07-semaforo.png, RF-07-mapa-rt.png, RF-07-mapa-rt-sin-conexion.png y RF-07-mapa-sin-conexion.png). No cambia
// ningún dato: sólo mira (abre el formulario de alta y la edición de una ficha, pero no guarda).
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const CARGA = Number(process.env.CARGA || 0);
const CLAVE = 'Demo-Clave-2026';
const CABILDO = { latitude: -34.56, longitude: -58.45, accuracy: 8 }; // «DEMO Cabildo 1540» en los datos de demo
const T = (id) => `[data-testid="${id}"]`;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };

async function captura(p, sel, archivo) {
  await p.addStyleTag({ path: CSS });
  const el = p.locator(sel).first();
  await el.evaluate((e) => { e.classList.add('scrum-qa-foco'); e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(SALIDA, archivo) });
  await el.evaluate((e) => e.classList.remove('scrum-qa-foco'));
}

/** Espera a que el mapa de `testId` esté dibujado y devuelve cuántos pines tiene. */
async function mapaListo(p, testId) {
  const base = p.locator(T(`${testId}-base`)).first();
  await base.waitFor({ timeout: 30000 });
  await p.waitForFunction((id) => document.querySelector(`[data-testid="${id}-base"]`)?.getAttribute('data-estado') === 'listo', testId, { timeout: 30000 });
  await p.waitForTimeout(700);
  return p.locator(`${T(testId)} .mapa-pin`).count();
}

async function entrar(b, usuario, extra = {}) {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, ...extra });
  const p = await ctx.newPage();
  await p.goto(WEB, { waitUntil: 'load' });
  await p.fill(T('login-usuario'), usuario);
  await p.fill(T('login-password'), CLAVE);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(2500);
  if (await p.locator(T('consentimiento-aceptar')).count()) { await p.click(T('consentimiento-aceptar')); await p.waitForTimeout(1200); }
  return { ctx, p };
}
const tab = (p, id) => p.locator(`[data-testid="tab-${id}"]:visible, [data-testid="mob-tab-${id}"]:visible`).first();

(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  const resumen = [];
  const anotar = (pantalla, pines, ms) => resumen.push({ pantalla, pines, ms });
  try {
    // 1 a 6: la Secretaría
    {
      const { ctx, p } = await entrar(b, 'demo.secretaria');
      await tab(p, 'secretaria').click();
      await p.waitForSelector(T('pestana-edificios'), { timeout: 20000 });

      // 1. Ficha del edificio, en lectura
      let t0 = Date.now();
      await p.locator('text=DEMO Santa Fe 3200').first().click();
      let n = await mapaListo(p, 'mapa-lectura-ficha');
      ok(n === 1, `1. Ficha en lectura (DEMO Santa Fe 3200): mapa listo con ${n} pin`);
      anotar('Ficha del edificio (lectura)', n, Date.now() - t0);
      await captura(p, T('mapa-lectura-ficha'), 'RF-07-ficha.png');

      // 2. Ficha del edificio, en edición (no se guarda nada)
      t0 = Date.now();
      await p.locator('button:has-text("Editar Datos Operativos")').first().click();
      n = await mapaListo(p, 'mapa-editar-ficha');
      ok(n === 1, `2. Ficha en edición: mapa listo con ${n} pin para mover`);
      anotar('Ficha del edificio (edición)', n, Date.now() - t0);
      await p.locator('button:has-text("Cancelar")').first().click().catch(() => {});
      await p.waitForTimeout(500);

      // 3. Alta de consorcio (no se guarda nada)
      t0 = Date.now();
      await p.locator('button:has-text("Alta de Nuevo Consorcio")').first().click();
      n = await mapaListo(p, 'mapa-alta-consorcio');
      ok(n === 0 && (await p.locator(T('mapa-alta-consorcio-base')).getAttribute('data-estado')) === 'listo', `3. Alta de consorcio: mapa listo, sin pin hasta tocar el mapa (${n})`);
      anotar('Alta de consorcio', n, Date.now() - t0);
      await p.locator('button:has-text("Cancelar")').first().click().catch(() => {});
      await p.waitForTimeout(500);

      // 4. Vista Mapa de todos los edificios
      t0 = Date.now();
      await p.locator('button:has-text("Vista Mapa")').first().click();
      n = await mapaListo(p, 'mapa-global-consorcios');
      ok(n >= 4, `4. Vista Mapa: ${n} pines (un edificio por pin)`);
      anotar('Secretaría › Vista Mapa', n, Date.now() - t0);

      // 5. Monitoreo
      t0 = Date.now();
      await p.click(T('pestana-monitoreo'));
      n = await mapaListo(p, 'mapa-monitoreo');
      ok(n >= 4, `5. Monitoreo: ${n} pines`);
      anotar('Secretaría › Monitoreo', n, Date.now() - t0);

      // 6. Semáforo (25/11/2026: el día de los datos de demo)
      t0 = Date.now();
      await p.click(T('pestana-semaforo'));
      await p.fill(T('input-fecha-semaforo'), '2026-11-25');
      n = await mapaListo(p, 'mapa-semaforo');
      const etiquetas = await p.locator(`${T('mapa-semaforo')} .mapa-pin`).evaluateAll((l) => l.map((e) => e.getAttribute('aria-label') || ''));
      const rojos = etiquetas.filter((e) => /Rojo/.test(e)).length;
      const verdes = etiquetas.filter((e) => /Verde/.test(e)).length;
      ok(n === 4 && rojos === 3 && verdes === 1, `6. Semáforo del 25/11/2026: ${n} pines, ${rojos} rojos y ${verdes} verde (la guía dice 3 rojos y 1 verde)`);
      anotar('Semáforo', n, Date.now() - t0);
      await captura(p, T('contenedor-mapa-semaforo'), 'RF-07-semaforo.png');
      await ctx.close();
    }
    // 7: el RT, con la ubicación en DEMO Cabildo 1540
    {
      const t0 = Date.now();
      const { ctx, p } = await entrar(b, 'rt.beto', { geolocation: CABILDO, permissions: ['geolocation'] });
      const n = await mapaListo(p, 'mapa-rt-pines');
      const leyenda = await p.locator(T('mapa-rt-leyenda')).textContent();
      const nombres = await p.locator(`${T('mapa-rt-pines')} .mapa-pin`).evaluateAll((l) => l.map((e) => e.getAttribute('aria-label') || ''));
      ok(n === 2 && nombres.some((e) => /Cabildo 1540/.test(e)) && nombres.some((e) => /Corrientes 100/.test(e)) && /abierto|cerrado|coordinar/i.test(leyenda), `7. Mapa del RT: ${n} pin(es) (${nombres.map((e) => e.replace(/\s+/g, ' ')).join(' | ')}), con leyenda «${leyenda.replace(/\s+/g, ' ').trim().slice(0, 70)}»`);
      anotar('Mapa del RT', n, Date.now() - t0);
      await captura(p, T('mapa-rt'), 'RF-07-mapa-rt.png');
      await ctx.close();
    }
    // 8: la pestaña «Mapa sin conexión» (antes «Estado del Sistema»), con «Descargar mapa para usar sin señal»
    {
      const t0 = Date.now();
      const { ctx, p } = await entrar(b, 'demo.admin');
      await tab(p, 'mapa-sin-conexion').click();
      // Este mapa es el base solo (MapaBase con su propio identificador), sin pines de edificios
      await p.locator(T('mapa-sistema')).first().waitFor({ timeout: 30000 });
      await p.waitForFunction(() => document.querySelector('[data-testid="mapa-sistema"]')?.getAttribute('data-estado') === 'listo', null, { timeout: 30000 });
      const n = 0;
      ok((await p.locator(T('mapa-descargar')).count()) + (await p.locator(T('mapa-guardado')).count()) >= 1, `8. Mapa sin conexión: mapa listo y el botón «Descargar mapa para usar sin señal» (${n} pines: es sólo el mapa base)`);
      anotar('Mapa sin conexión', n, Date.now() - t0);
      await captura(p, T('mapa-descarga'), 'RF-07-mapa-sin-conexion.png');
      await ctx.close();
    }

    // 9: el Mapa del RT sin señal, con el mapa ya bajado: con la red cortada y la página recargada
    {
      const t0 = Date.now();
      const { ctx, p } = await entrar(b, 'rt.beto', { geolocation: CABILDO, permissions: ['geolocation'] });
      await mapaListo(p, 'mapa-rt-pines');
      await p.locator(T('mapa-descargar')).click();
      await p.waitForSelector(T('mapa-guardado'), { timeout: 120000 });
      await p.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
      await p.waitForTimeout(2000);
      await ctx.setOffline(true);
      const t1 = Date.now(); // sólo la recarga sin red: desde que se recarga hasta que el mapa está dibujado (sin el login ni la descarga)
      await p.reload({ waitUntil: 'load' }).catch(() => {});
      const n = await mapaListo(p, 'mapa-rt-pines');
      const msRecarga = Date.now() - t1;
      const cartel = (await p.locator('text=/Sin conexión: los edificios son los últimos datos descargados/').first().textContent()) || '';
      const origen = await p.locator(T('mapa-rt-pines-base')).getAttribute('data-origen');
      ok(n >= 1 && origen === 'guardado' && cartel.length > 0, `9. Mapa del RT sin conexión: mapa dibujado desde el celular (data-origen=${origen}) ${msRecarga} ms después de recargar sin red, ${n} pin(es) y el cartel «${cartel.replace(/\s+/g, ' ').trim().slice(0, 95)}»`);
      anotar('Mapa del RT sin conexión (recarga)', n, msRecarga);
      anotar('  (el paso 9 entero, con login y descarga)', n, Date.now() - t0);
      await captura(p, T('mapa-rt'), 'RF-07-mapa-rt-sin-conexion.png');
      await ctx.setOffline(false);
      await ctx.close();
    }

    console.log('\nPantalla'.padEnd(36) + 'pines  tiempo hasta el mapa');
    for (const r of resumen) console.log(`${r.pantalla.padEnd(35)} ${String(r.pines).padStart(4)}  ${r.ms} ms`);

    if (CARGA > 0) {
      const tiempos = [];
      for (let i = 0; i < CARGA; i++) {
        const { ctx, p } = await entrar(b, 'rt.beto', { geolocation: CABILDO, permissions: ['geolocation'] });
        const t0 = Date.now();
        await mapaListo(p, 'mapa-rt-pines');
        tiempos.push(Date.now() - t0);
        await ctx.close();
      }
      tiempos.sort((a, c) => a - c);
      console.log(`CARGA ${CARGA}: el Mapa del RT hasta el mapa dibujado → promedio ${Math.round(tiempos.reduce((s, v) => s + v, 0) / tiempos.length)} ms · p95 ${tiempos[Math.ceil(tiempos.length * 0.95) - 1]} ms · máx ${tiempos[tiempos.length - 1]} ms`);
    }
  } finally {
    await b.close();
  }
})().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });

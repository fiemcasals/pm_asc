// HU-17 / RF-11 — Prueba con Playwright, en un celular de 360 px: fotos obligatorias del frente de cabina y de los cables en cada equipo en uso.
//
//   node docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-11-navegador.cjs [carpeta-de-capturas]
//   CARGA=20 node docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-11-navegador.cjs        # además mide N fotos grandes
//
// Necesita la API con los datos de demo de HU-04 RF-02 y la web compilada (WEB_URL, por defecto https://localhost:4173:
// npm run build -w apps/web && npm run preview -w apps/web). Entra como rt.beto con la ubicación del celular en «DEMO Cabildo 1540»,
// inicia la visita desde el mapa, responde que el equipo M1 está en uso y recorre los criterios de la tarea. Las fotos son imágenes dibujadas
// en el momento (no hay cámara): una grande, para comprobar que se comprime a 500 KB o menos. Deja RF-11-paso-1.png a RF-11-paso-7.png en
// imagenes/. Registra un inicio de inspección de rt.beto en ese edificio (como haría el RT) y no cierra ningún informe.
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const CARGA = Number(process.env.CARGA || 0);
const CABILDO = { latitude: -34.56, longitude: -58.45, accuracy: 8 }; // el punto de «DEMO Cabildo 1540» en los datos de demo
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };
const T = (id) => `[data-testid="${id}"]`;

async function captura(p, sel, archivo) {
  await p.addStyleTag({ path: CSS });
  const el = p.locator(sel).first();
  await el.evaluate((e) => { e.classList.add('scrum-qa-foco'); e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(SALIDA, archivo) });
  await el.evaluate((e) => e.classList.remove('scrum-qa-foco'));
}

/** Una imagen dibujada en la página (no hay cámara): `frente` o `cables`; `grande` la infla con ruido para que supere los 500 KB. */
async function foto(p, tipo, grande) {
  const b64 = await p.evaluate(({ tipo, grande }) => {
    const w = grande ? 3200 : 800;
    const h = grande ? 2400 : 600;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = tipo === 'frente' ? '#cfd8dc' : '#37474f';
    x.fillRect(0, 0, w, h);
    if (tipo === 'frente') {
      x.fillStyle = '#90a4ae'; x.fillRect(w * 0.18, h * 0.1, w * 0.64, h * 0.8);
      x.fillStyle = '#b0bec5'; x.fillRect(w * 0.2, h * 0.12, w * 0.3, h * 0.76); x.fillRect(w * 0.5, h * 0.12, w * 0.3, h * 0.76);
      x.fillStyle = '#263238'; x.fillRect(w * 0.86, h * 0.35, w * 0.08, h * 0.3);
      for (let i = 0; i < 6; i++) { x.fillStyle = '#ffd54f'; x.beginPath(); x.arc(w * 0.9, h * (0.4 + i * 0.04), w * 0.008, 0, 7); x.fill(); }
    } else {
      x.strokeStyle = '#b0bec5'; x.lineWidth = w * 0.012;
      for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(w * (0.25 + i * 0.12), 0); x.lineTo(w * (0.25 + i * 0.12), h); x.stroke(); }
    }
    if (grande) { for (let i = 0; i < 90000; i++) { x.fillStyle = `rgb(${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},${(Math.random() * 255) | 0})`; x.fillRect(Math.random() * w, Math.random() * h, 6, 6); } }
    x.fillStyle = tipo === 'frente' ? '#263238' : '#eceff1'; x.font = `bold ${Math.round(h * 0.07)}px sans-serif`;
    x.fillText(tipo === 'frente' ? 'FRENTE DE CABINA (foto de prueba)' : 'CABLES DE TRACCIÓN (foto de prueba)', w * 0.04, h * 0.07);
    return c.toDataURL('image/jpeg', 0.95).split(',')[1];
  }, { tipo, grande });
  return { name: `${tipo}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

const irAInspeccion = (p) => p.locator('[data-testid="tab-inspeccion"]:visible, [data-testid="mob-tab-inspeccion"]:visible').first().click();
const kb = async (p, id) => Number(((await p.textContent(`${T(`foto-obligatoria-preview-${id}`)} .checklist-foto-meta span`)) || '').replace(/\D/g, ''));

(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, geolocation: CABILDO, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  try {
    await p.goto(WEB, { waitUntil: 'load' });
    await p.fill(T('login-usuario'), 'rt.beto');
    await p.fill(T('login-password'), 'Demo-Clave-2026');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(2500);
    if (await p.locator(T('consentimiento-aceptar')).count()) { await p.click(T('consentimiento-aceptar')); await p.waitForTimeout(1500); }
    await p.evaluate(() => localStorage.removeItem('mant_asc_inspeccion_rt'));

    // Se inicia la visita desde el mapa, como en la calle
    await irAInspeccion(p);
    await p.waitForSelector(T('inspeccion-ir-al-mapa'), { timeout: 15000 });
    await p.click(T('inspeccion-ir-al-mapa'));
    const pin = p.locator('[data-testid="mapa-rt-pines"] .mapa-pin[aria-label^="DEMO Cabildo 1540"]');
    await pin.waitFor({ timeout: 30000 });
    await pin.evaluate((e) => e.click());
    await p.click(T('tarjeta-verificar'));
    await p.waitForSelector(T('tarjeta-iniciar'), { timeout: 15000 });
    await p.click(T('tarjeta-iniciar'));
    await p.waitForSelector(T('select-equipo-inspeccion'), { timeout: 20000 });
    ok((await p.textContent(T('inspeccion-edificio'))) === 'DEMO Cabildo 1540', 'la visita es de DEMO Cabildo 1540');

    // Criterio 1: un equipo en uso muestra «Fotos obligatorias del equipo»; antes de responder si está en uso, no
    await p.selectOption(T('select-tipo-inspeccion'), 'traccion');
    ok((await p.locator(T('fotos-obligatorias')).count()) === 0, 'criterio 1: antes de responder si el equipo está en uso no se piden fotos');
    await p.click(T('btn-uso-si'));
    await p.waitForSelector(T('fotos-obligatorias'), { timeout: 10000 });
    const cajas = await p.locator('[data-testid^="foto-obligatoria-box-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-testid')));
    ok(cajas.join() === 'foto-obligatoria-box-frente,foto-obligatoria-box-cables', `criterio 1: equipo de tracción → pide ${cajas.map((c) => c.replace('foto-obligatoria-box-', '')).join(' y ')}`);
    const estado1 = await p.textContent(T('fotos-obligatorias-estado'));
    ok(/Faltan 2 de 2/.test(estado1), `criterio 1: sin fotos dice «${estado1.trim().slice(0, 40)}…»`);
    await captura(p, T('fotos-obligatorias'), 'RF-11-paso-1.png');

    // Criterio 3: sin las fotos no se puede consolidar y dice cuáles faltan
    const btn = p.locator(T('btn-consolidar'));
    ok(await btn.isDisabled(), 'criterio 3: «Consolidar Informe y Proceder a Firma» está deshabilitado');
    const pendientes = await p.textContent(T('consolidar-pendientes'));
    ok(/M1: .*falta la foto de frente de cabina y botonera y cables de tracción/.test(pendientes), `criterio 3: dice «${(pendientes.match(/M1: [^\n]*/) || [''])[0].slice(0, 110)}…»`);
    await captura(p, T('cierre-informe'), 'RF-11-paso-2.png');

    // Criterio 2: la foto se comprime a 500 KB o menos, queda con su miniatura y se puede quitar y volver a sacar
    const grande = await foto(p, 'frente', true);
    ok(grande.buffer.length > 1024 * 1024, `la foto de prueba pesa ${Math.round(grande.buffer.length / 1024)} KB antes de comprimir`);
    await p.setInputFiles(T('input-foto-obligatoria-frente'), grande);
    await p.waitForSelector(T('foto-obligatoria-preview-frente'), { timeout: 30000 });
    const kbFrente = await kb(p, 'frente');
    ok(kbFrente > 0 && kbFrente <= 500, `criterio 2: la foto del frente quedó en ${kbFrente} KB (tope 500 KB)`);
    ok((await p.textContent(T('foto-obligatoria-estado-frente'))).includes('Lista'), 'criterio 2: el frente figura «✓ Lista»');
    await p.setInputFiles(T('input-foto-obligatoria-cables'), await foto(p, 'cables', false));
    await p.waitForSelector(T('foto-obligatoria-preview-cables'), { timeout: 30000 });
    ok(/Están todas/.test(await p.textContent(T('fotos-obligatorias-estado'))), 'criterio 2: con las dos fotos dice «Están todas las fotos obligatorias de este equipo»');
    await captura(p, T('fotos-obligatorias'), 'RF-11-paso-3.png');
    await p.click(T('btn-quitar-foto-obligatoria-cables'));
    ok((await p.locator(T('foto-obligatoria-preview-cables')).count()) === 0 && /Falta/.test(await p.textContent(T('foto-obligatoria-estado-cables'))), 'criterio 2: «Quitar foto» la saca y vuelve a figurar «✗ Falta»');
    ok(/falta la foto de cables de tracción/.test(await p.textContent(T('consolidar-pendientes'))), 'criterio 3: con sólo la de cables faltando, el pendiente dice «falta la foto de cables de tracción»');
    await p.setInputFiles(T('input-foto-obligatoria-cables'), await foto(p, 'cables', false));
    await p.waitForSelector(T('foto-obligatoria-preview-cables'), { timeout: 30000 });
    ok(/Volver a sacar/.test(await p.textContent(T('btn-foto-obligatoria-frente'))), 'criterio 2: con la foto sacada el botón pasa a «Volver a sacar»');

    // Criterio 4: un hidráulico no tiene cables; la foto de cables deja de exigirse
    await p.selectOption(T('select-tipo-inspeccion'), 'hidraulico');
    const cajasH = await p.locator('[data-testid^="foto-obligatoria-box-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-testid')));
    ok(cajasH.join() === 'foto-obligatoria-box-frente' && (await p.locator(T('fotos-obligatorias-hidraulico')).count()) === 1, 'criterio 4: equipo hidráulico → sólo la foto del frente, con el aviso de que no tiene cables');
    await captura(p, T('fotos-obligatorias'), 'RF-11-paso-4.png');
    await p.selectOption(T('select-tipo-inspeccion'), 'traccion');
    ok((await p.locator(T('foto-obligatoria-box-cables')).count()) === 1, 'criterio 4: al volver a tracción vuelve a pedirse la de cables (y la foto sacada sigue)');

    // Criterio 4: un equipo fuera de servicio no las pide; si vuelve a uso, sí
    await p.selectOption(T('select-equipo-inspeccion'), { index: 1 });
    await p.click(T('btn-uso-no'));
    await p.waitForSelector(T('reporte-parada'), { timeout: 10000 });
    ok((await p.locator(T('fotos-obligatorias')).count()) === 0, 'criterio 4: M2 fuera de servicio → no se piden fotos obligatorias (sí su reporte de parada)');
    await captura(p, T('reporte-parada'), 'RF-11-paso-5.png');
    await p.click(T('btn-cambiar-uso'));
    await p.click(T('btn-uso-si'));
    await p.waitForSelector(T('fotos-obligatorias'), { timeout: 10000 });
    ok(/Faltan 2 de 2/.test(await p.textContent(T('fotos-obligatorias-estado'))), 'criterio 4: M2 puesto de nuevo en uso → se le piden las dos');
    await p.selectOption(T('select-equipo-inspeccion'), { index: 0 });
    await p.waitForSelector(T('foto-obligatoria-preview-frente'), { timeout: 10000 });

    // Criterio 5: sin señal, las fotos siguen ahí al recargar
    await p.waitForFunction(() => /guardado/.test(document.querySelector('[data-testid="estado-persistencia-idb"]')?.textContent || ''), null, { timeout: 15000 });
    await p.waitForTimeout(2000);
    await p.evaluate(() => navigator.serviceWorker?.ready);
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'load' }).catch(() => {});
    await p.waitForTimeout(2500);
    await irAInspeccion(p).catch(() => {});
    await p.waitForSelector(T('inspeccion-edificio'), { timeout: 20000 });
    await p.waitForSelector(T('fotos-obligatorias'), { timeout: 20000 });
    const sinSenal = await p.locator('[data-testid^="foto-obligatoria-preview-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-testid').replace('foto-obligatoria-preview-', '')));
    ok(sinSenal.sort().join() === 'cables,frente', `criterio 5: recargando sin señal las fotos siguen ahí (${sinSenal.sort().join(' y ')})`);
    ok(/Están todas/.test(await p.textContent(T('fotos-obligatorias-estado'))), 'criterio 5: y el equipo sigue con todas sus fotos');
    await captura(p, T('fotos-obligatorias'), 'RF-11-paso-6.png');
    await p.waitForSelector(T('consolidar-pendientes'), { timeout: 10000 });
    const pendM1 = await p.locator(`${T('consolidar-pendientes')} li`, { hasText: /^M1:/ }).textContent();
    ok(!/falta la foto/.test(pendM1), `criterio 5: M1 ya no figura con fotos pendientes; queda «${pendM1.slice(0, 70)}…»`);
    await captura(p, T('cierre-informe'), 'RF-11-paso-7.png');
    await ctx.setOffline(false);

    // Carga (opcional): N fotos grandes seguidas, para ver cuánto tarda la compresión en este equipo
    if (CARGA > 0) {
      const tiempos = [];
      let fallas = 0;
      const grande2 = await foto(p, 'frente', true);
      for (let i = 0; i < CARGA; i++) {
        const t0 = Date.now();
        try {
          await p.click(T('btn-quitar-foto-obligatoria-frente'));
          await p.setInputFiles(T('input-foto-obligatoria-frente'), grande2);
          await p.waitForSelector(T('foto-obligatoria-preview-frente'), { timeout: 30000 });
          if ((await kb(p, 'frente')) > 500) fallas++;
          tiempos.push(Date.now() - t0);
        } catch { fallas++; }
      }
      tiempos.sort((a, c) => a - c);
      const prom = tiempos.reduce((s, v) => s + v, 0) / (tiempos.length || 1);
      console.log(`CARGA ${CARGA} fotos de ${Math.round(grande2.buffer.length / 1024)} KB: ${fallas} fallidas · promedio ${Math.round(prom)} ms · p95 ${tiempos[Math.floor(tiempos.length * 0.95) - 1] ?? tiempos[tiempos.length - 1] ?? 0} ms · máx ${tiempos[tiempos.length - 1] ?? 0} ms`);
      if (fallas > 0) process.exitCode = 1;
    }
  } finally {
    await b.close();
  }
})().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });

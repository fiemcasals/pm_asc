// HU-08 / RF-08 — Prueba con Playwright: el Portal Firmante pide la foto de cables sólo a los equipos con cables de tracción.
//
//   node docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-08-navegador.cjs [carpeta-de-capturas]
//   CARGA=50 node docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-08-navegador.cjs         # además abre y cierra el modal N veces
//
// Necesita la API con los datos de demo de HU-04 RF-02 y la web compilada (WEB_URL, por defecto https://localhost:4173:
// npm run build -w apps/web && npm run preview -w apps/web). Entra como demo.firmante. Los datos de demo no traen ninguna máquina
// hidráulica con la visita recorrida, así que el navegador responde la lista de máquinas (GET /api/firmante/maquinas) con dos de ejemplo:
// un hidráulico con la foto del frente y la firma del encargado, y uno de tracción con lo mismo, sin foto de cables. Es una prueba de la
// pantalla; lo que hace la API (autorizar un hidráulico sin foto de cables, rechazar uno de tracción) lo prueban RF-08-entrega.sh y las
// pruebas de la API. No autoriza nada. Deja RF-08-paso-1.png a RF-08-paso-3.png en imagenes/.
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const CARGA = Number(process.env.CARGA || 0);
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

(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1180, height: 900 } });
  const p = await ctx.newPage();
  try {
    await p.goto(WEB, { waitUntil: 'load' });
    // Una foto de frente de cabina dibujada en el momento (no hay cámara ni fotos de verdad en los datos de demo)
    const frente = await p.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 480; c.height = 320;
      const x = c.getContext('2d');
      x.fillStyle = '#cfd8dc'; x.fillRect(0, 0, 480, 320);
      x.fillStyle = '#90a4ae'; x.fillRect(90, 30, 300, 260);
      x.fillStyle = '#b0bec5'; x.fillRect(96, 36, 144, 248); x.fillRect(240, 36, 144, 248);
      x.fillStyle = '#263238'; x.fillRect(410, 110, 40, 100);
      x.font = 'bold 20px sans-serif'; x.fillText('FRENTE DE CABINA (foto de prueba)', 20, 22);
      return c.toDataURL('image/png');
    });
    const visita = (id, inspector) => ({
      id, fecha: '2026-11-20T10:30:00.000Z', inspector, estado: 'Recorrida', fotosObligatorias: { frente },
      firmaEncargado: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xMCAxMCIvPjwvc3ZnPg==',
      nombreEncargado: 'Carlos Rodríguez (Encargado)', autorizada: false,
    });
    const maquina = (id, codigo, tipo, nombre) => ({
      id, codigoAGC: codigo, tipo, nombre,
      edificio: { id: 'EDIF-DEMO', direccion: 'DEMO Cabildo 1540, CABA', administracion: 'Administración Demo', consorcio: 'Consorcio DEMO Cabildo 1540' },
      eca: 'ECA Demo', rtCalle: 'rt.beto', firmanteId: 'demo.firmante', firmanteUsername: 'demo.firmante', mes: '2026-11', estado: 'Recorrida', visita: visita(`VIS-${id}`, 'rt.beto'),
    });
    await p.route('**/api/firmante/maquinas*', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([maquina('MAQ-DEMO-HIDRA', 'M2', 'hidraulico', 'M2: Ascensor hidráulico'), maquina('MAQ-DEMO-TRACCION', 'M1', 'traccion', 'M1: Ascensor de tracción')]),
    }));

    await p.fill(T('login-usuario'), 'demo.firmante');
    await p.fill(T('login-password'), 'Demo-Clave-2026');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(2500);
    if (await p.locator(T('consentimiento-aceptar')).count()) { await p.click(T('consentimiento-aceptar')); await p.waitForTimeout(1500); }
    if (!(await p.locator(T('maquinas-lista')).count())) {
      await p.locator('[data-testid*="firmante"]:visible, button:has-text("Firmante"):visible, a:has-text("Firmante"):visible').first().click().catch(() => {});
    }
    await p.waitForSelector(T('maquinas-lista'), { timeout: 20000 });

    // Criterios 1 y 2 en la lista: el hidráulico se puede autorizar con el frente y la firma; el de tracción sin cables, no
    const hidra = p.locator(T('btn-autorizar-MAQ-DEMO-HIDRA'));
    const trac = p.locator(T('btn-autorizar-MAQ-DEMO-TRACCION'));
    ok(await hidra.isEnabled(), 'criterio 1: el hidráulico (frente y firma, sin foto de cables) tiene «Autorizar Firma AGC» habilitado');
    ok(await p.locator(`${T('maquina-card-MAQ-DEMO-HIDRA')} .bloqueo-hint`).count() === 0, 'criterio 1: y no figura ningún motivo de bloqueo');
    ok(await trac.isDisabled(), 'criterio 2: el de tracción sin foto de cables tiene «Autorizar Firma AGC» bloqueado');
    const hint = await p.locator(`${T('maquina-card-MAQ-DEMO-TRACCION')} .bloqueo-hint`).textContent();
    ok(/Falta foto obligatoria de cables/.test(hint), `criterio 2: con el motivo «${hint.replace(/\s+/g, ' ').trim()}»`);
    await captura(p, T('maquinas-lista'), 'RF-08-paso-1.png');

    // Criterio 4: el modal de auditoría de un hidráulico dice «No aplica (equipo hidráulico)» y habilita Autorizar
    await p.click(T('btn-auditar-MAQ-DEMO-HIDRA'));
    await p.waitForSelector('[role="dialog"]', { timeout: 10000 });
    const estadoH = await p.locator(T('foto-cables-estado')).textContent();
    ok(/No aplica \(equipo hidráulico\)/.test(estadoH) && !/Falta/.test(estadoH), `criterio 4: la tarjeta de cables dice «${estadoH.trim()}» y no «Falta»`);
    ok(/Presente/.test(await p.locator('.photo-card', { hasText: 'Frente de Cabina y Botonera' }).locator('.badge').textContent()), 'criterio 4: el frente figura «✓ Presente»');
    ok(await p.locator(T('btn-confirmar-autorizar')).isEnabled(), 'criterio 4: «Autorizar Firma AGC» está habilitado con el frente y la firma');
    await captura(p, '.audit-section:has(.photos-grid)', 'RF-08-paso-2.png');
    await p.click('[aria-label="Cerrar modal"]');

    // El de tracción sigue pidiendo los cables
    await p.click(T('btn-auditar-MAQ-DEMO-TRACCION'));
    await p.waitForSelector('[role="dialog"]', { timeout: 10000 });
    const estadoT = await p.locator(T('foto-cables-estado')).textContent();
    ok(/Falta/.test(estadoT), `criterio 2: en la tracción la tarjeta de cables dice «${estadoT.trim()}»`);
    ok(await p.locator(T('btn-confirmar-autorizar')).isDisabled(), 'criterio 2: y «Autorizar Firma AGC» está deshabilitado');
    await captura(p, '.audit-section:has(.photos-grid)', 'RF-08-paso-3.png');
    await p.click('[aria-label="Cerrar modal"]');

    // Carga (opcional): abrir y cerrar el modal de auditoría de las dos máquinas N veces, comprobando lo que dice la tarjeta de cables
    if (CARGA > 0) {
      const tiempos = [];
      let fallas = 0;
      for (let i = 0; i < CARGA; i++) {
        for (const [id, esperado] of [['MAQ-DEMO-HIDRA', /No aplica/], ['MAQ-DEMO-TRACCION', /Falta/]]) {
          const t0 = Date.now();
          await p.click(T('btn-auditar-' + id));
          const texto = await p.locator(T('foto-cables-estado')).textContent();
          tiempos.push(Date.now() - t0);
          if (!esperado.test(texto)) fallas++;
          await p.click('[aria-label="Cerrar modal"]');
        }
      }
      tiempos.sort((a, c) => a - c);
      const prom = tiempos.reduce((s, v) => s + v, 0) / tiempos.length;
      console.log('CARGA ' + CARGA + ' vueltas (' + tiempos.length + ' aperturas del modal): ' + fallas + ' fallidas · promedio ' + Math.round(prom) + ' ms · p95 ' + tiempos[Math.ceil(tiempos.length * 0.95) - 1] + ' ms · máx ' + tiempos[tiempos.length - 1] + ' ms');
      if (fallas > 0) process.exitCode = 1;
    }
  } finally {
    await b.close();
  }
})().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });

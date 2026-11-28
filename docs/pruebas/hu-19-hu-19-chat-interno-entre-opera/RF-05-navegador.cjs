// HU-19 / RF-05 — Prueba con Playwright (Chrome): las fotos del chat se reducen antes de enviarlas y el hilo no las vuelve a bajar.
//
//   RF05_RT=<usuario RT> RF05_FIRMANTE=<usuario Firmante> node docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-05-navegador.cjs
//
// Lo corre RF-05-entrega.sh con usuarios temporales (clave Demo-Clave-2026). Necesita la API con este cambio y la web compilada en WEB_URL
// (por defecto https://localhost:4173). Arma en el navegador una foto como la de un celular (4000 × 3000, JPEG de varios MB), la elige como
// el RT, mira lo que se envía de verdad, mide cada actualización del hilo y cuántas veces se pide cada foto, la abre como el Firmante y prueba
// un archivo que no es una imagen. Deja RF-05-paso-1.png a RF-05-paso-5.png en imagenes/.
const fs = require('fs');
const os = require('os');
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const RT = process.env.RF05_RT || 'h19f-rt';
const FIRMANTE = process.env.RF05_FIRMANTE || 'h19f-fir';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rf05-'));
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };
const kb = (n) => `${Math.round(n / 1024)} KB`;

async function captura(p, sel, archivo) {
  await p.addStyleTag({ path: CSS });
  const el = p.locator(sel).last();
  await el.evaluate((e) => { e.classList.add('scrum-qa-foco'); e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SALIDA, archivo) });
  await el.evaluate((e) => e.classList.remove('scrum-qa-foco'));
}

async function entrar(b, usuario, antes) {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 820 } });
  const p = await ctx.newPage();
  if (antes) antes(p);
  await p.goto(WEB, { waitUntil: 'load' });
  await p.fill('[data-testid="login-usuario"]', usuario);
  await p.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(2500);
  if (await p.locator('[data-testid="consentimiento-aceptar"]').count()) { await p.click('[data-testid="consentimiento-aceptar"]'); await p.waitForTimeout(1500); }
  await p.locator('[data-testid="tab-chat"]:visible, [data-testid="mob-tab-chat"]:visible').first().click();
  await p.waitForSelector('[data-testid="chat-hilo-mensajes"]', { timeout: 15000 });
  await p.click('[data-testid="chat-canal-global"]');
  return { ctx, p };
}

/** Una foto «de celular»: 4000 × 3000 con detalle (ruido y texto), en JPEG de alta calidad, como sale de la cámara. */
async function fotoDeCelular(p, archivo, texto) {
  const b64 = await p.evaluate(async (t) => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 4000, 3000); g.addColorStop(0, '#6b7a8f'); g.addColorStop(1, '#d9c9a3');
    x.fillStyle = g; x.fillRect(0, 0, 4000, 3000);
    const img = x.getImageData(0, 0, 4000, 3000); const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const r = (Math.random() - 0.5) * 70; d[i] += r; d[i + 1] += r; d[i + 2] += r; }
    x.putImageData(img, 0, 0);
    x.fillStyle = '#111'; x.font = 'bold 260px sans-serif'; x.fillText(t, 220, 1500);
    x.font = '120px sans-serif'; x.fillText('Cables de tracción · M1', 220, 1800);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, texto);
  fs.writeFileSync(archivo, Buffer.from(b64, 'base64'));
  return fs.statSync(archivo).size;
}

(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  try {
    const rt = await entrar(b, RT);
    const { p } = rt;

    // Criterio 1: una foto de 4000 × 3000 y varios MB se reduce antes de enviarla
    const original = path.join(TMP, 'foto-celular.jpg');
    const pesoOriginal = await fotoDeCelular(p, original, 'Foto 1');
    ok(pesoOriginal > 3 * 1024 * 1024, `la foto elegida es de 4000 × 3000 y pesa ${(pesoOriginal / 1024 / 1024).toFixed(1)} MB, como la de un celular`);
    await p.setInputFiles('[data-testid="chat-input-foto"]', original);
    await p.waitForSelector('[data-testid="chat-preview-foto"]', { timeout: 20000 });
    await captura(p, '[data-testid="chat-preview-foto"]', 'RF-05-paso-1.png');
    const [pedido] = await Promise.all([
      p.waitForRequest((r) => r.url().endsWith('/api/chat/mensajes') && r.method() === 'POST'),
      p.click('[data-testid="chat-btn-enviar"]'),
    ]);
    const enviada = JSON.parse(pedido.postData()).adjuntoUrl;
    const bytesEnviados = Buffer.from(enviada.slice(enviada.indexOf(',') + 1), 'base64').length;
    const medidas = await p.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = u; }), enviada);
    ok(enviada.startsWith('data:image/jpeg;base64,') && medidas[0] === 1600 && medidas[1] === 1200 && bytesEnviados < 500 * 1000,
      `criterio 1: se envió un JPEG de ${medidas[0]} × ${medidas[1]} que pesa ${kb(bytesEnviados)} (la original: ${(pesoOriginal / 1024 / 1024).toFixed(1)} MB) — ${Math.round(pesoOriginal / bytesEnviados)} veces menos`);

    // Criterio 3: la foto se ve en el hilo de quien la envió y al tocarla se agranda (y se sigue leyendo)
    await p.waitForSelector('[data-testid="chat-foto-mensaje"]', { timeout: 15000 });
    await captura(p, '[data-testid="chat-globo-mensaje"]', 'RF-05-paso-2.png');
    await p.locator('[data-testid="chat-foto-mensaje"]').last().click();
    await p.waitForSelector('[data-testid="chat-modal-zoom"] img', { timeout: 5000 });
    const grande = await p.locator('[data-testid="chat-modal-zoom"] img').evaluate((i) => [i.naturalWidth, i.naturalHeight]);
    ok(grande[0] === 1600 && grande[1] === 1200, `criterio 1 y 3: agrandada se ve a ${grande[0]} × ${grande[1]} px, se lee bien`);
    await p.click('[data-testid="chat-modal-cerrar"]');

    // Cuatro fotos más: cinco en la conversación
    for (let i = 2; i <= 5; i++) {
      const otra = path.join(TMP, `foto-${i}.jpg`);
      await fotoDeCelular(p, otra, `Foto ${i}`);
      await p.setInputFiles('[data-testid="chat-input-foto"]', otra);
      await p.waitForSelector('[data-testid="chat-preview-foto"]', { timeout: 20000 });
      await p.click('[data-testid="chat-btn-enviar"]');
      await p.waitForFunction((n) => document.querySelectorAll('[data-testid="chat-foto-mensaje"]').length >= n, i, { timeout: 15000 });
    }

    // Criterio 2: el Firmante abre el grupo; se miden sus actualizaciones del hilo y cuántas veces pide cada foto
    const hilos = []; const fotos = {};
    const fir = await entrar(b, FIRMANTE, (pf) => pf.on('response', async (r) => {
      const u = new URL(r.url());
      if (/\/api\/chat\/mensajes\/[0-9a-f-]{36}\/foto$/.test(u.pathname)) fotos[u.pathname] = (fotos[u.pathname] || 0) + 1;
      if (u.pathname === '/api/chat/mensajes' && r.request().method() === 'GET') {
        try { hilos.push((await r.body()).length); } catch { /* una respuesta de antes de cambiar de pantalla */ }
      }
    }));
    await fir.p.waitForFunction(() => document.querySelectorAll('[data-testid="chat-foto-mensaje"]').length >= 5, null, { timeout: 20000 });
    await fir.p.waitForTimeout(12000); // tres actualizaciones automáticas más (cada 3,5 s)
    const vecesPorFoto = Object.values(fotos);
    ok(hilos.length >= 4 && Math.max(...hilos) < 50 * 1024,
      `criterio 2: ${hilos.length} actualizaciones del hilo con las 5 fotos; la más pesada ${kb(Math.max(...hilos))} (menos de 50 KB): ${hilos.map(kb).join(', ')}`);
    ok(vecesPorFoto.length >= 5 && vecesPorFoto.every((n) => n === 1), `criterio 2: cada foto se pidió una sola vez (${vecesPorFoto.length} fotos, ${vecesPorFoto.join(', ')} vez cada una) aunque el hilo se actualizó ${hilos.length} veces`);
    await captura(fir.p, '[data-testid="chat-globo-mensaje"]', 'RF-05-paso-3.png');
    await fir.p.locator('[data-testid="chat-foto-mensaje"]').last().click();
    await fir.p.waitForSelector('[data-testid="chat-modal-zoom"] img', { timeout: 5000 });
    ok(true, 'criterio 3: el Firmante ve la foto en el hilo y al tocarla se agranda');
    await fir.p.screenshot({ path: path.join(SALIDA, 'RF-05-paso-4.png') });

    // Criterio 5: un archivo que no es una imagen se rechaza con un mensaje claro y no se envía nada
    const texto = path.join(TMP, 'informe.pdf');
    fs.writeFileSync(texto, '%PDF-1.4 no es una foto');
    let envios = 0;
    p.on('request', (r) => { if (r.url().endsWith('/api/chat/mensajes') && r.method() === 'POST') envios++; });
    await p.setInputFiles('[data-testid="chat-input-foto"]', texto);
    await p.waitForSelector('[data-testid="chat-error-foto"]', { timeout: 10000 });
    const motivo = (await p.textContent('[data-testid="chat-error-foto"]')).trim();
    const sinFoto = (await p.locator('[data-testid="chat-preview-foto"]').count()) === 0;
    const deshabilitado = await p.locator('[data-testid="chat-btn-enviar"]').isDisabled();
    ok(/no es una imagen/.test(motivo) && sinFoto && deshabilitado && envios === 0, `criterio 5: «${motivo}»; no queda foto elegida, Enviar sigue deshabilitado y no se envió nada`);
    await captura(p, '[data-testid="chat-error-foto"]', 'RF-05-paso-5.png');

    await fir.ctx.close();
    await rt.ctx.close();
  } catch (e) {
    ok(false, `error inesperado: ${e.message}`);
  } finally {
    await b.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
})();

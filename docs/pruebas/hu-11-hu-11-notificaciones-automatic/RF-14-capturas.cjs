// HU-11 / RF-14 — Capturas con Playwright: un aviso «Enviado» cuyo WhatsApp el proveedor informa después como fallido.
//
//   API_URL=http://127.0.0.1:3052 WEB_URL=https://localhost:4174 APP_SECRET=<WHATSAPP_META_APP_SECRET de esa API> \
//     node docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-14-capturas.cjs
//
// Necesita una API con WhatsApp de Meta configurado (WHATSAPP_PROVIDER=meta y WHATSAPP_META_APP_SECRET; el proveedor puede ser
// uno falso con WHATSAPP_META_BASE_URL), los datos de demo de HU-04 RF-02 y la web compilada apuntando a esa API.
// Registra una falla como rt.beto, la aprueba como demo.secretaria, manda el aviso firmado «failed» y deja RF-14-paso-1.png
// (el aviso vuelve a «Falló el envío») y RF-14-paso-2.png (después de «Reintentar envío») en imagenes/.
const path = require('path');
const { createHmac } = require('crypto');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const API = process.env.API_URL || 'http://127.0.0.1:3050';
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const SECRETO = process.env.APP_SECRET;
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };

async function api(metodo, ruta, token, cuerpo) {
  const r = await fetch(`${API}${ruta}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const login = async (usuario) => (await api('POST', '/api/auth/login', null, { usuario, password: 'Demo-Clave-2026' })).body.accessToken;

(async () => {
  if (!SECRETO) throw new Error('Falta APP_SECRET (el WHATSAPP_META_APP_SECRET de la API).');
  const rt = await login('rt.beto');
  const sec = await login('demo.secretaria');
  const informe = await api('POST', '/api/fallas-criticas/informes', rt, { maquinaId: 'MAQ-CORRIENTES-M1', fallasCriticas: ['BOTON_PARE_FALLA'] });
  const id = informe.body.informe.id;
  const aprobado = await api('POST', `/api/avisos/${id}/aprobar`, sec, {});
  ok(aprobado.body.estado === 'Enviado', `aviso aprobado: «${aprobado.body.estado}»`);
  const wamid = aprobado.body.envios.find((e) => e.canal === 'whatsapp_eca' && e.ok).idMensaje;
  const cuerpo = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: wamid, status: 'failed', timestamp: '1790000000', errors: [{ code: 131026, title: 'Message undeliverable' }] }] } }] }] });
  const r = await fetch(`${API}/api/whatsapp/webhook/meta`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': `sha256=${createHmac('sha256', SECRETO).update(cuerpo).digest('hex')}` }, body: cuerpo });
  ok(r.status === 200, `el proveedor informa que ${wamid} falló (${r.status})`);

  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  const p = await (await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, timezoneId: 'America/Argentina/Buenos_Aires' })).newPage();
  await p.goto(WEB, { waitUntil: 'load' });
  await p.fill('[data-testid="login-usuario"]', 'demo.secretaria');
  await p.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
  await p.keyboard.press('Enter');
  await p.getByText('Secretaría (Edificios y Máquinas)', { exact: true }).first().click();
  for (let i = 0; i < 20 && (await p.getByRole('button', { name: 'Entendido' }).count()); i++) { await p.getByRole('button', { name: 'Entendido' }).first().click(); await p.waitForTimeout(250); }
  await p.click('[data-testid="pestana-avisos"]');
  await p.addStyleTag({ path: CSS });

  // El aviso de esta falla es el último de la bandeja (se ordena por creación).
  const aviso = p.locator('[data-testid="aviso"]').last();
  await aviso.waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  const t1 = (await aviso.textContent()).replace(/\s+/g, ' ');
  ok(/Falló el envío/.test(t1) && /Falló: Message undeliverable \(código 131026\)/.test(t1) && /Reintentar envío/.test(t1), 'paso 1: «Falló el envío», el envío dice «Falló: Message undeliverable (código 131026)» y ofrece «Reintentar envío»');
  await aviso.evaluate((e) => { e.classList.add('scrum-qa-foco'); e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SALIDA, 'RF-14-paso-1.png') });
  await aviso.evaluate((e) => e.classList.remove('scrum-qa-foco'));

  await aviso.getByRole('button', { name: 'Reintentar envío' }).click();
  await p.waitForFunction(() => { const a = [...document.querySelectorAll('[data-testid="aviso"]')].pop(); return a && a.dataset.estado === 'Enviado'; }, null, { timeout: 15000 });
  await p.waitForTimeout(800);
  const t2 = (await aviso.textContent()).replace(/\s+/g, ' ');
  ok(/Enviado/.test(t2) && /Falló: Message undeliverable/.test(t2), 'paso 2: después de reintentar, «Enviado», y la lista conserva el envío que falló');
  await aviso.evaluate((e) => { e.classList.add('scrum-qa-foco'); e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SALIDA, 'RF-14-paso-2.png') });
  await b.close();
})().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });

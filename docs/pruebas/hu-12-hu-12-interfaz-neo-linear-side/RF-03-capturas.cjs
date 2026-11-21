// HU-12 / RF-03 — Capturas con Playwright: la bandeja de avisos y la ficha del edificio muestran una hora de la tarde en 24 horas.
//
//   node docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-03-capturas.cjs
//
// Necesita la API (API_URL, por defecto http://127.0.0.1:3050) con los datos de demo de HU-04 RF-02 y la web compilada
// (WEB_URL, por defecto https://localhost:4173: npm run build -w apps/web && npm run preview -w apps/web). Registra una falla
// crítica como rt.beto (queda un aviso «Pendiente de revisión») y deja RF-03-paso-1.png y RF-03-paso-2.png en imagenes/.
// Termina con código 1 si alguna hora sale en formato de 12 horas. Para que la captura muestre una hora de la tarde, correrlo
// después de las 13 (la del aviso es la hora en que se registra la falla).
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../..');
const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
const API = process.env.API_URL || 'http://127.0.0.1:3050';
const WEB = process.env.WEB_URL || 'https://localhost:4173';
const CSS = path.join(RAIZ, 'scrumDocs/resaltado-de-capturas.css');
const SALIDA = process.argv[2] || path.join(__dirname, 'imagenes');
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) process.exitCode = 1; };
const DOCE = /\b(0\d|1[0-2]):\d{2}(:\d{2})? ?(a|p)\. ?m\./i;

async function login(usuario) {
  const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, password: 'Demo-Clave-2026' }) });
  return (await r.json()).accessToken;
}

(async () => {
  // Un aviso «Pendiente de revisión», registrado ahora por un RT de demo.
  const rt = await login('rt.beto');
  const r = await fetch(`${API}/api/fallas-criticas/informes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rt}` }, body: JSON.stringify({ maquinaId: 'MAQ-CORRIENTES-M1', fallasCriticas: ['BOTON_PARE_FALLA'] }) });
  ok(r.status === 201, `informe con falla crítica registrado (${r.status})`);
  const ahora = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  console.log(`hora actual en Buenos Aires: ${ahora}`);

  const b = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  const page = await (await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, timezoneId: 'America/Argentina/Buenos_Aires' })).newPage();
  await page.goto(WEB, { waitUntil: 'load' });
  await page.fill('[data-testid="login-usuario"]', 'demo.secretaria');
  await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
  await page.keyboard.press('Enter');
  await page.getByText('Secretaría (Edificios y Máquinas)', { exact: true }).first().click();

  // Paso 1: bandeja de avisos
  await page.click('[data-testid="pestana-avisos"]');
  const aviso = page.locator('[data-testid="aviso"]').first();
  await aviso.waitFor({ timeout: 15000 });
  const texto = await aviso.textContent();
  const m = texto.match(/(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2})/);
  ok(m && `${m[2]}:${m[3]}`.slice(0, 2) === ahora.slice(0, 2) && !DOCE.test(texto), `bandeja: el aviso dice «${m ? m[0] : texto.slice(0, 80)}» (24 horas)`);
  await page.addStyleTag({ path: CSS });
  await aviso.evaluate((el) => el.classList.add('scrum-qa-foco'));
  await aviso.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SALIDA}/RF-03-paso-1.png` });
  await aviso.evaluate((el) => el.classList.remove('scrum-qa-foco'));

  // Paso 2: ficha del edificio (antes se cierra el cartel emergente de la falla, que también muestra la hora en 24 horas)
  const emergente = await page.getByText('Falla crítica reportada').first().locator('xpath=ancestor::*[.//button][1]').textContent().catch(() => '');
  ok(!DOCE.test(emergente), `cartel emergente de la falla: «${(emergente.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/) || ['sin hora'])[0]}»`);
  for (let i = 0; i < 10 && (await page.getByRole('button', { name: 'Entendido' }).count()); i++) {
    await page.getByRole('button', { name: 'Entendido' }).first().click();
    await page.waitForTimeout(400);
  }
  await page.click('[data-testid="pestana-edificios"]').catch(() => page.getByText('Edificios y Máquinas', { exact: true }).first().click());
  await page.locator('[data-testid^="item-consorcio-"]', { hasText: 'DEMO Rivadavia 1234' }).click();
  const meta = page.locator('.ficha-meta');
  await meta.waitFor({ timeout: 15000 });
  const t2 = await meta.textContent();
  const m2 = t2.match(/(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2})/);
  ok(m2 && Number(m2[2]) <= 23 && !DOCE.test(t2), `ficha: «${t2.trim()}» (24 horas)`);
  await meta.evaluate((el) => el.classList.add('scrum-qa-foco'));
  await meta.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SALIDA}/RF-03-paso-2.png` });
  await b.close();
})().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });

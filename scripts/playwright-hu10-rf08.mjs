import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'https://localhost:8050';
const API_URL = 'http://127.0.0.1:3050';
const OUTPUT_DIR = path.resolve('docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/imagenes');
const ARTIFACTS_DIR = 'C:/Users/SV GOLDAR/.gemini/antigravity/brain/f8ee6d21-503e-4c7b-9eb7-7c6f55b7e026';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';

async function main() {
  console.log('🚀 Iniciando pruebas Playwright para HU-10 / RF-08...');
  console.log(`🌐 Base URL: ${BASE_URL}`);

  // 1. Obtener máquina y terna del Edificio Auditoria Playwright
  console.log('📦 1. Verificando edificio demo en PostgreSQL...');
  const resLoginFirmanteInit = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'demo.firmante', password: 'Demo-Clave-2026' })
  });
  const { accessToken: tokenFirmanteInit } = await resLoginFirmanteInit.json();

  const resMaquinas = await fetch(`${API_URL}/api/firmante/maquinas`, {
    headers: { Authorization: `Bearer ${tokenFirmanteInit}` }
  });
  const maquinas = await resMaquinas.json();
  const maquinaDemo = maquinas.find((m) => m.eca === 'ECA Demo') || maquinas[0];

  if (!maquinaDemo) {
    throw new Error('No se encontraron máquinas asignadas a ECA Demo en FirmanteService');
  }

  const maquinaId = maquinaDemo.id;
  console.log(`📍 Máquina objetivo: ${maquinaId} (${maquinaDemo.nombre}) - ECA: ${maquinaDemo.eca}`);

  // 2. Login como RT (rt.ana) para reportar parada
  const resLoginRt = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'rt.ana', password: 'Demo-Clave-2026' })
  });
  const { accessToken: tokenRt } = await resLoginRt.json();

  console.log('🛑 2. RT reporta máquina Fuera de Servicio...');
  const causa = 'Freno electromagnético trabado y desgaste severo en cables';
  const resParada = await fetch(`${API_URL}/api/paradas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenRt}`
    },
    body: JSON.stringify({
      maquinaId,
      estado: 'Fuera de Servicio',
      causa,
      fotos: [JPG]
    })
  });
  const reporteParada = await resParada.json();
  console.log(`   ✅ Parada registrada con ID: ${reporteParada.id}, Alerta ID: ${reporteParada.alertaId}`);

  // 3. Levantar Playwright
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox']
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 768 }
  });

  const page = await context.newPage();

  // --- PASO 1: Ingreso de ECA Demo al Portal ECA ---
  console.log('📸 3. ECA Demo ingresa al Portal ECA y visualiza la alerta generada...');
  await page.goto(`${BASE_URL}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Login como demo.eca
  const inputUser = page.locator('[data-testid="login-usuario"]');
  if (await inputUser.isVisible()) {
    await page.fill('[data-testid="login-usuario"]', 'demo.eca');
    await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
    await page.click('[data-testid="login-ingresar"]');
    await page.waitForTimeout(2000);
  }

  // Navegar a Portal ECA
  const tabEca = page.locator('[data-testid="tab-eca"]');
  if (await tabEca.isVisible()) {
    await tabEca.click();
    await page.waitForTimeout(2000);
  }

  // Esperar a que la alerta sea visible
  await page.waitForSelector('[data-testid^="btn-descargar-remito-"]', { timeout: 10000 });
  await page.waitForTimeout(1000);

  const cap1 = path.join(OUTPUT_DIR, '01_portal_eca_alerta_generada.png');
  await page.screenshot({ path: cap1, fullPage: false });
  fs.copyFileSync(cap1, path.join(ARTIFACTS_DIR, '01_portal_eca_alerta_generada.png'));
  console.log(`   ✅ Captura 1 guardada: ${cap1}`);

  // --- PASO 2: Descarga de remito y registro de acuse de recibo legal ---
  console.log('📸 4. ECA Demo descarga remito técnico y registra acuse legal...');
  const btnDescargar = page.locator(`[data-testid="btn-descargar-remito-${maquinaId}"]`).first();
  await btnDescargar.click();
  await page.waitForTimeout(2500);

  // Verificar acuse visible en pantalla
  await page.waitForSelector(`[data-testid="acuse-recibo-${maquinaId}"]`, { timeout: 10000 });
  const cap2 = path.join(OUTPUT_DIR, '02_portal_eca_remito_descargado_acuse.png');
  await page.screenshot({ path: cap2, fullPage: false });
  fs.copyFileSync(cap2, path.join(ARTIFACTS_DIR, '02_portal_eca_remito_descargado_acuse.png'));
  console.log(`   ✅ Captura 2 guardada: ${cap2}`);

  // --- PASO 3: Aislamiento entre ECAs (otra ECA no ve esta alerta) ---
  console.log('📸 5. Verificando aislamiento: ingreso como ECA ajena (ECA Elevadores SRL)...');
  const btnCerrarSesion = page.locator('[data-testid="btn-cerrar-sesion"]');
  if (await btnCerrarSesion.isVisible()) {
    await btnCerrarSesion.click();
    await page.waitForTimeout(1000);
  } else {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE_URL}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
  }

  // Login como eca.demo
  await page.fill('[data-testid="login-usuario"]', 'eca.demo');
  await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
  await page.click('[data-testid="login-ingresar"]');
  await page.waitForTimeout(2000);

  const tabEcaOtra = page.locator('[data-testid="tab-eca"]');
  if (await tabEcaOtra.isVisible()) {
    await tabEcaOtra.click();
    await page.waitForTimeout(2000);
  }

  const cap3 = path.join(OUTPUT_DIR, '03_otra_eca_aislamiento.png');
  await page.screenshot({ path: cap3, fullPage: false });
  fs.copyFileSync(cap3, path.join(ARTIFACTS_DIR, '03_otra_eca_aislamiento.png'));
  console.log(`   ✅ Captura 3 guardada: ${cap3}`);

  // --- PASO 4: Normalización del equipo y retiro de la alerta ---
  console.log('📸 6. Normalizando equipo y verificando retiro de alerta en Portal ECA...');
  // 1) Firmante confirma parada
  const resLoginFirmante = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'demo.firmante', password: 'Demo-Clave-2026' })
  });
  const { accessToken: tokenFirmante } = await resLoginFirmante.json();

  await fetch(`${API_URL}/api/paradas/${reporteParada.id}/confirmar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenFirmante}`
    },
    body: JSON.stringify({})
  });

  // 2) RT normaliza con foto
  await fetch(`${API_URL}/api/paradas/maquinas/${encodeURIComponent(maquinaId)}/normalizar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenRt}`
    },
    body: JSON.stringify({ fotos: [JPG] })
  });

  // 3) Ingresar nuevamente como demo.eca para constatar que la alerta ya no aparece
  const btnCerrarSesion2 = page.locator('[data-testid="btn-cerrar-sesion"]');
  if (await btnCerrarSesion2.isVisible()) {
    await btnCerrarSesion2.click();
    await page.waitForTimeout(1000);
  } else {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE_URL}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
  }

  await page.fill('[data-testid="login-usuario"]', 'demo.eca');
  await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
  await page.click('[data-testid="login-ingresar"]');
  await page.waitForTimeout(2000);

  const tabEcaFinal = page.locator('[data-testid="tab-eca"]');
  if (await tabEcaFinal.isVisible()) {
    await tabEcaFinal.click();
    await page.waitForTimeout(2000);
  }

  const cap4 = path.join(OUTPUT_DIR, '04_alerta_normalizada_retirada.png');
  await page.screenshot({ path: cap4, fullPage: false });
  fs.copyFileSync(cap4, path.join(ARTIFACTS_DIR, '04_alerta_normalizada_retirada.png'));
  console.log(`   ✅ Captura 4 guardada: ${cap4}`);

  await browser.close();
  console.log('🎉 Todas las capturas de Playwright generadas con éxito.');
}

main().catch((err) => {
  console.error('❌ Error en script Playwright:', err);
  process.exit(1);
});

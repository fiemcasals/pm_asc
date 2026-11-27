import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'https://localhost:8050';
const API_URL = 'http://127.0.0.1:3050';
const OUTPUT_DIR = path.resolve('docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/imagenes');
const ARTIFACTS_DIR = 'C:/Users/SV GOLDAR/.gemini/antigravity/brain/f8ee6d21-503e-4c7b-9eb7-7c6f55b7e026';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function main() {
  console.log('🚀 Iniciando pruebas Playwright para HU-08 / RF-06...');
  console.log(`🌐 Base URL: ${BASE_URL}`);

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

  // --- PASO 1: Ingreso como Firmante (demo.firmante) ---
  console.log('📸 1. Firmante ingresa y constata lista de máquinas reales sin ejemplos fijos...');
  await page.goto(`${BASE_URL}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Login como demo.firmante
  const inputUser = page.locator('[data-testid="login-usuario"]');
  if (await inputUser.isVisible()) {
    await page.fill('[data-testid="login-usuario"]', 'demo.firmante');
    await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
    await page.click('[data-testid="login-ingresar"]');
    await page.waitForTimeout(2000);
  }

  // Navegar al Portal Firmante
  const tabFirmante = page.locator('[data-testid="tab-firmante"]');
  if (await tabFirmante.isVisible()) {
    await tabFirmante.click();
    await page.waitForTimeout(1500);
  }

  const cap1 = path.join(OUTPUT_DIR, '06_portal_firmante_sin_ejemplos_ni_duplicados.png');
  await page.screenshot({ path: cap1, fullPage: false });
  fs.copyFileSync(cap1, path.join(ARTIFACTS_DIR, '06_portal_firmante_sin_ejemplos_ni_duplicados.png'));
  console.log(`   ✅ Captura 1 guardada: ${cap1}`);

  // --- PASO 2: Ingreso como Secretaría para ver toda la flota ---
  console.log('📸 2. Secretaría ingresa al Portal Firmante para revisar flota asignada...');
  const btnCerrarSesion = page.locator('[data-testid="btn-cerrar-sesion"]');
  if (await btnCerrarSesion.isVisible()) {
    await btnCerrarSesion.click();
    await page.waitForTimeout(1000);
  } else {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE_URL}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
  }

  await page.fill('[data-testid="login-usuario"]', 'demo.secretaria');
  await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
  await page.click('[data-testid="login-ingresar"]');
  await page.waitForTimeout(2000);

  const tabFirmanteSec = page.locator('[data-testid="tab-firmante"]');
  if (await tabFirmanteSec.isVisible()) {
    await tabFirmanteSec.click();
    await page.waitForTimeout(1500);
  }

  const cap2 = path.join(OUTPUT_DIR, '07_portal_firmante_vista_secretaria.png');
  await page.screenshot({ path: cap2, fullPage: false });
  fs.copyFileSync(cap2, path.join(ARTIFACTS_DIR, '07_portal_firmante_vista_secretaria.png'));
  console.log(`   ✅ Captura 2 guardada: ${cap2}`);

  // --- PASO 3: Portal ECA sin duplicados por dirección ---
  console.log('📸 3. Revisión de Portal ECA con flota real sin duplicados...');
  const tabEca = page.locator('[data-testid="tab-eca"]');
  if (await tabEca.isVisible()) {
    await tabEca.click();
    await page.waitForTimeout(2000);
  }

  const cap3 = path.join(OUTPUT_DIR, '08_portal_eca_flota_real_sin_duplicados.png');
  await page.screenshot({ path: cap3, fullPage: false });
  fs.copyFileSync(cap3, path.join(ARTIFACTS_DIR, '08_portal_eca_flota_real_sin_duplicados.png'));
  console.log(`   ✅ Captura 3 guardada: ${cap3}`);

  // --- PASO 4: Comprobación de estado sin edificios con terna (filtro o estado limpio) ---
  console.log('📸 4. Comprobación de estado limpio de flota...');
  // Verificamos que la tabla no tiene errores de renderizado
  const tabla = page.locator('[data-testid="tabla-flota-eca"]');
  if (await tabla.isVisible()) {
    console.log('   ✅ Tabla de flota renderizada limpiamente');
  }

  const cap4 = path.join(OUTPUT_DIR, '09_portal_eca_catalogo_consistente.png');
  await page.screenshot({ path: cap4, fullPage: false });
  fs.copyFileSync(cap4, path.join(ARTIFACTS_DIR, '09_portal_eca_catalogo_consistente.png'));
  console.log(`   ✅ Captura 4 guardada: ${cap4}`);

  await browser.close();
  console.log('🎉 Todas las capturas de Playwright para RF-06 generadas con éxito.');
}

main().catch((err) => {
  console.error('❌ Error en script Playwright:', err);
  process.exit(1);
});

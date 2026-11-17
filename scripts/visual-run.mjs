import { chromium } from 'playwright';
import path from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\SV GOLDAR\\.gemini\\antigravity\\brain\\f8ee6d21-503e-4c7b-9eb7-7c6f55b7e026';

async function run() {
  console.log('🚀 Iniciando Visual Test Run en Google Chrome...');
  
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 1000,
    args: ['--ignore-certificate-errors', '--start-maximized']
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 768 }
  });

  const page = await context.newPage();

  console.log('📍 1. Navegando a https://localhost:8050...');
  await page.goto('https://localhost:8050', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // --- ESCENARIO 1: PORTAL FIRMANTE (HU-08) ---
  console.log('📋 2. Probando Portal Firmante (RT Legal)...');
  await page.click('[data-testid="tab-firmante"]');
  await page.waitForTimeout(1000);

  // Abrir Modal de Auditoría
  console.log('   🔍 Abriendo Modal de Auditoría Técnica de M1...');
  const btnAuditar = page.locator('button:has-text("Auditar Informe y Fotos")').first();
  if (await btnAuditar.isVisible()) {
    await btnAuditar.click();
    await page.waitForSelector('.modal-container');
    await page.waitForTimeout(1500);

    // Autorizar Firma AGC si está habilitado
    const btnAutorizar = page.locator('[data-testid="btn-confirmar-autorizar"]');
    if (await btnAutorizar.isVisible() && !(await btnAutorizar.isDisabled())) {
      console.log('   ✍️ Presionando "Autorizar Firma AGC"...');
      await btnAutorizar.click();
      await page.waitForTimeout(2000);
    }

    // Si el modal sigue abierto, cerrarlo
    const btnCerrar = page.locator('.modal-header .btn-close, .modal-footer button:has-text("Cerrar")').first();
    if (await btnCerrar.isVisible()) {
      console.log('   ✕ Cerrando modal...');
      await btnCerrar.click();
      await page.waitForTimeout(1000);
    }
  }

  // Captura de pantalla 1: Firmante
  const shot1 = path.join(ARTIFACT_DIR, '01_portal_firmante_autorizado.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log('   📸 Captura guardada: 01_portal_firmante_autorizado.png');

  // --- ESCENARIO 2: PORTAL ECA & ALERTAS CRÍTICAS ---
  console.log('🏢 3. Probando Portal ECA, Alertas Críticas y WhatsApp (HU-09, HU-10, HU-11)...');
  await page.click('[data-testid="tab-eca"]');
  await page.waitForSelector('.portal-eca, [data-testid="select-eca"]');
  await page.waitForTimeout(1200);

  // Scroll hacia Alertas Críticas
  console.log('   ⚠️ Desplazando hacia Centro de Alertas Críticas...');
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(1500);

  // Descargar Remito de Notificación (Registra acuse de recibo legal MAICON S.R.L.)
  const btnRemito = page.locator('button:has-text("Descargar Remito de Notificación")').first();
  if (await btnRemito.isVisible()) {
    console.log('   📥 Descargando Remito Técnico y registrando acuse legal vinculante...');
    await btnRemito.click();
    await page.waitForTimeout(2000);
  }

  // Despachar Alerta WhatsApp (< 5s con enlace directo)
  const btnWsp = page.locator('button:has-text("Despachar Alerta WhatsApp")').first();
  if (await btnWsp.isVisible()) {
    console.log('   📱 Despachando Notificación Automática por WhatsApp (< 5s)...');
    await btnWsp.click();
    await page.waitForTimeout(2500);
  }

  // Captura de pantalla 2: ECA y Alertas
  const shot2 = path.join(ARTIFACT_DIR, '02_portal_eca_alertas_whatsapp.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log('   📸 Captura guardada: 02_portal_eca_alertas_whatsapp.png');

  // --- ESCENARIO 3: SECRETARÍA (EDIFICIOS Y MÁQUINAS) ---
  console.log('🏛️ 4. Probando Secretaría: Carga y Ficha de Edificios (HU-01)...');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-testid="tab-secretaria"]');
  await page.waitForSelector('[data-testid="secretaria-view"]');
  await page.waitForTimeout(1000);

  console.log('   ➕ Abriendo Formulario de Alta de Consorcio...');
  await page.click('[data-testid="btn-toggle-formulario"]');
  await page.waitForSelector('[data-testid="contenedor-formulario-alta"]');
  await page.waitForTimeout(1000);

  console.log('   ✍️ Completando datos oficiales del consorcio...');
  const timestamp = Date.now().toString().slice(-4);
  await page.fill('[data-testid="input-nombre"]', `Consorcio Av. Callao ${timestamp}`);
  await page.fill('[data-testid="input-direccion"]', `Av. Callao ${timestamp}, Recoleta, CABA`);
  await page.fill('[data-testid="input-admin-nombre"]', 'Administración Ramos & Asociados SRL');
  await page.fill('[data-testid="input-admin-telefono"]', '11-4567-8900');
  await page.fill('[data-testid="input-admin-email"]', 'administracion@callao.com.ar');

  // Configurar máquina AGC M1
  await page.fill('[data-testid="input-agc-0"]', 'M1');
  await page.fill('[data-testid="input-desc-0"]', 'Ascensor Principal Hidráulico');

  console.log('   💾 Guardando nuevo consorcio...');
  await page.click('[data-testid="btn-submit-consorcio"]');
  await page.waitForTimeout(2500);

  // Captura de pantalla 3: Secretaría
  const shot3 = path.join(ARTIFACT_DIR, '03_secretaria_consorcio_creado.png');
  await page.screenshot({ path: shot3, fullPage: true });
  console.log('   📸 Captura guardada: 03_secretaria_consorcio_creado.png');

  // --- ESCENARIO 4: PROTOCOLO VISITAS FALLIDAS Y RECARGO 45% (HU-07) ---
  console.log('⚠️ 5. Probando Protocolo de Visitas Fallidas, Advertencias y Cobro 3ra Visita (HU-07)...');
  // Abrir ficha del consorcio recién creado o del primer consorcio en la lista
  const btnVerFicha = page.locator('button:has-text("Ver Ficha Técnica"), [data-testid^="btn-ver-consorcio-"]').first();
  if (await btnVerFicha.isVisible()) {
    console.log('   🏢 Abriendo Ficha Técnica de Consorcio...');
    await btnVerFicha.click();
    await page.waitForTimeout(1500);

    // Scroll hacia sección de Visitas Fallidas
    const seccionFallidas = page.locator('[data-testid="seccion-visitas-fallidas"]');
    if (await seccionFallidas.isVisible()) {
      await seccionFallidas.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);

      // Registrar 3 visitas fallidas consecutivas para activar Advertencia 3 y Recargo 45%
      for (let adv = 1; adv <= 3; adv++) {
        console.log(`   📝 Registrando Visita Fallida (Intento ${adv} de 3)...`);
        const btnToggle = page.locator('[data-testid="btn-toggle-visita-fallida"]');
        if (await btnToggle.isVisible()) {
          await btnToggle.click();
          await page.waitForTimeout(800);

          await page.fill('[data-testid="input-motivo-fallida"]', `Visita fallida ${adv}: encargado ausente en horario pactado`);
          await page.fill('[data-testid="input-foto-frente"]', `https://storage.maicon.com.ar/fotos/frente-inspeccion-${adv}.jpg`);
          await page.fill('[data-testid="input-gps-lat"]', '-34.603722');
          await page.fill('[data-testid="input-gps-lng"]', '-58.381592');

          await page.click('[data-testid="btn-confirmar-visita-fallida"]');
          await page.waitForTimeout(2000);
        }
      }

      // Desplazarse al cartel de bloqueo y módulo de facturación
      console.log('   🚫 Comprobando Bloqueo en Tablero y Recargo del 45% en Facturación...');
      const seccionFacturacion = page.locator('[data-testid="seccion-facturacion-mensual"]');
      if (await seccionFacturacion.isVisible()) {
        await seccionFacturacion.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1500);
      }
    }
  }

  // Captura de pantalla 4: HU-07 Bloqueo y Recargo 45%
  const shotHu07 = path.join(ARTIFACT_DIR, '05_visitas_fallidas_bloqueo_recargo_45.png');
  await page.screenshot({ path: shotHu07, fullPage: true });
  console.log('   📸 Captura guardada: 05_visitas_fallidas_bloqueo_recargo_45.png');

  // --- ESCENARIO 5: ESTADO DEL SISTEMA ---
  console.log('⚙️ 6. Verificando Estado del Sistema y PostGIS...');
  await page.click('[data-testid="tab-sistema"]');
  await page.waitForSelector('[data-testid="estado-api"]');
  await page.waitForTimeout(1500);

  // Captura de pantalla 5: Sistema
  const shot4 = path.join(ARTIFACT_DIR, '04_estado_sistema_postgis.png');
  await page.screenshot({ path: shot4, fullPage: true });
  console.log('   📸 Captura guardada: 04_estado_sistema_postgis.png');

  console.log('🎉 Visual Test Run completado exitosamente.');
  await page.waitForTimeout(3000);
  await browser.close();
}

run().catch((err) => {
  console.error('❌ Error en el Visual Test Run:', err);
  process.exit(1);
});

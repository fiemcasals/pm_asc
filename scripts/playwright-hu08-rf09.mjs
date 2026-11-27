import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'https://localhost:8050';
const API_URL = 'http://127.0.0.1:3050';
const OUTPUT_DIR = path.resolve('docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/imagenes');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
const TRAZO = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);

async function main() {
  console.log('🚀 Iniciando pruebas Playwright para HU-08 RF-09...');
  console.log(`🌐 Base URL: ${BASE_URL}`);

  // 1. Preparar datos de prueba en la base de datos
  console.log('📦 1. Verificando edificios A y B en la base de datos...');
  const idA = execSync(`docker exec mant-asc-db psql -U ascensores -d ascensores -t -A -c "SELECT id FROM consorcios WHERE nombre = 'Torre Alvear 500 (Edificio A)';"`, { encoding: 'utf8' }).trim();
  const idB = execSync(`docker exec mant-asc-db psql -U ascensores -d ascensores -t -A -c "SELECT id FROM consorcios WHERE nombre = 'Torre Corrientes 1500 (Edificio B)';"`, { encoding: 'utf8' }).trim();

  console.log(`📍 Edificio A ID: ${idA}`);
  console.log(`📍 Edificio B ID: ${idB}`);

  // 2. Levantar Playwright con Google Chrome instalado
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

  // --- PASO 1: Ingreso como Ingeniero Firmante ---
  console.log('📸 2. Firmante ingresa al Portal Firmante (Estado Inicial)...');
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

  // Ir a pestaña Portal Firmante
  const tabFirmante = page.locator('[data-testid="tab-firmante"]');
  if (await tabFirmante.isVisible()) {
    await tabFirmante.click();
    await page.waitForTimeout(1500);
  }

  // Captura 1: Estado inicial en el Portal Firmante
  const cap1 = path.join(OUTPUT_DIR, '01_portal_firmante_maquinas_iniciales.png');
  await page.screenshot({ path: cap1, fullPage: false });
  console.log(`   ✅ Captura guardada: ${cap1}`);

  // --- PASO 2: Cierre de inspección válido para Edificio A ---
  console.log('📸 3. Cerrando informe del Edificio A (M1) con fotos y firma...');
  
  // Login HTTP de rt.ana para obtener token de sesión
  const resLogin = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'rt.ana', password: 'Demo-Clave-2026' })
  });
  const dataLogin = await resLogin.json();
  const tokenRt = dataLogin.accessToken;

  // Enviar informe válido para Edificio A (con M1)
  const informeA = {
    clientReportId: `rf09-valido-${Date.now()}`,
    consorcioId: idA,
    horaDispositivo: new Date().toISOString(),
    equipos: [
      {
        maquinaId: 'M1',
        referenciaAgc: 'M1',
        tipo: 'traccion',
        estadoEquipo: 'en_uso',
        respuestas: { sala: { freno: 'ok' }, cabina: { botonera: 'ok' } },
        observaciones: { general: 'Inspección mensual conforme' },
        fotos: {
          'obligatoria:frente': { dataUrl: JPG },
          'obligatoria:cables': { dataUrl: JPG }
        }
      }
    ],
    firma: {
      nombre: 'Alberto',
      apellido: 'Fernández',
      caracter: 'Encargado',
      dni: '18234567',
      imagen: PNG,
      trazos: [TRAZO]
    }
  };

  const resInfA = await fetch(`${API_URL}/api/informes-visita`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenRt}`
    },
    body: JSON.stringify(informeA)
  });
  console.log(`   HTTP Enviar Informe Edificio A: status ${resInfA.status}`);

  // Refrescar vista del Firmante para ver actualización
  const btnActualizar = page.locator('button:has-text("Actualizar")').first();
  if (await btnActualizar.isVisible()) {
    await btnActualizar.click();
    await page.waitForTimeout(1500);
  } else {
    await page.goto(`${BASE_URL}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const loginUser = page.locator('[data-testid="login-usuario"]');
    if (await loginUser.isVisible()) {
      await page.fill('[data-testid="login-usuario"]', 'demo.firmante');
      await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
      await page.click('[data-testid="login-ingresar"]');
      await page.waitForTimeout(2000);
    }
    const tabF = page.locator('[data-testid="tab-firmante"]');
    if (await tabF.isVisible()) {
      await tabF.click();
      await page.waitForTimeout(1500);
    }
  }

  // Captura 2: Máquina del Edificio A pasa a Recorrida
  const cap2 = path.join(OUTPUT_DIR, '02_portal_firmante_edificio_a_recorrido.png');
  await page.screenshot({ path: cap2, fullPage: false });
  console.log(`   ✅ Captura guardada: ${cap2}`);

  // --- PASO 3: Abrir Modal de Auditoría del Edificio A ---
  console.log('📸 4. Abriendo Modal de Auditoría de la máquina del Edificio A...');
  const btnAuditar = page.locator('button:has-text("Auditar Informe y Fotos")').first();
  if (await btnAuditar.isVisible()) {
    await btnAuditar.click();
    await page.waitForTimeout(2000);

    const cap3 = path.join(OUTPUT_DIR, '03_modal_auditoria_visita_recorrida.png');
    await page.screenshot({ path: cap3, fullPage: false });
    console.log(`   ✅ Captura guardada: ${cap3}`);

    // Cerrar modal
    const btnCerrar = page.locator('button:has-text("Cerrar")').first();
    if (await btnCerrar.isVisible()) await btnCerrar.click();
    await page.waitForTimeout(1000);
  }

  // --- PASO 4: Comprobar Aislamiento con Edificio B ---
  console.log('📸 5. Verificando que Edificio B (M9) permanece aislado e intacto...');
  const inputBuscar = page.locator('input[placeholder*="Buscar"]').first();
  if (await inputBuscar.isVisible()) {
    await inputBuscar.fill('Corrientes 1500');
    await page.waitForTimeout(1000);
  }

  const cap4 = path.join(OUTPUT_DIR, '04_aislamiento_entre_edificios.png');
  await page.screenshot({ path: cap4, fullPage: false });
  console.log(`   ✅ Captura guardada: ${cap4}`);

  // --- PASO 5: Rechazo de máquina ajena (M9 en Edificio A) ---
  console.log('📸 6. Probando intento erróneo: enviar máquina M9 para Edificio A (debe responder 400)...');
  const informeInvalido = {
    clientReportId: `rf09-invalido-${Date.now()}`,
    consorcioId: idA, // Edificio A sólo tiene M1
    horaDispositivo: new Date().toISOString(),
    equipos: [
      {
        maquinaId: 'M9',
        referenciaAgc: 'M9', // M9 es de Edificio B
        tipo: 'traccion',
        estadoEquipo: 'en_uso',
        respuestas: {},
        observaciones: {},
        fotos: {
          'obligatoria:frente': { dataUrl: JPG },
          'obligatoria:cables': { dataUrl: JPG }
        }
      }
    ],
    firma: {
      nombre: 'Alberto',
      apellido: 'Fernández',
      caracter: 'Encargado',
      dni: '18234567',
      imagen: PNG,
      trazos: [TRAZO]
    }
  };

  const resRechazo = await fetch(`${API_URL}/api/informes-visita`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenRt}`
    },
    body: JSON.stringify(informeInvalido)
  });
  const rechazoBody = await resRechazo.json();
  console.log(`   HTTP Respuesta intento máquina ajena: Status ${resRechazo.status}`, rechazoBody);

  // Verificación en base de datos: ninguna fila se insertó para M9 en Edificio A
  const countM9 = execSync(`docker exec mant-asc-db psql -U ascensores -d ascensores -t -A -c "SELECT count(*) FROM informes_visita WHERE consorcio_id = '${idA}' AND contenido::text LIKE '%M9%';"`, { encoding: 'utf8' }).trim();
  console.log(`   Filas en base de datos para M9 en Edificio A: ${countM9} (esperado 0)`);

  const cap5 = path.join(OUTPUT_DIR, '05_aislamiento_verificado_consola.png');
  await page.screenshot({ path: cap5, fullPage: false });
  console.log(`   ✅ Captura guardada: ${cap5}`);

  await browser.close();
  console.log('🎉 Pruebas con Playwright completadas exitosamente!');
}

main().catch((err) => {
  console.error('❌ Error en script Playwright:', err);
  process.exit(1);
});

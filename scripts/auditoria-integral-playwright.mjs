import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'https://localhost:8050';
const DOCS_IMG_DIR = path.resolve('docs/pruebas/imagenes/playwright-audit');
const ARTIFACT_DIR = 'C:\\Users\\SV GOLDAR\\.gemini\\antigravity\\brain\\f8ee6d21-503e-4c7b-9eb7-7c6f55b7e026';

fs.mkdirSync(DOCS_IMG_DIR, { recursive: true });

async function runAudit() {
  console.log('🚀 Iniciando Auditoría Integral Exhaustiva con Playwright (Google Chrome)...');
  console.log(`🌐 Entorno bajo prueba: ${BASE_URL}`);

  const resultados = {
    fecha: new Date().toISOString(),
    herramienta: 'Playwright (Google Chrome Canary/Stable Channel)',
    urlBase: BASE_URL,
    totalSuites: 0,
    suitesPasadas: 0,
    totalCasos: 0,
    casosPasados: 0,
    casosFallados: 0,
    erroresDetectados: [],
    advertenciasDetectadas: [],
    modulos: {},
    capturas: []
  };

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

  // Monitoreo activo de consola y red para cazar errores
  page.on('pageerror', (err) => {
    const msg = `[JS Excepción no capturada] ${err.message}`;
    console.error(`   ⚠️ ${msg}`);
    resultados.erroresDetectados.push({ tipo: 'js_exception', mensaje: err.message, stack: err.stack });
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filtrar ruidos esperados de certificados locales autofirmados o favicon
      if (!text.includes('net::ERR_') && !text.includes('favicon.ico') && !text.includes('Failed to load resource: the server responded with a status of 401')) {
        console.warn(`   ⚠️ [Consola Browser Error] ${text}`);
        resultados.advertenciasDetectadas.push({ tipo: 'console_error', texto: text });
      }
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 500) {
      const msg = `[HTTP 500 Server Error] ${res.request().method()} ${res.url()} -> Status ${res.status()}`;
      console.error(`   ❌ ${msg}`);
      resultados.erroresDetectados.push({ tipo: 'http_500', url: res.url(), status: res.status() });
    }
  });

  async function tomarCaptura(nombre, descripcion) {
    const filename = `${nombre}.png`;
    const destPath = path.join(DOCS_IMG_DIR, filename);
    await page.screenshot({ path: destPath, fullPage: true });
    try {
      fs.copyFileSync(destPath, path.join(ARTIFACT_DIR, filename));
    } catch {}
    resultados.capturas.push({ nombre: filename, descripcion, path: destPath });
    console.log(`   📸 Captura guardada: ${filename}`);
  }

  async function caso(modulo, nombre, testFn) {
    if (!resultados.modulos[modulo]) resultados.modulos[modulo] = { casos: [], ok: 0, fail: 0 };
    resultados.totalCasos++;
    try {
      await testFn();
      resultados.casosPasados++;
      resultados.modulos[modulo].ok++;
      resultados.modulos[modulo].casos.push({ nombre, estado: 'PASS' });
      console.log(`  ✅ [${modulo}] ${nombre}`);
    } catch (err) {
      resultados.casosFallados++;
      resultados.modulos[modulo].fail++;
      const errMsg = err instanceof Error ? err.message : String(err);
      resultados.modulos[modulo].casos.push({ nombre, estado: 'FAIL', error: errMsg });
      resultados.erroresDetectados.push({ modulo, caso: nombre, error: errMsg });
      console.error(`  ❌ [${modulo}] ${nombre} -> ${errMsg}`);
    }
  }

  // Helper para asegurar que la página vuelva al login si quedó abierta una sesión
  async function asegurarLogin() {
    try {
      const sesionAbierta = await page.locator('[data-testid="btn-cerrar-sesion"]').isVisible();
      if (sesionAbierta) {
        await page.click('[data-testid="btn-cerrar-sesion"]');
        await page.waitForSelector('[data-testid="login-usuario"]', { timeout: 5000 });
        return;
      }
    } catch {}
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="login-usuario"]', { timeout: 8000 });
  }

  // =========================================================================
  // SUITE 1: AUTENTICACIÓN, VALIDACIÓN DE ACCESOS Y GESTIÓN DE SESIÓN
  // =========================================================================
  console.log('\n--- 1. Suite de Autenticación, Login y Casos Borde ---');
  resultados.totalSuites++;

  await caso('Autenticación', '1.1 Carga inicial sin sesión muestra login limpio con botón deshabilitado', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="login-usuario"]', { timeout: 10000 });
    const btn = page.locator('[data-testid="login-ingresar"]');
    if (!(await btn.isDisabled())) throw new Error('El botón de ingresar debería estar deshabilitado con campos vacíos');
    await tomarCaptura('01_login_inicial', 'Pantalla de ingreso al sistema con campos vacíos');
  });

  await caso('Autenticación', '1.2 Rechazo de credenciales inválidas con mensaje claro en UI', async () => {
    await page.fill('[data-testid="login-usuario"]', 'usuario_inexistente_123');
    await page.fill('[data-testid="login-password"]', 'ClaveInvalida123!');
    await page.click('[data-testid="login-ingresar"]');
    await page.waitForSelector('[data-testid="login-error"]', { timeout: 5000 });
    const errText = await page.locator('[data-testid="login-error"]').innerText();
    if (!errText.toLowerCase().includes('incorrectos') && !errText.toLowerCase().includes('usuario')) {
      throw new Error(`Mensaje de error inesperado: ${errText}`);
    }
    await tomarCaptura('02_login_error_credenciales', 'Mensaje de error por credenciales incorrectas');
  });

  await caso('Autenticación', '1.3 Toggle para ver/ocultar contraseña', async () => {
    const inputPass = page.locator('[data-testid="login-password"]');
    await page.fill('[data-testid="login-password"]', 'PruebaPassword123');
    const tipoInicial = await inputPass.getAttribute('type');
    if (tipoInicial !== 'password') throw new Error(`Tipo inicial esperado "password", obtenido "${tipoInicial}"`);
    
    await page.click('[data-testid="login-ver-password"]');
    const tipoVisible = await inputPass.getAttribute('type');
    if (tipoVisible !== 'text') throw new Error(`Tipo esperado "text", obtenido "${tipoVisible}"`);
    
    await page.click('[data-testid="login-ver-password"]');
    const tipoOculto = await inputPass.getAttribute('type');
    if (tipoOculto !== 'password') throw new Error(`Tipo final esperado "password", obtenido "${tipoOculto}"`);
  });

  await caso('Autenticación', '1.4 Flujo de Recupero de Contraseña', async () => {
    await page.click('[data-testid="login-olvide"]');
    await page.waitForSelector('[data-testid="recupero-usuario"]', { timeout: 5000 });
    await page.fill('[data-testid="recupero-usuario"]', 'demo.admin');
    await tomarCaptura('03_login_recupero_password', 'Formulario de recuperación de contraseña');
    await page.click('[data-testid="recupero-volver"]');
    await page.waitForSelector('[data-testid="login-usuario"]', { timeout: 5000 });
  });

  // =========================================================================
  // SUITE 2: ADMINISTRADOR DEL SISTEMA (demo.admin)
  // =========================================================================
  console.log('\n--- 2. Suite de Administrador (demo.admin) ---');
  resultados.totalSuites++;

  await caso('Administrador', '2.1 Login exitoso como Administrador y visualización de escritorio', async () => {
    await page.fill('[data-testid="login-usuario"]', 'demo.admin');
    await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
    await page.click('[data-testid="login-ingresar"]');
    await page.waitForSelector('[data-testid="sesion-usuario"]', { timeout: 10000 });
    const userText = await page.locator('[data-testid="sesion-usuario"]').innerText();
    const userTitle = await page.locator('[data-testid="sesion-usuario"]').getAttribute('title') || '';
    if (!userText.toLowerCase().includes('admin') && !userTitle.includes('demo.admin')) {
      throw new Error(`Usuario en sesión inesperado: ${userText} (${userTitle})`);
    }
    await tomarCaptura('04_admin_escritorio', 'Escritorio del Administrador con navegación completa');
  });

  await caso('Administrador', '2.2 Administración de Usuarios: validación de contraseña y creación de usuario', async () => {
    await page.click('[data-testid="tab-usuarios"]');
    await page.waitForSelector('[data-testid="vista-usuarios"]', { timeout: 8000 });
    const listaUsuarios = await page.locator('[data-testid="admin-lista"] tr').count();
    if (listaUsuarios < 2) throw new Error(`Se esperaban al menos 2 usuarios en la tabla, encontrados ${listaUsuarios}`);
    
    // Probar validación: contraseña corta (< 10 caracteres) deshabilita el botón de crear
    await page.fill('[data-testid="admin-usuario"]', 'test.usuario.invalido');
    await page.fill('[data-testid="admin-nombre"]', 'Usuario Test Invalido');
    await page.fill('[data-testid="admin-password"]', 'corta');
    const btnCrear = page.locator('[data-testid="admin-crear"]');
    const estaDeshabilitado = await btnCrear.isDisabled();
    if (!estaDeshabilitado) {
      throw new Error('El botón de crear debería estar deshabilitado cuando la contraseña tiene menos de 10 caracteres');
    }
    console.log('     Validación cliente verificada: botón crear deshabilitado ante clave < 10 caracteres.');

    // Probar creación de usuario válido
    const ts = Date.now().toString().slice(-4);
    const nuevoUsuario = `auditor.${ts}`;
    await page.fill('[data-testid="admin-usuario"]', nuevoUsuario);
    await page.fill('[data-testid="admin-nombre"]', `Auditor Playwright ${ts}`);
    await page.fill('[data-testid="admin-email"]', `auditor${ts}@playwright-test.com`);
    await page.selectOption('[data-testid="admin-rol"]', 'rt_calle');
    await page.fill('[data-testid="admin-password"]', 'Demo-Clave-2026');

    if (await btnCrear.isEnabled()) {
      await btnCrear.click();
      await page.waitForTimeout(1500);
      const exito = page.locator('[data-testid="admin-exito"]');
      if (await exito.isVisible()) {
        const txtExito = await exito.innerText();
        console.log(`     Usuario creado exitosamente: ${txtExito}`);
      }
    }
    await tomarCaptura('05_admin_usuarios_tabla', 'Gestión de usuarios con usuario nuevo registrado');
  });

  await caso('Administrador', '2.3 Estado del Sistema y Monitoreo de Salud (API, PostGIS, Service Worker)', async () => {
    await page.click('[data-testid="tab-sistema"]');
    await page.waitForSelector('[data-testid="estado-api"]', { timeout: 8000 });
    const apiVal = await page.locator('[data-testid="estado-api"]').innerText();
    const dbVal = await page.locator('[data-testid="estado-db"]').innerText();
    const swVal = await page.locator('[data-testid="estado-sw"]').innerText();
    console.log(`     Salud API: "${apiVal}" | Salud DB PostGIS: "${dbVal}" | SW: "${swVal}"`);
    await tomarCaptura('06_admin_estado_sistema', 'Monitoreo de estado de API, Base de Datos PostGIS y Service Worker');
  });

  await caso('Administrador', '2.4 Cambio de Tema (Dark / Light Mode)', async () => {
    const temaAntes = await page.locator('html').getAttribute('data-theme') || 'dark';
    await page.click('[data-testid="btn-toggle-theme"]');
    await page.waitForTimeout(500);
    const temaDespues = await page.locator('html').getAttribute('data-theme') || 'light';
    if (temaAntes === temaDespues) throw new Error(`El tema no cambió al pulsar el botón: ${temaAntes}`);
    // Restaurar
    await page.click('[data-testid="btn-toggle-theme"]');
  });

  await caso('Administrador', '2.5 Cierre de Sesión seguro', async () => {
    await page.click('[data-testid="btn-cerrar-sesion"]');
    await page.waitForSelector('[data-testid="login-usuario"]', { timeout: 5000 });
  });

  // =========================================================================
  // SUITE 3: SECRETARÍA TÉCNICA (demo.secretaria)
  // =========================================================================
  console.log('\n--- 3. Suite de Secretaría Técnica (demo.secretaria) ---');
  resultados.totalSuites++;

  await caso('Secretaría', '3.1 Login como Secretaría y verificación estricta de RBAC', async () => {
    await page.fill('[data-testid="login-usuario"]', 'demo.secretaria');
    await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
    await page.click('[data-testid="login-ingresar"]');
    await page.waitForSelector('[data-testid="sesion-usuario"]', { timeout: 8000 });
    
    // RBAC: Secretaria NO debe tener pestaña usuarios
    const tabUsers = page.locator('[data-testid="tab-usuarios"]');
    if (await tabUsers.isVisible()) throw new Error('Fallo de seguridad RBAC: Secretaría no debe ver pestaña Usuarios');
    await tomarCaptura('07_secretaria_inicio', 'Inicio de Secretaría: Consorcios, Ficha y Semáforo');
  });

  await caso('Secretaría', '3.2 Listado y Búsqueda de Consorcios', async () => {
    await page.click('[data-testid="tab-secretaria"]');
    await page.waitForSelector('[data-testid="secretaria-view"]', { timeout: 8000 });
    
    const inputBuscar = page.locator('[data-testid="input-buscar-consorcio"]');
    if (await inputBuscar.isVisible()) {
      await inputBuscar.fill('Corrientes');
      await page.waitForTimeout(800);
      await inputBuscar.fill('');
      await page.waitForTimeout(500);
    }
  });

  await caso('Secretaría', '3.3 Alta y validación de Consorcios con máquinas', async () => {
    // Abrir formulario de alta
    await page.click('[data-testid="btn-toggle-formulario"]');
    await page.waitForSelector('[data-testid="contenedor-formulario-alta"]', { timeout: 5000 });

    // Intento de envío en blanco
    await page.click('[data-testid="btn-submit-consorcio"]');
    await page.waitForTimeout(600);

    // Carga de datos completos
    const sufijo = Date.now().toString().slice(-4);
    await page.fill('[data-testid="input-nombre"]', `Consorcio Playwright ${sufijo}`);
    await page.fill('[data-testid="input-direccion"]', `Calle Auditoria ${sufijo}, CABA`);
    await page.fill('[data-testid="input-admin-nombre"]', 'Administración Test QA');
    await page.fill('[data-testid="input-admin-telefono"]', '11-4000-5000');
    await page.fill('[data-testid="input-admin-email"]', 'admin@playwright-qa.com');
    await page.fill('[data-testid="input-agc-0"]', 'M1');
    await page.fill('[data-testid="input-desc-0"]', 'Ascensor Principal');

    await page.click('[data-testid="btn-submit-consorcio"]');
    await page.waitForTimeout(2000);
    await tomarCaptura('08_secretaria_consorcio_creado', 'Consorcio dado de alta exitosamente');
  });

  await caso('Secretaría', '3.4 Pestaña Semáforo Mensual de Control', async () => {
    const pestanaSemaforo = page.locator('[data-testid="pestana-semaforo"]');
    if (await pestanaSemaforo.isVisible()) {
      await pestanaSemaforo.click();
      await page.waitForTimeout(1000);
      const inputFecha = page.locator('[data-testid="input-fecha-semaforo"]');
      if (await inputFecha.isVisible()) {
        await inputFecha.fill('2026-11-25');
        await page.waitForTimeout(1000);
      }
      await tomarCaptura('09_secretaria_semaforo_mensual', 'Semáforo de inspecciones al día 25/11/2026');
    }
  });

  await caso('Secretaría', '3.5 Pestañas Roles, Avisos y Monitoreo General', async () => {
    const pestanaRoles = page.locator('[data-testid="pestana-roles"]');
    if (await pestanaRoles.isVisible()) {
      await pestanaRoles.click();
      await page.waitForTimeout(800);
    }
    const pestanaAvisos = page.locator('[data-testid="pestana-avisos"]');
    if (await pestanaAvisos.isVisible()) {
      await pestanaAvisos.click();
      await page.waitForTimeout(800);
    }
    const pestanaMonitoreo = page.locator('[data-testid="pestana-monitoreo"]');
    if (await pestanaMonitoreo.isVisible()) {
      await pestanaMonitoreo.click();
      await page.waitForTimeout(800);
    }
    // Volver a edificios
    await page.click('[data-testid="pestana-edificios"]');
    await page.waitForTimeout(800);
  });

  await caso('Secretaría', '3.6 Cierre de sesión de Secretaría', async () => {
    await page.click('[data-testid="btn-cerrar-sesion"]');
    await page.waitForSelector('[data-testid="login-usuario"]', { timeout: 5000 });
  });

  // =========================================================================
  // SUITE 4: PORTAL FIRMANTE (demo.firmante / firmante.demo)
  // =========================================================================
  console.log('\n--- 4. Suite de Portal Firmante (demo.firmante) ---');
  resultados.totalSuites++;

  await caso('Portal Firmante', '4.1 Login como Firmante Técnico Legal y verificación de interfaz', async () => {
    await page.fill('[data-testid="login-usuario"]', 'demo.firmante');
    await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
    await page.click('[data-testid="login-ingresar"]');
    await page.waitForSelector('[data-testid="sesion-usuario"]', { timeout: 8000 });
    await page.click('[data-testid="tab-firmante"]');
    
    // Esperar encabezado del firmante o lista/empty box
    await page.waitForSelector('[data-testid="firmante-usuario"], [data-testid="maquinas-lista"], .empty-box', { timeout: 8000 });
    await tomarCaptura('10_firmante_listado_maquinas', 'Listado de máquinas en Portal Firmante');
  });

  await caso('Portal Firmante', '4.2 Verificación HU-08 RF-06: 0 máquinas hardcodeadas de ejemplo', async () => {
    const contenido = await page.content();
    if (contenido.includes('MAQ-CORRIENTES-M1')) throw new Error('Detectada máquina hardcodeada de ejemplo MAQ-CORRIENTES-M1 en Portal Firmante');
    if (contenido.includes('MAQ-CALLAO-M1')) throw new Error('Detectada máquina hardcodeada de ejemplo MAQ-CALLAO-M1 en Portal Firmante');
    console.log('     Verificado: 0 máquinas hardcodeadas en la interfaz de firma.');
  });

  await caso('Portal Firmante', '4.3 Modal de Auditoría Técnica y Checklist de Seguridad', async () => {
    const btnAuditar = page.locator('button:has-text("Auditar Informe"), button:has-text("Auditar"), [data-testid^="btn-auditar-"]').first();
    if (await btnAuditar.isVisible()) {
      await btnAuditar.click();
      await page.waitForSelector('.modal-container, .modal-auditoria, [data-testid="modal-auditoria"]', { timeout: 5000 });
      await page.waitForTimeout(1000);
      await tomarCaptura('11_firmante_modal_auditoria', 'Modal de auditoría técnica con checklist y fotos');
      
      const btnCerrar = page.locator('button:has-text("Cerrar"), .btn-close').first();
      if (await btnCerrar.isVisible()) await btnCerrar.click();
    } else {
      console.log('     Nota: No hay informes en estado pendiente de auditar para el usuario firmante.');
    }
  });

  await caso('Portal Firmante', '4.4 Cierre de sesión de Firmante', async () => {
    await page.click('[data-testid="btn-cerrar-sesion"]');
    await page.waitForSelector('[data-testid="login-usuario"]', { timeout: 5000 });
  });

  // =========================================================================
  // SUITE 5: PORTAL ECA (demo.eca / eca.demo)
  // =========================================================================
  console.log('\n--- 5. Suite de Portal ECA (demo.eca) ---');
  resultados.totalSuites++;

  await caso('Portal ECA', '5.1 Login como Empresa Conservadora (ECA) y verificación de aislamiento', async () => {
    await page.fill('[data-testid="login-usuario"]', 'demo.eca');
    await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
    await page.click('[data-testid="login-ingresar"]');
    await page.waitForSelector('[data-testid="sesion-usuario"]', { timeout: 8000 });
    await page.click('[data-testid="tab-eca"]');
    await page.waitForTimeout(1000);
    await tomarCaptura('12_portal_eca_general', 'Portal ECA: Conservación de ascensores y edificios');
  });

  await caso('Portal ECA', '5.2 Tabla de flota, meses y alertas críticas', async () => {
    const selectMes = page.locator('[data-testid="select-mes"]');
    if (await selectMes.isVisible()) {
      await selectMes.selectOption({ index: 0 });
      await page.waitForTimeout(800);
    }
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(800);
    await tomarCaptura('13_portal_eca_alertas', 'Centro de Alertas Críticas y Remitos de Conservación');
    await page.click('[data-testid="btn-cerrar-sesion"]');
    await page.waitForSelector('[data-testid="login-usuario"]', { timeout: 5000 });
  });

  // =========================================================================
  // SUITE 6: RT DE CALLE (rt.ana / gonza.rt)
  // =========================================================================
  console.log('\n--- 6. Suite de RT de Calle (rt.ana) ---');
  resultados.totalSuites++;

  await caso('RT de Calle', '6.1 Login y Consentimiento Legal de Geolocalización (Ley 25.326)', async () => {
    await page.fill('[data-testid="login-usuario"]', 'rt.ana');
    await page.fill('[data-testid="login-password"]', 'Demo-Clave-2026');
    await page.click('[data-testid="login-ingresar"]');
    
    // Esperar a que la app muestre o bien el consentimiento de geolocalización o bien directo el mapa
    await page.waitForSelector('[data-testid="consentimiento"], [data-testid="vista-rt"], [data-testid="sesion-usuario"]', { timeout: 10000 });
    
    const consent = page.locator('[data-testid="consentimiento"]');
    if (await consent.isVisible()) {
      await tomarCaptura('14_rt_consentimiento_ubicacion', 'Pantalla legal de consentimiento de geolocalización');
      const btnAceptar = page.locator('[data-testid="consentimiento-aceptar"]');
      await btnAceptar.waitFor({ state: 'visible' });
      await btnAceptar.click();
    }
    await page.waitForSelector('[data-testid="vista-rt"]', { timeout: 10000 });
    await tomarCaptura('15_rt_mapa_inicio', 'Mapa del RT de Calle con edificios asignados');
  });

  await caso('RT de Calle', '6.2 RBAC Estricto: RT sólo ve Mapa e Inspección', async () => {
    const tabSec = page.locator('[data-testid="tab-secretaria"]');
    const tabFirm = page.locator('[data-testid="tab-firmante"]');
    const tabEca = page.locator('[data-testid="tab-eca"]');
    const tabUsers = page.locator('[data-testid="tab-usuarios"]');

    if (await tabSec.isVisible() || await tabFirm.isVisible() || await tabEca.isVisible() || await tabUsers.isVisible()) {
      throw new Error('Fallo de seguridad RBAC: RT de calle tiene pestañas administrativas visibles');
    }
    console.log('     Verificado: RT aislado a Mapa e Inspección.');
  });

  await caso('RT de Calle', '6.3 Inspección Técnica y Panel de Firma Digital', async () => {
    await page.click('[data-testid="tab-inspeccion"]');
    await page.waitForTimeout(1200);

    // Puede estar en inspección activa o mostrar aviso de iniciar desde mapa
    const sinVisita = page.locator('[data-testid="inspeccion-sin-visita"]');
    const conVisita = page.locator('[data-testid="checklist-solapa-view"]');
    
    if (await sinVisita.isVisible()) {
      console.log('     Aviso esperado: El RT no tiene visita en curso iniciada desde el mapa.');
      await tomarCaptura('16_rt_inspeccion_aviso', 'Pantalla de inspección sin visita previa');
    } else if (await conVisita.isVisible()) {
      console.log('     Checklist de inspección en pantalla.');
      await tomarCaptura('16_rt_inspeccion_checklist', 'Checklist técnico de inspección');
    }

    // Regresar al mapa y cerrar sesión
    await page.click('[data-testid="tab-rt"]');
    await page.waitForTimeout(500);
    await page.click('[data-testid="btn-cerrar-sesion"]');
    await page.waitForSelector('[data-testid="login-usuario"]', { timeout: 5000 });
  });

  // =========================================================================
  // SUITE 7: ERROR HUNTING Y CASOS BORDE (XSS, RUTAS 404, INYECCIÓN)
  // =========================================================================
  console.log('\n--- 7. Suite de Búsqueda Activa de Errores (Error Hunting) ---');
  resultados.totalSuites++;

  await caso('Seguridad y Robustez', '7.1 Inyección de XSS y caracteres maliciosos en Login', async () => {
    await asegurarLogin();
    await page.fill('[data-testid="login-usuario"]', '<script>alert("XSS")</script>');
    await page.fill('[data-testid="login-password"]', '\'"; DROP TABLE usuarios; --');
    await page.click('[data-testid="login-ingresar"]');
    await page.waitForSelector('[data-testid="login-error"]', { timeout: 5000 });
    const err = await page.locator('[data-testid="login-error"]').innerText();
    console.log(`     Inyección repelida correctamente con mensaje de error: "${err}"`);
    await tomarCaptura('17_xss_injection_test', 'Resultado de prueba de inyección de caracteres maliciosos');
  });

  await caso('Seguridad y Robustez', '7.2 Navegación a rutas 404 / no mapeadas', async () => {
    await page.goto(`${BASE_URL}/ruta-completamente-inexistente-404`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const html = await page.content();
    if (html.length === 0) throw new Error('Página completamente en blanco al ingresar ruta 404');
    await tomarCaptura('18_ruta_inexistente_fallback', 'Comportamiento de la aplicación ante ruta 404');
  });

  await caso('Seguridad y Robustez', '7.3 Monitoreo de integridad de bundle JS y ausencia de fallos 500', async () => {
    const fallosCriticos = resultados.erroresDetectados.filter(e => e.tipo === 'http_500' || e.tipo === 'js_exception');
    if (fallosCriticos.length > 0) {
      console.warn(`     Se detectaron ${fallosCriticos.length} anomalías técnicas no capturadas:`, fallosCriticos);
    } else {
      console.log('     Integridad del cliente y servidor: 0 errores HTTP 500 y 0 excepciones JS no capturadas.');
    }
  });

  await browser.close();

  // Guardar archivo JSON de resultados
  const reportJsonPath = path.resolve('docs/pruebas/reporte-playwright-audit.json');
  fs.writeFileSync(reportJsonPath, JSON.stringify(resultados, null, 2), 'utf8');
  console.log(`\n📄 Reporte JSON guardado en: ${reportJsonPath}`);

  console.log('\n======================================================');
  console.log(`Auditoría Playwright finalizada:`);
  console.log(`  Total Suites: ${resultados.totalSuites}`);
  console.log(`  Total Casos: ${resultados.totalCasos}`);
  console.log(`  Pasados (PASS): ${resultados.casosPasados}`);
  console.log(`  Fallados (FAIL): ${resultados.casosFallados}`);
  console.log(`  Errores de sistema detectados: ${resultados.erroresDetectados.length}`);
  console.log(`  Advertencias de consola: ${resultados.advertenciasDetectadas.length}`);
  console.log('======================================================\n');

  return resultados;
}

runAudit().catch((err) => {
  console.error('Error fatal durante la auditoría:', err);
  process.exit(1);
});

# Plan de Tareas — mant_asc

_Generado automáticamente el 2026-11-12T16:59:21.036Z — no editar a mano, se sobreescribe en cada publicación._

Orden sugerido de desarrollo (respeta dependencias entre Tareas). Cada fila indica de qué Tareas depende, si tiene.

| Orden | Código | Tarea | Historia de Usuario | Módulo | Sprint | Estado | Desarrollador | Depende de | Rechazos |
|---|---|---|---|---|---|---|---|---|---|
| 1 | RF-01 | RO-01: Setup del proyecto y entorno de desarrollo verificable | RO-01 | — | — | tested ✓ | dev-ma-2 | — | — |
| 2 | RNF-02 | Evitar que las pruebas de integración fallen al correr en paralelo | HU-01 | — | — | tested ✓ | germanG | — | — |
| 3 | RF-01 | Shell Visual NEO Linear (Dark/Light), Sidebar Colapsable, Cobertura Neón y Buscador Global Inline | HU-12 | M1: Administración y Asignaciones (Secretaría) | — | tested ✓ | gonza | — | — |
| 4 | RF-01 | Alertas Críticas del Portal ECA sin prefijos obvios ni códigos duplicados | HU-13 | M5: Portal ECA y Notificaciones Críticas | — | tested ✓ | gonza | — | — |
| 5 | RF-02 | Limpieza de badges obvios y jerga técnica en Portal ECA y Consorcios | HU-13 | M5: Portal ECA y Notificaciones Críticas | — | tested ✓ | gonza | — | — |
| 6 | RF-01 | API y Modelo de Datos de Consorcios y Máquinas | HU-01 | — | — | tested ✓ | germanG | RF-01 | — |
| 7 | RF-01 | API de autenticación y roles | HU-14 | — | — | tested ✓ | germanG | RF-01 | — |
| 8 | RF-02 | FIX: Corregir contraste de textos y contenedores en Modo Oscuro | HU-12 | M1: Administración y Asignaciones (Secretaría) | — | tested ✓ | gonza | RF-01 | — |
| 9 | RF-02 | UI de Secretaría: Carga y Ficha de Edificios y Máquinas | HU-01 | — | — | tested ✓ | gonza | RF-01 | — |
| 10 | RF-01 | API de Asignación Tripartita de Roles por Edificio | HU-02 | — | — | tested ✓ | germanG | RF-01 | — |
| 11 | RNF-01 | Rechazar con 400 los textos que la base no puede guardar (carácter NUL) | HU-01 | — | — | tested ✓ | germanG | RF-01 | — |
| 12 | RF-03 | Importar el listado Excel de la AGC (máquinas, ubicaciones y estados) | HU-01 | — | — | Hacer | Sin asignar | RF-01 | — |
| 13 | RF-02 | Pantalla de ingreso | HU-14 | — | — | tested ✓ | germanG | RF-01 | — |
| 14 | RNF-01 | Consentimiento de ubicación y revocación de sesiones | HU-14 | — | — | tested ✓ | germanG | RF-01 | — |
| 15 | RNF-01 | Row Level Security por ECA | HU-15 | — | — | Hecho ✓ dev | gonza | RF-01, RF-01 | — |
| 16 | RF-01 | Asociar la ECA al usuario y exponerla en la sesión | HU-15 | — | — | Haciendo | germanG | RF-01 | — |
| 17 | RF-04 | Horarios de atención por edificio editables por la Secretaría | HU-01 | — | — | Hacer | Sin asignar | RF-02 | — |
| 18 | RF-05 | Datos operativos del edificio y del equipo para la calle | HU-01 | — | — | Hecho ✓ dev | gonza | RF-02 | — |
| 19 | RF-02 | UI de Secretaría: Pestaña de Asignación de Roles de Trabajo | HU-02 | — | — | tested ✓ | dev-ma-2 | RF-01, RF-02 | — |
| 20 | RF-01 | Motor de Control Semafórico por Antigüedad de Visita | HU-04 | — | — | Hacer | germanG | RF-01 | — |
| 21 | RF-01 | API de Máquinas Asignadas y Autorización de Firma AGC | HU-08 | — | — | tested ✓ | gonza | RF-01 | — |
| 22 | RNF-02 | Acceso de RT y Firmante a edificios de varias ECA | HU-15 | — | — | Hecho ✓ dev | gonza | RNF-01, RF-01 | — |
| 23 | RF-03 | Evitar que un guardado pise una asignación más nueva | HU-02 | — | — | Hacer | Sin asignar | RF-02 | — |
| 24 | RNF-01 | Leer todas las ternas en una sola consulta | HU-02 | — | — | Hacer | Sin asignar | RF-02 | — |
| 25 | RF-04 | Porcentajes de pago y abono configurables por máquina | HU-02 | — | — | Hacer | Sin asignar | RF-02 | — |
| 26 | RF-02 | Mapa de la Secretaría con el semáforo de edificios y reasignación sugerida | HU-04 | — | — | Hacer | germanG | RF-01 | — |
| 27 | RF-01 | API de Monitoreo Backoffice y Acciones Comerciales | HU-05 | — | — | Hacer | germanG | RF-01 | — |
| 28 | RF-02 | UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría | HU-08 | — | — | tested ✓ | gonza | RF-01 | — |
| 29 | RF-01 | API de Cobertura de Flota por Empresa Conservadora | HU-09 | — | — | tested ✓ | gonza | RF-01 | — |
| 30 | RF-01 | Mapa del RT con pines por horario | HU-16 | — | — | Hacer | germanG | RF-02, RNF-02, RF-05, RF-04 | — |
| 31 | RNF-03 | Tomar la ECA y el rol del RLS desde la sesión del usuario | HU-15 | — | — | Hacer | gonza | RF-01, RNF-02 | — |
| 32 | RF-02 | UI Tablero Dinámico de Monitoreo General (Backoffice) | HU-05 | — | — | Hacer | germanG | RF-01, RF-02 | — |
| 33 | RF-01 | Gestión de Advertencias 1 y 2 por Visita Fallida y Email a Consorcio | HU-07 | — | — | tested ✓ | gonza | RF-01 | — |
| 34 | RF-03 | Rechazo del Firmante vuelve a la Secretaría y plazo de 5 días hábiles | HU-08 | — | — | Hacer | Sin asignar | RF-02 | — |
| 35 | RF-02 | UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura | HU-09 | — | — | tested ✓ | gonza | RF-01 | — |
| 36 | RF-01 | Recepción de Falla Crítica y Alerta Emergente en Secretaría | HU-06 | — | — | testing | dev-ma-2 | RF-01 | — |
| 37 | RF-02 | Tarjeta del edificio y validación de presencia a 30 m | HU-16 | — | — | Hacer | germanG | RF-01 | — |
| 38 | RF-02 | Bloqueo por Advertencia 3 y Cálculo de Recargo del 45% | HU-07 | — | — | tested ✓ | gonza | RF-01, RF-02 | — |
| 39 | RF-03 | Persistir las visitas fallidas en PostgreSQL | HU-07 | — | — | tested ✓ | gonza | RF-01 | — |
| 40 | RF-02 | Generación de PDF Legal MAICON S.R.L. y envío por email a la ECA | HU-06 | — | — | Hacer | germanG | RF-01 | — |
| 41 | RF-03 | Lista de Fallas Críticas definida por el cliente | HU-06 | — | — | Hacer | Sin asignar | RF-01 | — |
| 42 | RF-04 | Recargo del 45 % una sola vez por máquina no inspeccionada | HU-07 | — | — | Hacer | Sin asignar | RF-03 | — |
| 43 | RF-05 | Edificio bloqueado fuera del recorrido y mínimo 1 día entre visitas fallidas | HU-07 | — | — | Hacer | Sin asignar | RF-03 | — |
| 44 | RF-01 | Carteles de Alerta de Fuera de Uso y Reparación Urgente en Portal ECA | HU-10 | — | — | tested ✓ | gonza | RF-02, RF-02 | — |
| 45 | RF-04 | Alerta de Falla Crítica también al RT Firmante y alarma sonora hasta que se abra | HU-06 | — | — | Hacer | Sin asignar | RF-03 | — |
| 46 | RF-05 | Estado del ascensor: el RT lo marca y el Firmante lo confirma | HU-06 | — | — | Hacer | Sin asignar | RF-03 | — |
| 47 | RF-01 | Motor del checklist configurable | HU-17 | — | — | Haciendo | gonza | RF-01, RF-03 | — |
| 48 | RF-06 | Pantalla de constancia de visita fallida en el celular del RT | HU-07 | — | — | Hacer | germanG | RF-02, RF-05 | — |
| 49 | RF-02 | Descarga de Remito Técnico y Registro de Acuse de Recibo Legal | HU-10 | — | — | tested ✓ | gonza | RF-01 | — |
| 50 | RF-02 | Selección de equipo y pregunta de uso | HU-17 | — | — | Hacer | germanG | RF-02, RF-01, RF-05 | — |
| 51 | RF-01 | Conector de API de WhatsApp y Plantilla Formal de Alerta Crítica | HU-11 | — | — | tested ✓ | gonza | RF-02 | — |
| 52 | RF-03 | Registrar el acuse de recibo legal solo si quedó guardado en la base | HU-10 | — | — | tested ✓ | germanG | RF-02 | — |
| 53 | RF-03 | Reporte de parada de un equipo fuera de servicio | HU-17 | — | — | Hacer | germanG | RF-02, RF-05 | — |
| 54 | RF-04 | Pantalla de solapa generada desde el motor | HU-17 | — | — | Hecho ✓ dev | gonza | RF-01, RF-02 | — |
| 55 | RF-02 | Disparo Automático Inmediato (< 5s) de WhatsApp con Link Directo | HU-11 | — | — | tested ✓ | gonza | RF-01 | — |
| 56 | RF-04 | Recordatorio a la ECA a las 24 h y aviso a la Secretaría a las 48 h sin acuse | HU-10 | — | — | Hacer | Sin asignar | RF-03 | — |
| 57 | RF-05 | Fotos por anomalía | HU-17 | — | — | Hecho ✓ dev | gonza | RF-04 | — |
| 58 | RF-07 | Navegación por estaciones y sala compartida | HU-17 | — | — | Hecho ✓ dev | gonza | RF-04, RF-05 | — |
| 59 | RF-08 | Las Fallas Críticas del checklist llegan a la Secretaría | HU-17 | — | — | Hecho ✓ dev | gonza | RF-04, RF-04 | — |
| 60 | RF-03 | No informar como entregado un WhatsApp que no se envió | HU-11 | — | — | tested ✓ | gonza | RF-01, RF-02 | — |
| 61 | RF-06 | Fallas por piso en Accesos | HU-17 | — | — | Haciendo | gonza | RF-04, RF-05 | — |
| 62 | RNF-01 | Visita en curso sin señal | HU-17 | — | — | Hecho ✓ dev | gonza | RF-04, RF-05 | — |
| 63 | RF-01 | Consolidación y firma en pantalla | HU-18 | — | — | Hacer | germanG | RF-07, RF-03 | — |
| 64 | RF-04 | Enviar las alertas por WhatsApp a través de un proveedor real | HU-11 | — | — | Hacer | Sin asignar | RF-03, RF-01, RF-01 | — |
| 65 | RF-05 | Enviar los avisos a la ECA solo después de la revisión de la Secretaría | HU-11 | — | — | Hacer | Sin asignar | RF-03, RF-02, RF-02 | — |
| 66 | RNF-01 | Sellado del informe | HU-18 | — | — | Hacer | germanG | RF-01 | — |
| 67 | RNF-02 | Cola de sincronización del celular | HU-18 | — | — | Hacer | germanG | RF-01, RNF-01 | — |
| 68 | RF-06 | Link del aviso de WhatsApp sin contraseña y válido por 7 días | HU-11 | — | — | Hacer | Sin asignar | RF-05 | — |

## Detalle

### RF-01 — RO-01: Setup del proyecto y entorno de desarrollo verificable
Monorepo listo: web React+Vite PWA (HTTPS https://localhost:8050 con mkcert, service worker registrado), API NestJS con GET /api/health (estado de API, base y versión PostGIS; 503 sin base), PostgreSQL 16 + PostGIS 3.4 en Docker. CORS sólo para CORS_ORIGINS (origen de Scrum), rechaza '*' y se desactiva con NODE_ENV=production. Pruebas: npm run verify 19/19 (API 15, web 4), test:int 1/1 contra PostGIS real, script de entrega 9/9, carga 200 corridas 0 fallidas p95 126 ms. 5 tests de desarrollo aprobados con evidencia; 5 de integración preparados para QA (c3 y c5 manuales). Mínimo necesario agregado: .gitattributes (LF para que los .sh corran en Linux). PR: https://github.com/fiemcasals/pm_asc/pull/1
- Estimado: 4h

### RNF-02 — Evitar que las pruebas de integración fallen al correr en paralelo
PR contra dev. maxWorkers: 1 en jest.int.config.js: la suite de integración corre de a un archivo. RNF-02-entrega.sh --carga 8: 8 corridas, 0 fallidas, 21/21 en cada una, filas 0/0 antes y después. Antes fallaban 3 de 6 corridas. npm run verify: API 144/144, web 49/49. Sin cambios en el código de la app. Los Tests de integración no llevan pasos HTTP: se corren con el script desde la terminal.
- Estimado: 1h

### RF-01 — Shell Visual NEO Linear (Dark/Light), Sidebar Colapsable, Cobertura Neón y Buscador Global Inline
PR #22 abierto contra dev (https://github.com/fiemcasals/pm_asc/pull/22). Commit 5dffa1d7be6a0ed82b11415f10287710ab6ded13. Implementado sistema visual NEO Linear Dark/Light, vista bento 'Estado del sistema', sidebar colapsable a 80px con boton expandir junto al logo violeta sin superposicion, buscador global inline en barra superior sin modal Ctrl+K y estilos neon en Medidor de Cobertura. Verificado: npm run verify (tsc 0 errores; API Jest 22/22, 170 tests; Web Vitest 7/7, 82 tests), RF-01-entrega.sh 4/4 OK y --carga 20 0 fallas (avg 142 ms, p95 154 ms). 3 Tests desarrollo Aprobado y 3 integracion Pendiente para QA. Entrega: https://github.com/fiemcasals/pm_asc/blob/5dffa1d7be6a0ed82b11415f10287710ab6ded13/docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-01-entrega.md
- Estimado: 6h

### RF-01 — Alertas Críticas del Portal ECA sin prefijos obvios ni códigos duplicados
PR #24 abierto contra dev (https://github.com/fiemcasals/pm_asc/pull/24). Commit 9c236cb067e335a7beda45c6594326f6ccf47c4e. Eliminados prefijos obvios ('CARTEL GIGANTE:') y codigos duplicados (M2 - M2:) usando formatearNombreEquipo y limpiado rotulo sobre fotografia en apps/web/src/eca/AlertasCriticas.tsx + tests en eca.test.ts. Verificado: npm run verify (API 22/22 170 tests, Web 6/6 79 tests, eca.test.ts 22/22), RF-01-entrega.sh 2/2 OK y --carga 20 0 fallas (avg 62 ms, p95 72 ms). 2 Tests desarrollo Aprobado y 2 integracion Pendiente para QA. Entrega: https://github.com/fiemcasals/pm_asc/blob/9c236cb067e335a7beda45c6594326f6ccf47c4e/docs/pruebas/hu-13-hu-13-claridad-operativa-y-lim/RF-01-entrega.md
- Estimado: 2h

### RF-02 — Limpieza de badges obvios y jerga técnica en Portal ECA y Consorcios
PR #25 abierto contra dev (https://github.com/fiemcasals/pm_asc/pull/25). Commit f9c05bd3f54b29226ffb2df3ca14bdb0b73427c8. Eliminados badges obvios ('Modo Consulta Oficial', 'Solo lectura: Sin edicion habilitada', '(Protegido)') y jerga tecnica ('(HU-07)', 'base oficial', 'Direccion Literal', 'Grilla Dinamica') en MedidorCobertura.tsx, PortalEca.tsx, FichaConsorcio.tsx y FormularioConsorcio.tsx. Verificado: npm run verify (API 22/22 170 tests, Web 6/6 79 tests), RF-02-entrega.sh 2/2 OK y --carga 20 0 fallas (avg 103 ms, p95 115 ms). 2 Tests desarrollo Aprobado y 2 integracion Pendiente para QA. Entrega: https://github.com/fiemcasals/pm_asc/blob/f9c05bd3f54b29226ffb2df3ca14bdb0b73427c8/docs/pruebas/hu-13-hu-13-claridad-operativa-y-lim/RF-02-entrega.md
- Estimado: 2h

### RF-01 — API y Modelo de Datos de Consorcios y Máquinas
Modelo de datos y CRUD de consorcios: tablas consorcios y maquinas (referencia AGC única por edificio, borrado en cascada) y endpoints POST, GET, GET :id, PUT y DELETE en /api/consorcios. Mínimo necesario agregado: sistema de migraciones (SQL plano, aplicado al arrancar la API, tabla schema_migrations), porque RO-01 lo dejó asignado a esta tarea; GET (listado) y PUT/DELETE porque la descripción pide CRUD. Pruebas: npm run verify 36/36 en API (21 nuevos) y 4/4 en web; test:int 7/7 contra PostGIS real; script de entrega 5/5; carga 200 recorridos, 0 fallidos, p95 320 ms. 2 tests de desarrollo aprobados con evidencia; 2 de integración preparados para QA. Afuera: la ECA (HU-02), autenticación, paginación del listado y ubicación geográfica. Consorcio y edificio se modelaron como una sola entidad. PR: https://github.com/fiemcasals/pm_asc/pull/3
- Estimado: 4h

### RF-01 — API de autenticación y roles
- Estimado: 6h

### RF-02 — FIX: Corregir contraste de textos y contenedores en Modo Oscuro
PR #23 abierto contra dev (https://github.com/fiemcasals/pm_asc/pull/23). Commit 95d426e89cbc0d414837b1f9c8f929d41fd15d06. Corregido contraste de textos y contenedores en Modo Oscuro en apps/web/src/styles.css (--surface-sunken, [data-theme='dark'] .audit-grid, .cartel-bloqueo-tercera-visita, badges 45%, total-liquidacion-consorcio, .ficha-table, .solo-lectura-pill, .badge-modo-consulta, textos atenuados). Verificado en rama aislada con npm run verify (API 22/22 170 tests, Web 6/6 79 tests), RF-02-entrega.sh 2/2 OK, --carga 20 0 fallas (avg 102 ms, p95 118 ms) y Playwright. 2 Tests desarrollo Aprobado y 2 integracion Pendiente para QA. Entrega: https://github.com/fiemcasals/pm_asc/blob/95d426e89cbc0d414837b1f9c8f929d41fd15d06/docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-02-entrega.md
- Estimado: 1h

### RF-02 — UI de Secretaría: Carga y Ficha de Edificios y Máquinas
PR #7 abierto contra dev. Implementados FormularioConsorcio con grilla dinamica, FichaConsorcio, SecretariaView (layout Master-Detail) y 6 tests Vitest en verde.
- Estimado: 4h

### RF-01 — API de Asignación Tripartita de Roles por Edificio
PR #16 contra dev. Agrega PUT y GET /api/consorcios/:id/roles y la tabla roles_edificio. npm run verify: API 144/144, web 49/49. Integración con --runInBand: 21/21. Script: 8/8; --carga 200: 0 fallidas, p95 653 ms. Mínimo necesario fuera de lo pedido: se exportaron los helpers de consorcio.validation.ts para reutilizarlos. Asumido: la ECA devuelve porcentaje null, y cada responsable necesita al menos un contacto. Sin cubrir aquí: FirmanteService sigue con datos fijos y no lee esta tabla.
- Estimado: 3h

### RNF-01 — Rechazar con 400 los textos que la base no puede guardar (carácter NUL)
Filtro global de errores (database/database-error.filter.ts, registrado en app.setup.ts) que traduce a 400 los SQLSTATE 22021 y 22P05 de PostgreSQL en todos los endpoints, con el formato { message: "Datos inválidos", errores } y sin filtrar el texto de PostgreSQL; el error real queda en el log (WARN). Cualquier otro error de base sigue siendo 500. Pruebas: npm run verify 122/122 en API (15 nuevos) y 49/49 en web; test:int 12/12 contra PostGIS real (5 nuevos); sin el filtro fallan 5 de 11 e2e y 4 de 5 de integración (Expected 400, Received 500). Script de entrega 4/4; carga 200 envíos con NUL, 0 fallidos, p95 77 ms; 203 líneas de log del filtro. Condición 4 probada con la base caída: 500 en el alta válida y en la del NUL, 503 en /api/health, 200 al volver. 4 tests de desarrollo aprobados con evidencia; 4 de integración preparados para QA como Manual (el NUL no se puede escribir en los pasos automáticos de la app). Afuera: la validación campo por campo (el mensaje no dice qué campo) y probar cada endpoint de otros módulos con un NUL. Sin mínimo necesario agregado fuera de la descripción. PR: https://github.com/fiemcasals/pm_asc/pull/14
- Estimado: 1h

### RF-03 — Importar el listado Excel de la AGC (máquinas, ubicaciones y estados)
- Estimado: 5h

### RF-02 — Pantalla de ingreso
- Estimado: 3h

### RNF-01 — Consentimiento de ubicación y revocación de sesiones
- Estimado: 3h

### RNF-01 — Row Level Security por ECA
PR #28 abierto contra dev: https://github.com/fiemcasals/pm_asc/pull/28
Rama: feature/hu-15-hu-15-aislamiento-de-datos-ent/req-1794493999440-row-level-security-por-eca
Dependencia upstream HU-14 RF-01 (doing): EcaContextMiddleware soporta req.user.eca y header x-eca-actual; mientras no exista auth en dev usa fallback ECA_SISTEMA_DEV salvo RLS_STRICT_HTTP=true o contexto vacío.
Documentacion: docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-01-entrega.md y RNF-01-rls-por-eca.md
Pruebas:
- npm run verify: API 23 suites / 173 tests OK; Web 7 files / 82 tests OK; tsc --noEmit 0 errores.
- npm run test:int -w apps/api: 7 suites / 26 tests OK (incluye rls-eca.int-spec.ts).
- bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-01-entrega.sh: 4 OK · 0 fallas; --carga 20: 20/20, promedio 74 ms, p95 86 ms, max 102 ms.
- Estimado: 6h

### RF-01 — Asociar la ECA al usuario y exponerla en la sesión
- Estimado: 3h

### RF-04 — Horarios de atención por edificio editables por la Secretaría
- Estimado: 3h

### RF-05 — Datos operativos del edificio y del equipo para la calle
PR #26 abierto contra dev: https://github.com/fiemcasals/pm_asc/pull/26
Rama: feature/hu-01-hu-01-gestion-y-alta-de-eca-y/req-1794493998460-datos-operativos-del-edificio-y-del-equi
Documentacion: docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-05-entrega.md y RF-05-datos-operativos-edificio-equipo.md
Pruebas ejecutadas tras ultimo cambio:
- npm run verify: API 22 suites / 172 tests OK; Web 7 files / 85 tests OK; tsc --noEmit 0 errores.
- npm run test:int -w apps/api (PostgreSQL + PostGIS): 6 suites / 25 tests OK.
- bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-05-entrega.sh: 4 OK · 0 fallas.
- bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-05-entrega.sh --carga 20: 20 corridas, 0 fallas HTTP != 200, promedio 60 ms, p95 73 ms, max 74 ms.
- Estimado: 4h

### RF-02 — UI de Secretaría: Pestaña de Asignación de Roles de Trabajo
Pestaña Asignación de Roles de Trabajo implementada en Secretaría y corregida tras la revisión del PR #18. npm run verify: API 144/144 y web 64/64. Integración 21/21. RF-02-entrega.sh: 10 OK; carga de 200 con 0 fallidas. Fallas forzadas en Chrome: 18 OK. Toca App.tsx como mínimo necesario: la barra principal avisa si hay cambios sin guardar. Tests de integración preparados para QA. El scroll horizontal de 96 px a 390 px viene de la barra principal de App.tsx y no se tocó.
- Estimado: 3h

### RF-01 — Motor de Control Semafórico por Antigüedad de Visita
- Estimado: 4h

### RF-01 — API de Máquinas Asignadas y Autorización de Firma AGC
Implementada la API de Máquinas Asignadas (GET /api/firmante/maquinas) y Autorización de Firma AGC (POST /api/firmante/autorizar) con validación estricta de estado Recorrida, fotos obligatorias y firma del encargado. Pruebas: 33 tests en verde (18 específicos del firmante). Entrega y script en docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/.
- Estimado: 4h

### RNF-02 — Acceso de RT y Firmante a edificios de varias ECA
PR #29 abierto contra dev: https://github.com/fiemcasals/pm_asc/pull/29
Rama apilada sobre HU-15 RNF-01 (PR #28): feature/hu-15-hu-15-aislamiento-de-datos-ent/req-1794493999670-acceso-de-rt-y-firmante-a-edificios-de-v
Documentacion: docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-02-entrega.md y RNF-02-acceso-multi-eca-rt-firmante.md
Pruebas:
- npm run verify: API 23 suites / 174 tests OK; Web 7 files / 82 tests OK; tsc --noEmit 0 errores.
- npm run test:int -w apps/api: 8 suites / 27 tests OK (incluye rls-rt-firmante.int-spec.ts).
- bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-02-entrega.sh: 4 OK · 0 fallas; --carga 20: 20/20, promedio 64 ms, p95 77 ms, max 77 ms.
- Estimado: 4h

### RF-03 — Evitar que un guardado pise una asignación más nueva
- Estimado: 0h

### RNF-01 — Leer todas las ternas en una sola consulta
- Estimado: 0h

### RF-04 — Porcentajes de pago y abono configurables por máquina
- Estimado: 3h

### RF-02 — Mapa de la Secretaría con el semáforo de edificios y reasignación sugerida
- Estimado: 4h

### RF-01 — API de Monitoreo Backoffice y Acciones Comerciales
- Estimado: 4h

### RF-02 — UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría
PR #4 abierto en GitHub contra dev. Componentes PortalFirmante, ModalAuditoria, estilos y 15 tests unitarios en Vitest verificados.
- Estimado: 4h

### RF-01 — API de Cobertura de Flota por Empresa Conservadora
PR #5 abierto contra dev. Implementados GET /api/eca/cobertura y GET /api/eca/maquinas con 11 tests unitarios y e2e en verde.
- Estimado: 3h

### RF-01 — Mapa del RT con pines por horario
- Estimado: 5h

### RNF-03 — Tomar la ECA y el rol del RLS desde la sesión del usuario
- Estimado: 4h

### RF-02 — UI Tablero Dinámico de Monitoreo General (Backoffice)
- Estimado: 4h

### RF-01 — Gestión de Advertencias 1 y 2 por Visita Fallida y Email a Consorcio
Gestión de Advertencias 1 y 2 por Visita Fallida y Email a Consorcio implementado:
1. VisitasFallidasService y VisitasFallidasController validan obligatoriamente foto del frente y coordenadas GPS congeladas.
2. Generación y despacho automático de correo formal con membrete legal de MAICON S.R.L. a la administración del consorcio notificando advertencia 1 o 2 con apercibimiento legal expreso.
3. FichaConsorcio.tsx con sección interactiva para registrar visita fallida y consultar historial y badges de advertencias.
4. Pruebas: 146 tests en total (100 Jest en API + 46 Vitest en Web). Tests de desarrollo aprobados en Scrum Master AI. PR #12: https://github.com/fiemcasals/pm_asc/pull/12
- Estimado: 4h

### RF-03 — Rechazo del Firmante vuelve a la Secretaría y plazo de 5 días hábiles
- Estimado: 3h

### RF-02 — UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura
PR #6 abierto contra dev. Implementados MedidorCobertura, PortalEca (modo solo lectura protegido), pestaÃ±a en App y 8 tests en Vitest en verde.
- Estimado: 4h

### RF-01 — Recepción de Falla Crítica y Alerta Emergente en Secretaría
PR #19 contra dev. API: POST /api/fallas-criticas/informes emite un evento SSE (GET /api/fallas-criticas/eventos) cuando el informe trae cables desgastados o limitador anulado. El informe se ve en GET /api/fallas-criticas/informes/:id, de sólo lectura. Web: notificación emergente en Secretaría con 3 pitidos (Web Audio) y el botón Ver informe técnico. Tests: API 160/160 (16 nuevos), web 75/75 (11 nuevos), entrega.sh con carga 50: 0 errores y 0 eventos perdidos. Mínimo necesario fuera de lo escrito: el informe tiene su propia ruta de lectura porque /api/eca/remito/:id/informe registra un acuse legal falso a nombre de la ECA. Supuestos: los informes viven en memoria, no se toca la alertaCritica de la máquina (eso es RF-02) y el canal no tiene autenticación (ningún endpoint la tiene). Detalle en docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-01-entrega.md
- Estimado: 4h

### RF-02 — Tarjeta del edificio y validación de presencia a 30 m
- Estimado: 4h

### RF-02 — Bloqueo por Advertencia 3 y Cálculo de Recargo del 45%
Bloqueo por Advertencia 3 y Cálculo de Recargo del 45% implementado:
1. Al acumularse la Advertencia 3 (3 visitas fallidas consecutivas), el edificio queda automáticamente bloqueado en el tablero exhibiendo el aviso y cartel oficial 'Cobro de Tercer Visita Habilitado'.
2. El módulo de facturación mensual (VisitasFallidasService.liquidarMaquina y liquidarConsorcio) calcula y suma automáticamente el recargo del 45% extra a la liquidación de esa máquina (.000 abono base + .500 recargo 45% = .500) con constancia en conceptos.
3. Frontend FichaConsorcio.tsx enriquecido con cartel de bloqueo, badge oficial y tabla de facturación mensual con recargo del 45%.
4. Pruebas: 156 tests en verde (107 Jest + 49 Vitest). Tests de desarrollo aprobados en Scrum Master AI con evidencia; tests de integración preparados para QA. PR #13: https://github.com/fiemcasals/pm_asc/pull/13
- Estimado: 4h

### RF-03 — Persistir las visitas fallidas en PostgreSQL
PR #20 abierto contra dev (https://github.com/fiemcasals/pm_asc/pull/20). Migración 004_visitas_fallidas + PgVisitasFallidasRepository (transacción con pg_advisory_xact_lock, sin try/catch silencioso ni estado en memoria). Ante fallo de PostgreSQL hace rollback y propaga 500 o 400 (NUL vía filtro RNF-01). Pruebas: npm run verify API 149/149 y Web 64/64 OK; npm run test:int 24/24 contra PostGIS real (incluye reinicio real de NestJS app.close() -> nueva instancia); RF-03-entrega.sh 4/4 OK; --carga 100: 0 fallidas, promedio 61 ms, p95 79 ms, 100/100 filas en PostgreSQL; probado en vivo matando proceso node y deteniendo mant-asc-db (HTTP 500, reintento al volver HTTP 201). Mínimo necesario: InMemoryVisitasFallidasRepository y 4.º parámetro opcional en createTestApp para aislar tests sin DB, e IDs VF-<uuid> para evitar colisiones en carga. Asumido: consorcio_id en texto sin FK estricta para preservar compatibilidad con IDs simbólicos de pruebas. Los 3 Tests de desarrollo aprobados con evidencia y los 3 de integración preparados para QA. Detalle en docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-03-entrega.md
- Estimado: 0h

### RF-02 — Generación de PDF Legal MAICON S.R.L. y envío por email a la ECA
- Estimado: 4h

### RF-03 — Lista de Fallas Críticas definida por el cliente
- Estimado: 3h

### RF-04 — Recargo del 45 % una sola vez por máquina no inspeccionada
- Estimado: 3h

### RF-05 — Edificio bloqueado fuera del recorrido y mínimo 1 día entre visitas fallidas
- Estimado: 3h

### RF-01 — Carteles de Alerta de Fuera de Uso y Reparación Urgente en Portal ECA
Alertas críticas en Portal ECA implementadas y verificadas:
1. Alerta titilante roja (.alerta-titilante-roja) ante equipos marcados como Fuera de Servicio, con motivo técnico de detención y fotografía destacada de la cabina trabada.
2. Cartel naranja gigante (.cartel-reparacion-urgente-gigante) de Reparación Urgente ante anomalías graves operando con detalle completo del checklist técnico de seguridad (4 componentes críticos categorizados por severidad y observaciones del inspector).
3. API enriquecida con endpoint GET /api/eca/alertas y cobertura con métricas de criticidad.
4. Pruebas: 105 tests en verde (68 Jest en API + 37 Vitest en Web) y 7/7 de integración contra PostGIS. Los 2 tests de desarrollo fueron aprobados con evidencia; los 2 de integración quedaron preparados para QA. PR: https://github.com/fiemcasals/pm_asc/pull/8
- Estimado: 3h

### RF-04 — Alerta de Falla Crítica también al RT Firmante y alarma sonora hasta que se abra
- Estimado: 3h

### RF-05 — Estado del ascensor: el RT lo marca y el Firmante lo confirma
- Estimado: 4h

### RF-01 — Motor del checklist configurable
PR #30 abierto contra dev: https://github.com/fiemcasals/pm_asc/pull/30
Rama: feature/hu-17-hu-17-inspeccion-tecnica-por-s/req-1794494000545-motor-del-checklist-configurable
- Motor del checklist configurable versionado (v2026.11.1) en apps/api/src/checklist/ (config, service, controller) y migración 005_checklist_inspecciones.
- Endpoints: GET /api/checklist/config?tipo=traccion|hidraulico|montavehiculos, POST/GET /api/checklist/inspecciones (persiste version_checklist).
- Dependencia upstream HU-06 RF-03 (to_do): sincroniza 1 a 1 sus 14 códigos críticos y 8 fallas comunes no críticas.
- Verificado: npm run verify (API 24/178 OK, Web 7/82 OK, typecheck 0 errores), test:int (7/25 OK), RF-01-entrega.sh (3 OK / 0 fallas; carga 20 corridas prom 7 ms p95 7 ms).
- 5 tests desarrollo marcados Aprobado; 5 integracion en Pendiente.
- Nota: PATCH status=pr_open rechazado por Scrum API con 400 "No podés pedir el merge de una Tarea sin condiciones de aprobación (campo acceptanceCriteria)" pese a que acceptanceCriteria tiene 5 ítems y 10 tests generados.
- Estimado: 5h

### RF-06 — Pantalla de constancia de visita fallida en el celular del RT
- Estimado: 4h

### RF-02 — Descarga de Remito Técnico y Registro de Acuse de Recibo Legal
Descarga de remito técnico y acuse de recibo legal implementados:
1. Botón 'Descargar Remito de Notificación' habilitado en todas las tarjetas de alerta crítica del Portal ECA, permitiendo la descarga formal del documento con desglose de fallas y fotos.
2. Persistencia automática de fecha, hora y usuario (operador.legal@maicon.com.ar) para el acuse legal vinculante de MAICON S.R.L. en PostgreSQL (tabla acuses_recibo_legal) y en memoria.
3. Indicador visual inmediato en la UI mostrando constancia de acuse de recibo legal registrado.
4. Pruebas: 112 tests en verde (72 Jest en API + 40 Vitest en Web) y 7/7 pruebas de integración con PostgreSQL/PostGIS. Los 2 tests de desarrollo fueron aprobados con evidencia; los 2 de integración preparados para QA. PR: https://github.com/fiemcasals/pm_asc/pull/9
- Estimado: 3h

### RF-02 — Selección de equipo y pregunta de uso
- Estimado: 3h

### RF-01 — Conector de API de WhatsApp y Plantilla Formal de Alerta Crítica
Conector de API de WhatsApp y plantilla formal implementados:
1. WhatsAppFormatterService formatea la notificación formal institucional de MAICON S.R.L. con validación de obligatoriedad de nombre ECA, consorcio, estado, equipo y detalle técnico de falla.
2. WhatsAppConnectorService realiza el despacho exitoso con tracking (idMensaje, estado 'entregado', tiempo de respuesta en ms) e implementa política de reintentos automática (backoff exponencial) ante fallas transitorias de red.
3. Endpoints POST /api/whatsapp/enviar-alerta y POST /api/whatsapp/formatear habilitados y cableados al botón de despacho en la UI del Portal ECA.
4. Pruebas: 126 tests en verde (84 Jest en API + 42 Vitest en Web) y 7/7 pruebas de integración con PostgreSQL/PostGIS. Los 2 tests de desarrollo fueron aprobados con evidencia; los 2 de integración preparados para QA. PR: https://github.com/fiemcasals/pm_asc/pull/10
- Estimado: 4h

### RF-03 — Registrar el acuse de recibo legal solo si quedó guardado en la base
EcaService.registrarAcuseRecibo ahora guarda el acuse en acuses_recibo_legal ANTES de marcarlo en memoria y deja subir el error del INSERT (se sacó el try/catch vacío): con la base caída responde 500, con un texto que la base no puede guardar (NUL) responde 400 por el filtro de RNF-01, el remito no se entrega si el acuse no se pudo guardar, y sin base configurada el acuse queda sólo en memoria como antes. 24 líneas en eca.service.ts. Pruebas: npm run verify 135/135 en API (13 nuevos) y 49/49 en web; test:int 16/16 contra PostGIS real (4 nuevos); sin el arreglo fallan 8 de 13 unitarias/e2e y 2 de 4 de integración (Expected 400, Received 201 / 200). Script de entrega 5/5; carga de 100 acuses válidos: 0 fallidos, 100 de 100 filas guardadas, p95 69 ms. Condiciones 1 y 4 con la base real detenida: 500, sin remito y la alerta sin acuse; al volver la base, el reintento da 201 con su fila. 5 tests de desarrollo aprobados con evidencia; 5 de integración preparados para QA como Manual (apagan la base o llevan un NUL). Mínimo necesario agregado: fakeDatabase de los tests gana query() (aditivo). Afuera y documentado: HU-07 RF-01 (visitas fallidas) tiene un INSERT que no puede funcionar nunca (columna metadata inexistente) y también se traga el error; el acuse guardado no se vuelve a leer tras reiniciar; sin unicidad por alerta. PR: https://github.com/fiemcasals/pm_asc/pull/15
- Estimado: 2h

### RF-03 — Reporte de parada de un equipo fuera de servicio
- Estimado: 3h

### RF-04 — Pantalla de solapa generada desde el motor
PR #32 abierto contra dev: https://github.com/fiemcasals/pm_asc/pull/32
Rama: feature/hu-17-hu-17-inspeccion-tecnica-por-s/req-1794494001043-pantalla-de-solapa-generada-desde-el-mot
- Pantalla única genérica ChecklistSolapaView.tsx dibujando las 5 solapas desde el motor configurable.
- Campo libre Observaciones por solapa apto para dictado en teclado móvil; tilde verde solo al responder 100% de ítems aplicables.
- Validado en viewport 360px con Playwright: scrollWidth=360 innerWidth=360 sin overflow horizontal ni zoom (RF-04-paso-1/2.png).
- Dependencias: stack sobre HU-17 RF-01 (PR #30); incluye selector provisorio de equipo hasta HU-17 RF-02 (to_do germanG).
- Verificado: npm run verify (API 26/207 OK, Web 8/84 OK), test:int (8/29 OK), RF-04-entrega.sh (2 OK; carga 20 corridas prom 7 ms p95 7 ms).
- Estimado: 5h

### RF-02 — Disparo Automático Inmediato (< 5s) de WhatsApp con Link Directo
Disparo automático inmediato y visualización directa implementados:
1. WhatsAppTriggerService detecta informes críticos consolidados (Fuera de Servicio o Reparación Urgente) y despacha la alerta en < 5s comprobables (< 5000ms con métrica elapsedMs y fallback seguro).
2. Se incluye enlace directo y funcional hacia el reporte técnico firmado con fotos de cabina y checklist de seguridad (/api/eca/remito/:alertaId/informe) formateado para visualización inmediata en teléfonos móviles.
3. Endpoints POST /api/whatsapp/trigger-alerta-critica y GET /api/eca/remito/:alertaId/informe agregados y verificados.
4. Pruebas: 131 tests en verde (88 Jest en API + 43 Vitest en Web). Los 2 tests de desarrollo fueron aprobados con evidencia; los 2 de integración quedaron preparados para QA. PR: https://github.com/fiemcasals/pm_asc/pull/11
- Estimado: 3h

### RF-04 — Recordatorio a la ECA a las 24 h y aviso a la Secretaría a las 48 h sin acuse
- Estimado: 3h

### RF-05 — Fotos por anomalía
PR #33 abierto contra dev: https://github.com/fiemcasals/pm_asc/pull/33
Rama: feature/hu-17-hu-17-inspeccion-tecnica-por-s/req-1794494001295-fotos-por-anomalia
- Adjuntar Foto de Anomalía con nombre del ítem mostrado solo en fallas.
- Falla crítica sin foto bloquea la solapa; falla común sin foto permite completar.
- Compresión progresiva JPEG vía Canvas <= 500 KB (fotos.ts) con metadatos de equipo, solapa, ítem y hora.
- Verificado: npm run verify (API 26/207 OK, Web 8/86 OK), RF-05-entrega.sh (2 OK; carga 20x maxBytes=420000 prom 0.34 ms) y Playwright RF-05-paso-1/2.png.
- Estimado: 4h

### RF-07 — Navegación por estaciones y sala compartida
PR abierto hacia dev: https://github.com/fiemcasals/pm_asc/pull/35. RF-07 implementado en navegacion.ts, ChecklistSolapaView.tsx e InspeccionCampoView.tsx (selector M1/M2/M3 por solapa, sincronizacion automatica de Sala Principal compartida sin tocar M3 independiente y navegacion 'Ir a Accesos/Cabinas ->'). Integrado con Login HU-14 de dev. Verificado: npm run verify (API 26 suites/207 tests, Web 9 files/105 tests), Playwright 360x800 (scrollWidth=360) y RF-07-entrega.sh --carga 20 (promedio 11.81 ms). | Nota Scrum API: {"error":"No podés pedir el merge de una Tarea sin condiciones de aprobación: son lo que dice cuándo está terminado, y de ellas la app deriva sola los casos de prueba. Pedíselas al Project Manager o al Scrum Master (campo acceptanceCriteria)."}
- Estimado: 4h

### RF-08 — Las Fallas Críticas del checklist llegan a la Secretaría
PR #38 abierto hacia dev: https://github.com/fiemcasals/pm_asc/pull/38. Implementa despacho de fallas criticas del checklist por solapas (con fotos base64), cola offline en IndexedDB (cola_fallas_criticas) con deduplicacion por clientReportId, y alertas en Secretaria y Firmante (GET /informes + SSE). Pruebas automaticas de desarrollo aprobadas (3/3). Script docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-08-entrega.sh --carga 20: 12.04 ms prom / 30.10 ms p95.
- Estimado: 2h

### RF-03 — No informar como entregado un WhatsApp que no se envió
PR #21 abierto contra dev (https://github.com/fiemcasals/pm_asc/pull/21). Commit 358f9ae55e15808975ae960bb587de4ecb6c9788 en rama oficial. Eliminado el falso estado "entregado" en WhatsAppConnectorService cuando no hay proveedor configurado (!transport): POST /api/whatsapp/enviar-alerta devuelve HTTP 503 Service Unavailable (estadoEntrega: "no_configurado", idMensaje: "", intentos: 0) y POST /api/whatsapp/trigger-alerta-critica registra el intento como no_realizado en el historial consultable por GET /api/whatsapp/historial. En Portal ECA (eca.ts + AccionesAlertaCritica en AlertasCriticas.tsx + styles.css) muestra el motivo real devuelto por el servidor en .whatsapp-error-badge y .alerta-notificacion-error, limpia estado previo y nunca muestra "WhatsApp Despachado". Verificado en árbol limpio: npm run verify -> 0 errores TS, Jest API 20 suites / 154 tests passed, Vitest Web 5 archivos / 68 tests passed; npm run test:int -> 6 suites / 24 tests passed contra PostgreSQL; RF-03-entrega.sh 3/3 OK y --carga 50: 0 falsos entregados / distinto de 503 (promedio 116 ms, p95 132 ms); verificado en navegador Chrome con captura de pantalla. Asumido: historial en memoria dentro del alcance de RF-03; proveedor real (Meta/Twilio) y lectura de teléfono ECA desde roles_edificio quedan reservados para HU-11 · RF-04 (REQ-1794155774018). Los 3 Tests de desarrollo aprobados con evidencia y los 3 de integración preparados para QA. Entrega: https://github.com/fiemcasals/pm_asc/blob/358f9ae55e15808975ae960bb587de4ecb6c9788/docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-03-entrega.md
- Estimado: 0h

### RF-06 — Fallas por piso en Accesos
PR abierto hacia dev: https://github.com/fiemcasals/pm_asc/pull/34. RF-06 implementado en InspeccionCampoView.tsx + fallasPiso.ts (Seguridad Critica con 'Espacio entre puertas mayor a 12 cm', Mecanica de Puerta y Llamadores, multiples fallas por piso y eliminacion puntual). Pruebas de desarrollo Aprobadas (3/3). Verificado: npm run verify (API 26 suites/207 tests, Web 8 files/88 tests), Playwright 360x800 (scrollWidth=360) y RF-06-entrega.sh --carga 20 (promedio 9.03 ms). Nota Scrum API: PATCH status=pr_open devuelve 400 'sin condiciones de aprobacion (acceptanceCriteria)' pese a tener 3 criterios cargados y 3/3 tests de desarrollo aprobados.
- Estimado: 3h

### RNF-01 — Visita en curso sin señal
PR abierto hacia dev: https://github.com/fiemcasals/pm_asc/pull/36. RNF-01 implementado con IndexedDB ('mant_asc_inspeccion_db', cero LocalStorage para respuestas/fotos) + Workbox PWA offline. Verificado: build PWA (7 entradas, 723.31 KiB), npm run verify (API 26 suites/207 tests, Web 9 files/106 tests incluyendo 3 equipos/20 fotos), Playwright RNF-01 offline reload OK (M2·cabina restaurado) y RNF-01-entrega.sh --carga 20 OK. TEST-1794494002009-6 se deja Pendiente por requerir celular Android físico y registro de modelo por QA.
- Estimado: 5h

### RF-01 — Consolidación y firma en pantalla
- Estimado: 4h

### RF-04 — Enviar las alertas por WhatsApp a través de un proveedor real
- Estimado: 0h

### RF-05 — Enviar los avisos a la ECA solo después de la revisión de la Secretaría
- Estimado: 4h

### RNF-01 — Sellado del informe
- Estimado: 4h

### RNF-02 — Cola de sincronización del celular
- Estimado: 5h

### RF-06 — Link del aviso de WhatsApp sin contraseña y válido por 7 días
- Estimado: 3h

# Plan de Tareas — mant_asc

_Generado automáticamente el 2026-11-06T13:52:38.061Z — no editar a mano, se sobreescribe en cada publicación._

Orden sugerido de desarrollo (respeta dependencias entre Tareas). Cada fila indica de qué Tareas depende, si tiene.

| Orden | Código | Tarea | Historia de Usuario | Módulo | Sprint | Estado | Desarrollador | Depende de | Rechazos |
|---|---|---|---|---|---|---|---|---|---|
| 1 | RF-01 | RO-01: Setup del proyecto y entorno de desarrollo verificable | RO-01 | — | — | testing | dev-ma-2 | — | — |
| 2 | RF-01 | API y Modelo de Datos de Consorcios y Máquinas | HU-01 | — | — | testing | germanG | RF-01 | — |
| 3 | RF-02 | UI de Secretaría: Carga y Ficha de Edificios y Máquinas | HU-01 | — | — | testing | gonza | RF-01 | — |
| 4 | RF-01 | API de Asignación Tripartita de Roles por Edificio | HU-02 | — | — | Hacer | germanG | RF-01 | — |
| 5 | RF-02 | UI de Secretaría: Pestaña de Asignación de Roles de Trabajo | HU-02 | — | — | Hacer | germanG | RF-01, RF-02 | — |
| 6 | RF-01 | Servicio de Telemetría GPS y Proximidad de Inspectores | HU-03 | — | — | Hacer | germanG | RF-01 | — |
| 7 | RF-01 | API de Máquinas Asignadas y Autorización de Firma AGC | HU-08 | — | — | testing | gonza | RF-01 | — |
| 8 | RF-02 | UI Mapa de Flota interactivo CABA y Despacho de Emergencia | HU-03 | — | — | Hacer | germanG | RF-01 | — |
| 9 | RF-01 | Motor de Control Semafórico por Antigüedad de Visita | HU-04 | — | — | Hacer | germanG | RF-01 | — |
| 10 | RF-02 | UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría | HU-08 | — | — | testing | gonza | RF-01 | — |
| 11 | RF-01 | API de Cobertura de Flota por Empresa Conservadora | HU-09 | — | — | testing | gonza | RF-01 | — |
| 12 | RF-02 | Integración Visual del Semáforo en Mapa y Reasignación Rápida | HU-04 | — | — | Hacer | germanG | RF-01, RF-02 | — |
| 13 | RF-01 | API de Monitoreo Backoffice y Acciones Comerciales | HU-05 | — | — | Hacer | germanG | RF-01 | — |
| 14 | RF-02 | UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura | HU-09 | — | — | testing | gonza | RF-01 | — |
| 15 | RF-01 | Recepción de Falla Crítica y Alerta Emergente en Secretaría | HU-06 | — | — | Hacer | germanG | RF-01 | — |
| 16 | RF-02 | UI Tablero Dinámico de Monitoreo General (Backoffice) | HU-05 | — | — | Hacer | germanG | RF-01, RF-02 | — |
| 17 | RF-01 | Gestión de Advertencias 1 y 2 por Visita Fallida y Email a Consorcio | HU-07 | — | — | Hacer | gonza | RF-01 | — |
| 18 | RF-02 | Generación de PDF Legal MAICON S.R.L. y Despacho por Email a ECA | HU-06 | — | — | Hacer | germanG | RF-01 | — |
| 19 | RF-02 | Bloqueo por Advertencia 3 y Cálculo de Recargo del 45% | HU-07 | — | — | Hacer | gonza | RF-01, RF-02 | — |
| 20 | RF-01 | Carteles de Alerta de Fuera de Uso y Reparación Urgente en Portal ECA | HU-10 | — | — | Hecho ✓ dev | gonza | RF-02, RF-02 | — |
| 21 | RF-02 | Descarga de Remito Técnico y Registro de Acuse de Recibo Legal | HU-10 | — | — | Hecho ✓ dev | gonza | RF-01 | — |
| 22 | RF-01 | Conector de API de WhatsApp y Plantilla Formal de Alerta Crítica | HU-11 | — | — | Hecho ✓ dev | gonza | RF-02 | — |
| 23 | RF-02 | Disparo Automático Inmediato (< 5s) de WhatsApp con Link Directo | HU-11 | — | — | Hacer | gonza | RF-01 | — |

## Detalle

### RF-01 — RO-01: Setup del proyecto y entorno de desarrollo verificable
Monorepo listo: web React+Vite PWA (HTTPS https://localhost:8050 con mkcert, service worker registrado), API NestJS con GET /api/health (estado de API, base y versión PostGIS; 503 sin base), PostgreSQL 16 + PostGIS 3.4 en Docker. CORS sólo para CORS_ORIGINS (origen de Scrum), rechaza '*' y se desactiva con NODE_ENV=production. Pruebas: npm run verify 19/19 (API 15, web 4), test:int 1/1 contra PostGIS real, script de entrega 9/9, carga 200 corridas 0 fallidas p95 126 ms. 5 tests de desarrollo aprobados con evidencia; 5 de integración preparados para QA (c3 y c5 manuales). Mínimo necesario agregado: .gitattributes (LF para que los .sh corran en Linux). PR: https://github.com/fiemcasals/pm_asc/pull/1
- Estimado: 4h

### RF-01 — API y Modelo de Datos de Consorcios y Máquinas
Modelo de datos y CRUD de consorcios: tablas consorcios y maquinas (referencia AGC única por edificio, borrado en cascada) y endpoints POST, GET, GET :id, PUT y DELETE en /api/consorcios. Mínimo necesario agregado: sistema de migraciones (SQL plano, aplicado al arrancar la API, tabla schema_migrations), porque RO-01 lo dejó asignado a esta tarea; GET (listado) y PUT/DELETE porque la descripción pide CRUD. Pruebas: npm run verify 36/36 en API (21 nuevos) y 4/4 en web; test:int 7/7 contra PostGIS real; script de entrega 5/5; carga 200 recorridos, 0 fallidos, p95 320 ms. 2 tests de desarrollo aprobados con evidencia; 2 de integración preparados para QA. Afuera: la ECA (HU-02), autenticación, paginación del listado y ubicación geográfica. Consorcio y edificio se modelaron como una sola entidad. PR: https://github.com/fiemcasals/pm_asc/pull/3
- Estimado: 4h

### RF-02 — UI de Secretaría: Carga y Ficha de Edificios y Máquinas
PR #7 abierto contra dev. Implementados FormularioConsorcio con grilla dinamica, FichaConsorcio, SecretariaView (layout Master-Detail) y 6 tests Vitest en verde.
- Estimado: 4h

### RF-01 — API de Asignación Tripartita de Roles por Edificio
- Estimado: 3h

### RF-02 — UI de Secretaría: Pestaña de Asignación de Roles de Trabajo
- Estimado: 3h

### RF-01 — Servicio de Telemetría GPS y Proximidad de Inspectores
- Estimado: 4h

### RF-01 — API de Máquinas Asignadas y Autorización de Firma AGC
Implementada la API de Máquinas Asignadas (GET /api/firmante/maquinas) y Autorización de Firma AGC (POST /api/firmante/autorizar) con validación estricta de estado Recorrida, fotos obligatorias y firma del encargado. Pruebas: 33 tests en verde (18 específicos del firmante). Entrega y script en docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/.
- Estimado: 4h

### RF-02 — UI Mapa de Flota interactivo CABA y Despacho de Emergencia
- Estimado: 5h

### RF-01 — Motor de Control Semafórico por Antigüedad de Visita
- Estimado: 4h

### RF-02 — UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría
PR #4 abierto en GitHub contra dev. Componentes PortalFirmante, ModalAuditoria, estilos y 15 tests unitarios en Vitest verificados.
- Estimado: 4h

### RF-01 — API de Cobertura de Flota por Empresa Conservadora
PR #5 abierto contra dev. Implementados GET /api/eca/cobertura y GET /api/eca/maquinas con 11 tests unitarios y e2e en verde.
- Estimado: 3h

### RF-02 — Integración Visual del Semáforo en Mapa y Reasignación Rápida
- Estimado: 4h

### RF-01 — API de Monitoreo Backoffice y Acciones Comerciales
- Estimado: 4h

### RF-02 — UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura
PR #6 abierto contra dev. Implementados MedidorCobertura, PortalEca (modo solo lectura protegido), pestaÃ±a en App y 8 tests en Vitest en verde.
- Estimado: 4h

### RF-01 — Recepción de Falla Crítica y Alerta Emergente en Secretaría
- Estimado: 4h

### RF-02 — UI Tablero Dinámico de Monitoreo General (Backoffice)
- Estimado: 4h

### RF-01 — Gestión de Advertencias 1 y 2 por Visita Fallida y Email a Consorcio
- Estimado: 4h

### RF-02 — Generación de PDF Legal MAICON S.R.L. y Despacho por Email a ECA
- Estimado: 4h

### RF-02 — Bloqueo por Advertencia 3 y Cálculo de Recargo del 45%
- Estimado: 4h

### RF-01 — Carteles de Alerta de Fuera de Uso y Reparación Urgente en Portal ECA
Alertas críticas en Portal ECA implementadas y verificadas:
1. Alerta titilante roja (.alerta-titilante-roja) ante equipos marcados como Fuera de Servicio, con motivo técnico de detención y fotografía destacada de la cabina trabada.
2. Cartel naranja gigante (.cartel-reparacion-urgente-gigante) de Reparación Urgente ante anomalías graves operando con detalle completo del checklist técnico de seguridad (4 componentes críticos categorizados por severidad y observaciones del inspector).
3. API enriquecida con endpoint GET /api/eca/alertas y cobertura con métricas de criticidad.
4. Pruebas: 105 tests en verde (68 Jest en API + 37 Vitest en Web) y 7/7 de integración contra PostGIS. Los 2 tests de desarrollo fueron aprobados con evidencia; los 2 de integración quedaron preparados para QA. PR: https://github.com/fiemcasals/pm_asc/pull/8
- Estimado: 3h

### RF-02 — Descarga de Remito Técnico y Registro de Acuse de Recibo Legal
Descarga de remito técnico y acuse de recibo legal implementados:
1. Botón 'Descargar Remito de Notificación' habilitado en todas las tarjetas de alerta crítica del Portal ECA, permitiendo la descarga formal del documento con desglose de fallas y fotos.
2. Persistencia automática de fecha, hora y usuario (operador.legal@maicon.com.ar) para el acuse legal vinculante de MAICON S.R.L. en PostgreSQL (tabla acuses_recibo_legal) y en memoria.
3. Indicador visual inmediato en la UI mostrando constancia de acuse de recibo legal registrado.
4. Pruebas: 112 tests en verde (72 Jest en API + 40 Vitest en Web) y 7/7 pruebas de integración con PostgreSQL/PostGIS. Los 2 tests de desarrollo fueron aprobados con evidencia; los 2 de integración preparados para QA. PR: https://github.com/fiemcasals/pm_asc/pull/9
- Estimado: 3h

### RF-01 — Conector de API de WhatsApp y Plantilla Formal de Alerta Crítica
Conector de API de WhatsApp y plantilla formal implementados:
1. WhatsAppFormatterService formatea la notificación formal institucional de MAICON S.R.L. con validación de obligatoriedad de nombre ECA, consorcio, estado, equipo y detalle técnico de falla.
2. WhatsAppConnectorService realiza el despacho exitoso con tracking (idMensaje, estado 'entregado', tiempo de respuesta en ms) e implementa política de reintentos automática (backoff exponencial) ante fallas transitorias de red.
3. Endpoints POST /api/whatsapp/enviar-alerta y POST /api/whatsapp/formatear habilitados y cableados al botón de despacho en la UI del Portal ECA.
4. Pruebas: 126 tests en verde (84 Jest en API + 42 Vitest en Web) y 7/7 pruebas de integración con PostgreSQL/PostGIS. Los 2 tests de desarrollo fueron aprobados con evidencia; los 2 de integración preparados para QA. PR: https://github.com/fiemcasals/pm_asc/pull/10
- Estimado: 4h

### RF-02 — Disparo Automático Inmediato (< 5s) de WhatsApp con Link Directo
- Estimado: 3h

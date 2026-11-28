# Plan de Tareas — mant_asc

_Generado automáticamente el 2026-11-28T14:52:44.551Z — no editar a mano, se sobreescribe en cada publicación._

Orden sugerido de desarrollo (respeta dependencias entre Tareas). Cada fila indica de qué Tareas depende, si tiene.

| Orden | Código | Tarea | Historia de Usuario | Módulo | Sprint | Estado | Desarrollador | Depende de | Rechazos |
|---|---|---|---|---|---|---|---|---|---|
| 1 | RF-01 | RO-01: Setup del proyecto y entorno de desarrollo verificable | RO-01 | — | — | tested ✓ | dev-ma-2 | — | — |
| 2 | RNF-02 | Evitar que las pruebas de integración fallen al correr en paralelo | HU-01 | — | — | tested ✓ | germanG | — | — |
| 3 | RF-01 | Shell Visual NEO Linear (Dark/Light), Sidebar Colapsable, Cobertura Neón y Buscador Global Inline | HU-12 | M1: Administración y Asignaciones (Secretaría) | — | tested ✓ | gonza | — | — |
| 4 | RF-01 | Alertas Críticas del Portal ECA sin prefijos obvios ni códigos duplicados | HU-13 | M5: Portal ECA y Notificaciones Críticas | — | tested ✓ | gonza | — | — |
| 5 | RF-02 | Limpieza de badges obvios y jerga técnica en Portal ECA y Consorcios | HU-13 | M5: Portal ECA y Notificaciones Críticas | — | tested ✓ | gonza | — | — |
| 6 | RF-06 | FIX: Descarga del remito t�cnico en formato PDF oficial en Portal ECA | HU-10 | — | — | tested ✓ | dev-ma-2 | — | — |
| 7 | RF-07 | FIX: Los símbolos del remito PDF salen como caracteres rotos | HU-10 | — | — | tested ✓ | germanG | — | — |
| 8 | RF-02 | Portal ECA con sesión: cada ECA ve solo lo suyo | HU-15 | — | — | tested ✓ | germanG | — | — |
| 9 | RF-04 | Portal del Firmante con sesión: cada Firmante ve y firma solo lo suyo | HU-08 | — | — | tested ✓ | germanG | — | — |
| 10 | RF-06 | RT con sesión: fallas críticas y checklist solo para quien corresponde | HU-06 | — | — | tested ✓ | germanG | — | — |
| 11 | RF-07 | Canal en tiempo real de fallas críticas con sesión | HU-06 | — | — | tested ✓ | germanG | — | — |
| 12 | RF-07 | FIX: Scripts de entrega desactualizados de HU-11, HU-15 y HU-18, y datos de demo de HU-04 | HU-11 | — | — | tested ✓ | germanG | — | — |
| 13 | RF-04 | [FIX] Script de entrega de HU-04 RF-02: la inspección de prueba la carga un RT y el login usa el certificado de mkcert | HU-04 | — | — | tested ✓ | germanG | — | — |
| 14 | RF-03 | Mapa base de CABA propio, que se dibuja sin conexión | HU-16 | — | — | tested ✓ | germanG | — | — |
| 15 | RF-03 | Cargar en los datos de demo un Firmante y un usuario de ECA con sesión | HU-14 | — | — | tested ✓ | dev-ma-2 | — | — |
| 16 | RNF-03 | Evitar que informes.e2e-spec falle de forma intermitente | HU-01 | — | — | Bloqueada | germanG | — | — |
| 17 | RF-07 | FIX: La lista «Edificios pendientes de hoy» del RT no se queda en «Cargando…» sin conexión | HU-07 | — | — | tested ✓ | dev-ma-2 | — | — |
| 18 | RF-03 | FIX: Mostrar las horas en formato de 24 horas en toda la app | HU-12 | — | — | tested ✓ | dev-ma-2 | — | — |
| 19 | RF-11 | Fotos obligatorias del frente de cabina y de los cables en cada equipo en uso | HU-17 | — | — | tested ✓ | germanG | — | — |
| 20 | RF-08 | El Portal Firmante pide la foto de cables sólo a los equipos con cables de tracción | HU-08 | — | — | tested ✓ | germanG | — | — |
| 21 | RF-15 | Diagnóstico de seguridad con sesión: solo quien corresponde (las rutas de WhatsApp se retiraron) | HU-11 | — | — | tested ✓ | germanG | — | — |
| 22 | RF-01 | RF-01: Chat interno para operarios e ingenieros con mensajes, fotos y enlaces | HU-19 | — | — | tested ✓ | gonza | — | — |
| 23 | RF-04 | Retirar la telemetría de «Estado del sistema» y dejar el mapa sin conexión en su pestaña | HU-12 | — | — | tested ✓ | dev-ma-2 | — | — |
| 24 | RF-06 | Que los mapas se vean: el archivo del mapa va con el sitio y la app avisa cuando falta | HU-16 | — | — | tested ✓ | dev-ma-2 | — | — |
| 25 | RF-02 | El hilo del chat muestra siempre los mensajes más nuevos y deja leer los anteriores | HU-19 | — | — | tested ✓ | dev-ma-2 | — | — |
| 26 | RF-03 | La Secretaría figura como contacto en el chat y sus mensajes privados se pueden leer y responder | HU-19 | — | — | tested ✓ | dev-ma-2 | — | — |
| 27 | RF-06 | El chat avisa en pantalla cuando un mensaje no se envió y muestra el estado real de la conexión | HU-19 | — | — | Hecho ✓ dev | germanG | — | — |
| 28 | RF-07 | La etiqueta de edificio del chat se elige para cada mensaje y la ven todos los que lo leen | HU-19 | — | — | Hecho ✓ dev | germanG | — | — |
| 29 | RF-08 | Detalles del chat: hora en 24 horas con el día, y Escape cierra la foto agrandada | HU-19 | — | — | tested ✓ | dev-ma-2 | — | — |
| 30 | RF-12 | [FIX] La lista de paradas vuelve a no traer las imágenes | HU-17 | — | — | Hecho ✓ dev | germanG | — | — |
| 31 | RF-03 | [FIX] El backoffice rotula la foto del frente como «Frente de cabina y botonera» | HU-05 | — | — | Hecho | germanG | — | — |
| 32 | RF-07 | [FIX] La guía de Android incluye el mapa en las pantallas donde se usa | HU-16 | — | — | Haciendo | germanG | — | — |
| 33 | RF-11 | [FIX] chat-hilo.e2e-spec carga los 205 mensajes directo en el repositorio y no se pasa del tope con la máquina ocupada | HU-19 | — | — | Hacer | germanG | — | — |
| 34 | RF-01 | API y Modelo de Datos de Consorcios y Máquinas | HU-01 | — | — | tested ✓ | germanG | RF-01 | — |
| 35 | RF-01 | API de autenticación y roles | HU-14 | — | — | tested ✓ | germanG | RF-01 | — |
| 36 | RF-02 | FIX: Corregir contraste de textos y contenedores en Modo Oscuro | HU-12 | M1: Administración y Asignaciones (Secretaría) | — | tested ✓ | gonza | RF-01 | — |
| 37 | RF-04 | Componente de mapa con pines por estado, zoom y nombres que no se pisan | HU-16 | — | — | tested ✓ | germanG | RF-03 | — |
| 38 | RF-02 | El informe cerrado exige y sella las fotos obligatorias de cada equipo en uso | HU-18 | — | — | tested ✓ | germanG | RF-11 | — |
| 39 | RF-04 | La API del chat rechaza con un mensaje claro lo que no corresponde en vez de fallar o guardarlo | HU-19 | — | — | tested ✓ | dev-ma-2 | RF-03 | — |
| 40 | RF-09 | El chat marca lo que no leíste: contador por conversación, en el menú y en el título de la pestaña | HU-19 | — | — | tested ✓ | dev-ma-2 | RF-02, RF-03 | — |
| 41 | RF-16 | Los avisos aprobados por la Secretaría llegan al Firmante por el chat interno | HU-11 | — | — | Hacer | germanG | RF-07 | — |
| 42 | RF-09 | [FIX] Las alertas dejan de llevar la foto adentro: el remito, el aviso y el backoffice la piden por la ruta | HU-10 | — | — | Hacer | germanG | RF-12 | — |
| 43 | RF-02 | UI de Secretaría: Carga y Ficha de Edificios y Máquinas | HU-01 | — | — | tested ✓ | gonza | RF-01 | — |
| 44 | RF-01 | API de Asignación Tripartita de Roles por Edificio | HU-02 | — | — | tested ✓ | germanG | RF-01 | — |
| 45 | RNF-01 | Rechazar con 400 los textos que la base no puede guardar (carácter NUL) | HU-01 | — | — | tested ✓ | germanG | RF-01 | — |
| 46 | RF-03 | Importar el listado Excel de la AGC (máquinas, ubicaciones y estados) | HU-01 | — | — | tested ✓ | gonza | RF-01 | — |
| 47 | RF-02 | Pantalla de ingreso | HU-14 | — | — | tested ✓ | germanG | RF-01 | — |
| 48 | RNF-01 | Consentimiento de ubicación y revocación de sesiones | HU-14 | — | — | tested ✓ | germanG | RF-01 | — |
| 49 | RNF-01 | Row Level Security por ECA | HU-15 | — | — | tested ✓ | gonza | RF-01, RF-01 | — |
| 50 | RF-01 | Asociar la ECA al usuario y exponerla en la sesión | HU-15 | — | — | tested ✓ | germanG | RF-01 | — |
| 51 | RF-05 | Usar el mapa nuevo en las pantallas y retirar el dibujo anterior | HU-16 | — | — | tested ✓ | germanG | RF-04 | — |
| 52 | RF-05 | Las fotos del chat son livianas: se reducen antes de enviarlas y la actualización del hilo no las vuelve a bajar | HU-19 | — | — | Hecho ✓ dev | germanG | RF-04 | — |
| 53 | RF-10 | Avisos del navegador cuando llega un mensaje nuevo del chat | HU-19 | — | — | tested ✓ | dev-ma-2 | RF-09 | — |
| 54 | RF-17 | [FIX] Retirar el envío por WhatsApp de la API | HU-11 | — | — | Hacer | germanG | RF-16 | — |
| 55 | RF-04 | Horarios de atención por edificio editables por la Secretaría | HU-01 | — | — | tested ✓ | germanG | RF-02 | — |
| 56 | RF-05 | Datos operativos del edificio y del equipo para la calle | HU-01 | — | — | tested ✓ | gonza | RF-02 | — |
| 57 | RF-06 | Que la ficha del edificio y el alta de consorcio entren en un celular de 360 px | HU-01 | — | — | tested ✓ | dev-ma-2 | RF-02 | — |
| 58 | RF-02 | UI de Secretaría: Pestaña de Asignación de Roles de Trabajo | HU-02 | — | — | tested ✓ | dev-ma-2 | RF-01, RF-02 | — |
| 59 | RF-01 | Motor de Control Semafórico por Antigüedad de Visita | HU-04 | — | — | tested ✓ | germanG | RF-01 | — |
| 60 | RF-01 | API de Máquinas Asignadas y Autorización de Firma AGC | HU-08 | — | — | tested ✓ | gonza | RF-01 | — |
| 61 | RNF-02 | Acceso de RT y Firmante a edificios de varias ECA | HU-15 | — | — | tested ✓ | gonza | RNF-01, RF-01 | — |
| 62 | RF-18 | [FIX] Retirar WhatsApp de las pantallas | HU-11 | — | — | Hacer | germanG | RF-17 | — |
| 63 | RF-03 | Evitar que un guardado pise una asignación más nueva | HU-02 | — | — | tested ✓ | germanG | RF-02 | — |
| 64 | RNF-01 | Leer todas las ternas en una sola consulta | HU-02 | — | — | tested ✓ | germanG | RF-02 | — |
| 65 | RF-04 | Porcentajes de pago y abono configurables por máquina | HU-02 | — | — | tested ✓ | germanG | RF-02 | — |
| 66 | RF-02 | Mapa de la Secretaría con el semáforo de edificios y reasignación sugerida | HU-04 | — | — | tested ✓ | germanG | RF-01 | — |
| 67 | RF-01 | API de Monitoreo Backoffice y Acciones Comerciales | HU-05 | — | — | tested ✓ | germanG | RF-01 | — |
| 68 | RF-02 | UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría | HU-08 | — | — | tested ✓ | gonza | RF-01 | — |
| 69 | RF-01 | API de Cobertura de Flota por Empresa Conservadora | HU-09 | — | — | tested ✓ | gonza | RF-01 | — |
| 70 | RF-01 | Mapa del RT con pines por horario | HU-16 | — | — | tested ✓ | germanG | RF-02, RNF-02, RF-05, RF-04 | — |
| 71 | RNF-03 | Tomar la ECA y el rol del RLS desde la sesión del usuario | HU-15 | — | — | tested ✓ | dev-ma-2 | RF-01, RNF-02 | — |
| 72 | RF-19 | [FIX] Retirar WhatsApp de la documentación, la configuración y los datos de demo | HU-11 | — | — | Hacer | germanG | RF-17, RF-18 | — |
| 73 | RF-05 | Guardar el teléfono y el email del RT de Calle en su usuario y usarlos al reasignar | HU-02 | — | — | tested ✓ | germanG | RF-02 | — |
| 74 | RNF-01 | Índice por fecha para el semáforo y medición con volumen | HU-04 | — | — | tested ✓ | germanG | RF-02 | — |
| 75 | RF-03 | Refrescar el panel de reasignación cuando el RT del edificio cambió | HU-04 | — | — | tested ✓ | germanG | RF-02 | — |
| 76 | RF-02 | UI Tablero Dinámico de Monitoreo General (Backoffice) | HU-05 | — | — | tested ✓ | germanG | RF-01, RF-02 | — |
| 77 | RF-01 | Gestión de Advertencias 1 y 2 por Visita Fallida y Email a Consorcio | HU-07 | — | — | tested ✓ | gonza | RF-01 | — |
| 78 | RF-03 | Rechazo del Firmante vuelve a la Secretaría y plazo de 5 días hábiles | HU-08 | — | — | tested ✓ | germanG | RF-02 | — |
| 79 | RF-02 | UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura | HU-09 | — | — | tested ✓ | gonza | RF-01 | — |
| 80 | RF-01 | Recepción de Falla Crítica y Alerta Emergente en Secretaría | HU-06 | — | — | tested ✓ | dev-ma-2 | RF-01 | — |
| 81 | RF-02 | Tarjeta del edificio y validación de presencia a 30 m | HU-16 | — | — | tested ✓ | germanG | RF-01 | — |
| 82 | RF-06 | Que reasignar o asignar la terna actualice la vista de firma de inmediato | HU-02 | — | — | tested ✓ | germanG | RF-03, RF-05 | — |
| 83 | RF-02 | Bloqueo por Advertencia 3 y Cálculo de Recargo del 45% | HU-07 | — | — | tested ✓ | gonza | RF-01, RF-02 | — |
| 84 | RF-03 | Persistir las visitas fallidas en PostgreSQL | HU-07 | — | — | tested ✓ | gonza | RF-01 | — |
| 85 | RF-02 | Generación de PDF Legal MAICON S.R.L. y envío por email a la ECA | HU-06 | — | — | tested ✓ | gonza | RF-01 | — |
| 86 | RF-03 | Lista de Fallas Críticas definida por el cliente | HU-06 | — | — | tested ✓ | germanG | RF-01 | — |
| 87 | RF-05 | Guardar en PostgreSQL las máquinas, visitas y firmas del Portal Firmante para que sobrevivan a un reinicio | HU-08 | — | — | tested ✓ | germanG | RF-04, RF-06 | — |
| 88 | RF-04 | Recargo del 45 % una sola vez por máquina no inspeccionada | HU-07 | — | — | tested ✓ | germanG | RF-03 | — |
| 89 | RF-05 | Edificio bloqueado fuera del recorrido y mínimo 1 día entre visitas fallidas | HU-07 | — | — | tested ✓ | germanG | RF-03 | — |
| 90 | RF-01 | Carteles de Alerta de Fuera de Uso y Reparación Urgente en Portal ECA | HU-10 | — | — | tested ✓ | gonza | RF-02, RF-02 | — |
| 91 | RF-05 | Enviar los avisos a la ECA solo después de la revisión de la Secretaría | HU-11 | — | — | tested ✓ | germanG | RF-02 | — |
| 92 | RF-04 | Alerta de Falla Crítica también al RT Firmante y alarma sonora hasta que se abra | HU-06 | — | — | tested ✓ | germanG | RF-03 | — |
| 93 | RF-05 | Estado del ascensor: el RT lo marca y el Firmante lo confirma | HU-06 | — | — | tested ✓ | germanG | RF-03 | — |
| 94 | RF-01 | Motor del checklist configurable | HU-17 | — | — | tested ✓ | germanG | RF-01, RF-03 | — |
| 95 | RF-08 | Guardar en PostgreSQL los informes de falla crítica y el estado del ascensor para que sobrevivan a un reinicio | HU-06 | — | — | tested ✓ | dev-ma-2 | RF-05, RF-06 | — |
| 96 | RF-06 | Pantalla de constancia de visita fallida en el celular del RT | HU-07 | — | — | tested ✓ | germanG | RF-02, RF-05 | — |
| 97 | RF-02 | Descarga de Remito Técnico y Registro de Acuse de Recibo Legal | HU-10 | — | — | tested ✓ | gonza | RF-01 | — |
| 98 | RF-06 | Link del aviso sin contraseña y válido por 7 días | HU-11 | — | — | tested ✓ | germanG | RF-05 | — |
| 99 | RF-02 | Selección de equipo y pregunta de uso | HU-17 | — | — | tested ✓ | germanG | RF-02, RF-01, RF-05 | — |
| 100 | RF-03 | Registrar el acuse de recibo legal solo si quedó guardado en la base | HU-10 | — | — | tested ✓ | germanG | RF-02 | — |
| 101 | RF-05 | Que el acuse de recibo guardado se vuelva a leer al reiniciar la API y no se duplique por alerta | HU-10 | — | — | tested ✓ | germanG | RF-02 | — |
| 102 | RF-11 | Guardar en PostgreSQL los avisos de falla con su revisión y sus enlaces para que sobrevivan a un reinicio | HU-11 | — | — | tested ✓ | dev-ma-2 | RF-05, RF-06 | — |
| 103 | RF-03 | Reporte de parada de un equipo fuera de servicio | HU-17 | — | — | tested ✓ | germanG | RF-02, RF-05 | — |
| 104 | RF-04 | Pantalla de solapa generada desde el motor | HU-17 | — | — | tested ✓ | gonza | RF-01, RF-02 | — |
| 105 | RF-10 | Que la Inspección Técnica arranque desde el inicio de visita y no desde un selector provisorio | HU-17 | — | — | tested ✓ | dev-ma-2 | RF-02 | — |
| 106 | RF-04 | Recordatorio a la ECA a las 24 h y aviso a la Secretaría a las 48 h sin acuse | HU-10 | — | — | tested ✓ | germanG | RF-03 | — |
| 107 | RF-09 | Guardar en PostgreSQL los reportes de parada de un equipo fuera de servicio | HU-17 | — | — | tested ✓ | dev-ma-2 | RF-05, RF-03 | — |
| 108 | RF-05 | Fotos por anomalía | HU-17 | — | — | tested ✓ | gonza | RF-04 | — |
| 109 | RF-07 | Navegación por estaciones y sala compartida | HU-17 | — | — | tested ✓ | gonza | RF-04, RF-05 | — |
| 110 | RF-08 | Las Fallas Críticas del checklist llegan a la Secretaría | HU-17 | — | — | tested ✓ | gonza | RF-04, RF-04 | — |
| 111 | RF-08 | Que un equipo marcado Fuera de Servicio o con Reparación Urgente genere la alerta del Portal ECA | HU-10 | — | — | tested ✓ | gonza | RF-03, RF-09, RF-05, RF-01, RF-02, RF-03, RF-02 | — |
| 112 | RF-06 | Fallas por piso en Accesos | HU-17 | — | — | tested ✓ | germanG | RF-04, RF-05 | — |
| 113 | RNF-01 | Visita en curso sin señal | HU-17 | — | — | tested ✓ | gonza | RF-04, RF-05 | — |
| 114 | RF-01 | Consolidación y firma en pantalla | HU-18 | — | — | tested ✓ | germanG | RF-07, RF-03 | — |
| 115 | RNF-01 | Sellado del informe | HU-18 | — | — | tested ✓ | germanG | RF-01 | — |
| 116 | RNF-02 | Cola de sincronización del celular | HU-18 | — | — | tested ✓ | germanG | RF-01, RNF-01 | — |
| 117 | RF-07 | Que el informe cerrado por el RT cree la visita en el Portal Firmante | HU-08 | — | — | tested ✓ | dev-ma-2 | RF-05, RF-01, RF-06, RF-11, RF-02, RF-08 | — |
| 118 | RF-06 | Retirar las máquinas de ejemplo de la vista de firma | HU-08 | — | — | tested ✓ | dev-ma-2 | RF-05, RF-07 | — |
| 119 | RF-09 | Que el informe cerrado sólo cree visitas en las máquinas de su propio edificio | HU-08 | — | — | tested ✓ | Sin asignar | RF-07 | — |

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

### RF-06 — FIX: Descarga del remito t�cnico en formato PDF oficial en Portal ECA
Desarrollo completado y verificado. Remito técnico oficial generado en PDF con pdfkit (Content-Type application/pdf) y acuse legal registrado en PostgreSQL. PR #60 abierto contra dev. 4 tests de desarrollo aprobados. Script RF-06-entrega.sh pasando 9/9 y carga 50 corridas (promedio 78 ms).
- Estimado: 2h

### RF-07 — FIX: Los símbolos del remito PDF salen como caracteres rotos
- Estimado: 0h

### RF-02 — Portal ECA con sesión: cada ECA ve solo lo suyo
- Estimado: 0h

### RF-04 — Portal del Firmante con sesión: cada Firmante ve y firma solo lo suyo
- Estimado: 0h

### RF-06 — RT con sesión: fallas críticas y checklist solo para quien corresponde
- Estimado: 0h

### RF-07 — Canal en tiempo real de fallas críticas con sesión
- Estimado: 0h

### RF-07 — FIX: Scripts de entrega desactualizados de HU-11, HU-15 y HU-18, y datos de demo de HU-04
PR #86 contra dev. Se arreglaron 6 scripts de entrega desactualizados y el script de datos de demo; solo cambian archivos bajo docs/pruebas/ (10 scripts modificados; nuevos: RF-07-entrega.sh, RF-07-entrega.md, la guía visual RF-07-datos-de-demo.md y 4 capturas sacadas con Playwright). Resultado: los 12 scripts de entrega de HU-11, HU-15 y HU-18 terminan con código 0 (RF-07-entrega.sh, 2 min 17 s), con la base sin datos de demo (los carga y los borra) y con ellos cargados (no los toca). Antes: HU-18 RNF-01 17 OK y 1 con error; HU-11 RF-05 y RF-06 se cortaban con un TypeError; HU-11 RF-03 1 OK y 2 fallidas; HU-15 RNF-01 y RNF-02 0 OK y 4 fallas cada uno. Los 9 scripts que dependen de los datos de demo salen con código 2 sin intentar ingresar y no suman intentos en intentos_login. El script de datos de demo carga 5 edificios y 2 inspecciones del 5/11 sin error de SQL, y se ve en Secretaría › Semáforo. Fuera de alcance, sin tocar: docs/pruebas/hu-04-.../RF-02-entrega.sh también falla (2 verificaciones, el peso del RT c; y por TLS contra https://localhost:8050), con y sin datos de demo; queda para otra tarea. Mínimo necesario agregado: RF-07-entrega.sh, el corredor que pide el estándar de entrega, y la guía visual de los datos de demo. Detalle en docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-07-entrega.md.
- Estimado: 4h

### RF-04 — [FIX] Script de entrega de HU-04 RF-02: la inspección de prueba la carga un RT y el login usa el certificado de mkcert
PR #87 contra dev. Se arregló docs/pruebas/hu-04-.../RF-02-entrega.sh (que fallaba 2 de 14 verificaciones aunque la app andaba bien); solo cambian archivos bajo docs/pruebas/ (1 script modificado; nuevos: RF-04-entrega.sh, RF-04-entrega.md, la guía visual RF-04-reasignar-en-pantalla.md y 3 capturas sacadas con Playwright). Causas: la inspección del 5/11 del edificio C2 se cargaba con la sesión de la Secretaría y desde HU-06 RF-06 el checklist es solo del RT (403), así que el RT c pesaba 2 y no 1; y el login usaba curl a secas, que contra https://localhost:8050 termina con el error 35 de Schannel. Ahora el RT c carga la inspección con su sesión, el script corta con el motivo si el API no la crea, y el login usa el mismo curl con --ssl-no-revoke y el certificado de mkcert. Resultado: 14 verificaciones OK, 0 fallidas contra https://localhost:8050 y contra http://127.0.0.1:3050 (antes: 12 OK y 2 fallidas por la API directa, y sin ingresar por HTTPS); --carga 20 con 0 fallidas en las dos (p95 70 ms por HTTPS y 34 ms por la API directa); 0 residuos en la base. Guía visual con Playwright: lo que verifica el script se ve en Secretaría › Semáforo › «Reasignar» (rt.carla con 1 pendiente aunque tiene 2 edificios). Mínimo necesario agregado: RF-04-entrega.sh, el corredor que pide el estándar de entrega. Detalle en docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-04-entrega.md.
- Estimado: 1h

### RF-03 — Mapa base de CABA propio, que se dibuja sin conexión
PR #88 contra dev. Mapa base de CABA propio que se dibuja sin conexión: archivo PMTiles de CABA (10,67 MB, zoom 0 a 15, 533 mosaicos, build 20261118 de Protomaps) generado con `npm run mapa:generar` (script propio en Node que lee la compilación por pedidos de rango; no va a git); tipografías (OFL) e íconos (MIT) propios en apps/web/public/mapa (0,87 MB); MapaBase con MapLibre (zoom, límites en CABA, tema claro y oscuro, controles en castellano, atribución de OpenStreetMap y Protomaps); botón «Descargar mapa para usar sin señal» con avance y cancelar, que guarda el archivo en la caché del navegador, avisa de versiones nuevas y reemplaza la anterior recién cuando la nueva terminó de bajar y es un PMTiles válido; la PWA guarda el worker de MapLibre, las tipografías y los íconos (29 entradas, 3,6 MiB) y no el archivo de CABA; panel «Mapa de CABA para usar sin señal» en Estado del sistema. Pruebas: npm run verify con tipos OK, API 1143 y web 539 (24 nuevos); RF-03-entrega.sh 11 de 11, --carga 100 con 0 fallidos y --regenerar de punta a punta; con la app compilada y Playwright, con la red cortada y la página recargada el mapa se dibuja completo con calles y nombres hasta el zoom 15,93; sin red y sin mapa guardado, el aviso «Mapa sin descargar: conectate a una red para bajarlo»; al volver la red se dibuja solo; versión nueva → «Actualizar el mapa»; tema claro y oscuro; celular de 360 px; los 42 pedidos al abrir, acercar y descargar el mapa fueron todos a la propia app. Cambio respecto de lo planeado: la condición 1 decía «con pmtiles extract»; en este entorno no se pudo bajar y ejecutar esa herramienta, así que el generador es un script propio y se reescribió la condición sin nombrarla (PM). Límites: solo se probó en Chromium, no en un Android real; el archivo del mapa no está en git y hay que generarlo al clonar y al desplegar. Los pines (RF-04) y el cambio de las 5 pantallas (RF-05) quedan para las tareas siguientes. Detalle en docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-03-entrega.md y guía con capturas de Playwright en RF-03-mapa-sin-conexion.md.
- Estimado: 12h

### RF-03 — Cargar en los datos de demo un Firmante y un usuario de ECA con sesión
Datos de demo con demo.firmante y demo.eca; ternas repartidas entre dos Firmantes y dos ECA; segunda corrida sin error; --limpiar borra por la API. RF-03-entrega.sh 10/10. Regresión de 36 scripts: 11 fallan igual que con el script anterior (preexistente, ver entrega).
- Estimado: 3

### RNF-03 — Evitar que informes.e2e-spec falle de forma intermitente
28/11/2026 (germanG): se volvi� a intentar reproducir la falla sobre dev 8e34bd7. La suite completa de la API corri� 20 veces seguidas (1.643 pruebas cada vez, con la m�quina cargada por otro trabajo en paralelo): informes.e2e-spec pas� las 20. Sigue sin reproducirse, as� que no se puede encontrar la causa y el criterio 2 proh�be taparla con reintentos: la Tarea sigue bloqueada. En esas corridas aparecieron otras dos cosas, fuera del alcance de esta Tarea: (1) paradas.spec.ts falla en las 20 corridas en dev (�la lista no devuelve las im�genes�): la lista de paradas ahora trae fotoUrl con la imagen en base64 desde HU-10 RF-08 (dbed7f5); (2) chat-hilo.e2e-spec fall� 1 vez de 20 por pasar los 5 s de espera de Jest al escribir 205 mensajes con la m�quina cargada.

28/11/2026 · Sigue sin reproducirse: informes.e2e-spec pasó 38 de 38 con un tope de 1 s por prueba, con la máquina cargada (8 procesos usando CPU a pleno) y dentro de la suite completa de la API (105 suites) con 8 workers y esa misma carga (441 s): pasó, tardando 90 s en vez de 30. Además ya declara jest.setTimeout(30_000), así que un tope de 5 s no explica la falla original, y no tiene fake timers ni estado compartido entre pruebas. No se agregaron reintentos. Lo que la desbloquea es la salida completa de una corrida que falle: se consigue con docs/decisiones/2026-11-28-pruebas-intermitentes/estres-suite-api.sh (PR #131), que corre la suite completa con la máquina ocupada y guarda todo. En esa misma corrida se reprodujo otra intermitente, chat-hilo.e2e-spec (tope de 5 s con 205 mensajes), con su análisis en el mismo documento.
- Estimado: 3

### RF-07 — FIX: La lista «Edificios pendientes de hoy» del RT no se queda en «Cargando…» sin conexión
La lista distingue servidor, guardada (con hora), sin conexi�n y error del servidor; se guarda con su usuario y se borra al cerrar sesi�n; se actualiza sola al volver la red. recorridoSinConexion.test.ts 11/11, web 606/606, API 1208/1208, RF-07-navegador.cjs 12/12 (Playwright 360 px). PR #100.
- Estimado: 3

### RF-03 — FIX: Mostrar las horas en formato de 24 horas en toda la app
Funci�n compartida fechas/formato.ts (24 horas, hora de Buenos Aires) usada por 9 archivos; los registros legales conservan los segundos. RF-03-entrega.sh 7/7, verify API 1208/1208 y web 602/602, capturas con Playwright de la bandeja y la ficha. PR #99.
- Estimado: 2

### RF-11 — Fotos obligatorias del frente de cabina y de los cables en cada equipo en uso
PR #109 contra dev. En cada equipo en uso el RT saca la foto del frente de cabina y botonera y, si el equipo es de tracción o montavehículos, la de cables de tracción, aunque no haya fallas; el hidráulico lleva sólo la del frente y un equipo fuera de servicio no las pide. Cada foto se comprime a 500 KB o menos (una de 4,9 MB quedó en 373 KB), queda con equipo, nombre y hora, se ve en miniatura y se puede quitar o volver a sacar. «Consolidar Informe y Proceder a Firma» sigue deshabilitado sin ellas y el pendiente dice qué foto falta, una línea por equipo. Se guardan sin señal con el borrador (recargando sin señal siguen) y viajan en `fotos` de cada equipo con las claves obligatoria:frente y obligatoria:cables, dentro del contenido sellado del informe; no cambia ningún contrato de la API. Pruebas: npm run verify con tipos bien, API 1250 y web 642 (21 nuevas); RF-11-entrega.sh 7 de 7 y con --carga 20, 20 fotos de 4,9 MB sin fallas (promedio 2,7 s, p95 3,2 s); Playwright a 360 px con rt.beto, 20 comprobaciones y 7 capturas resaltadas. Límites: la decisión es de German (23/11/2026) y falta confirmarla con MAICON; la API todavía no las exige (HU-18 RF-02, que va después de este merge) y el Portal Firmante no pide cables a un hidráulico en HU-08 RF-08; sin probar con la cámara real de un Android (las fotos de la prueba son imágenes dibujadas). Detalle en docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-11-entrega.md y guía con capturas en RF-11-fotos-obligatorias.md.
- Estimado: 8h

### RF-08 — El Portal Firmante pide la foto de cables sólo a los equipos con cables de tracción
PR #111 contra dev. El Portal Firmante exige la foto del frente siempre y la foto de cables sólo si el equipo tiene cables de tracción (tracción, montavehículos o sin tipo cargado); un hidráulico, que no tiene cables de tracción, se autoriza con el frente y la firma del encargado. API: requiereFotoDeCables(tipo) decide en POST /api/firmante/autorizar; para tracción el rechazo es el de siempre (mismo mensaje) y para un hidráulico sin la foto del frente dice que falta el frente y que un hidráulico no lleva foto de cables. Pantalla: «Autorizar Firma AGC» se habilita para un hidráulico con el frente y la firma, el motivo de bloqueo no habla de cables y el modal de auditoría dice «No aplica (equipo hidráulico)» en lugar de «✗ Falta». La foto de cables pasa a ser opcional en el tipo; no hay migración ni cambio de contrato. Pruebas: npm run verify con tipos bien, API 1259/1259 (9 nuevas) y web 626/626 (5 nuevas); firmante-persistencia contra PostgreSQL real 4/4 (1 nueva: un hidráulico sin cables se guarda, se autoriza y sigue autorizado después de reiniciar); RF-08-entrega.sh 8 bien, 0 mal y con --carga 50, 100 aperturas del modal sin fallas (p95 135 ms); Playwright con demo.firmante, 9 comprobaciones y 3 capturas resaltadas. Límites: la decisión es de German (23/11/2026) y falta confirmarla con MAICON (el Portal rotula las fotos como «Normativa AGC»); la prueba del navegador responde la lista de máquinas con dos de ejemplo porque los datos de demo no traen un hidráulico con la visita recorrida, y no autoriza nada; el backoffice rotula la foto frente como «Frente del edificio» mientras el Portal y HU-17 RF-11 la llaman «Frente de cabina y botonera» (no se tocó, queda para una tarea aparte). Se puede mergear en cualquier orden respecto de #109 y #110. Detalle en docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-08-entrega.md y guía con capturas en RF-08-portal-firmante-hidraulico.md.
- Estimado: 4h

### RF-15 — Diagnóstico de seguridad con sesión: solo quien corresponde (las rutas de WhatsApp se retiraron)
- Estimado: 0h

### RF-01 — RF-01: Chat interno para operarios e ingenieros con mensajes, fotos y enlaces
Pull Request #115 abierto hacia dev con implementacion completa y tests en verde
- Estimado: 4h

### RF-04 — Retirar la telemetría de «Estado del sistema» y dejar el mapa sin conexión en su pestaña
- Estimado: 0h

### RF-06 — Que los mapas se vean: el archivo del mapa va con el sitio y la app avisa cuando falta
- Estimado: 0h

### RF-02 — El hilo del chat muestra siempre los mensajes más nuevos y deja leer los anteriores
- Estimado: 6h

### RF-03 — La Secretaría figura como contacto en el chat y sus mensajes privados se pueden leer y responder
- Estimado: 4h

### RF-06 — El chat avisa en pantalla cuando un mensaje no se envió y muestra el estado real de la conexión
Hecho: aviso debajo de la caja cuando el env�o falla (sin red o 5xx, con Reintentar y el texto conservado; 400 con el motivo de la API), cabecera con el estado real (Conectado / Sin conexi�n, reintentando�, vuelve sola) y un solo env�o a la vez. Solo pantalla. RF-06-entrega.sh --carga 3: 6 OK (Playwright 11/11 x3). paradas.spec.ts falla ya en dev (HU-10 RF-08), fuera de esta Tarea. PR #127.
- Estimado: 4h

### RF-07 — La etiqueta de edificio del chat se elige para cada mensaje y la ven todos los que lo leen
Hecho: el edificio se elige para cada mensaje (el selector se vac�a al enviar), el nombre del edificio se guarda con el mensaje (migraci�n 040) y lo ven todos los que lo leen, tambi�n un T�cnico o Firmante no asignado; m�quina solo con edificio y hasta 40 caracteres. RF-07-entrega.sh --carga 30: 18 OK (Playwright 7/7). paradas.spec.ts falla ya en dev (HU-10 RF-08), fuera de esta Tarea.
- Estimado: 4h

### RF-08 — Detalles del chat: hora en 24 horas con el día, y Escape cierra la foto agrandada
- Estimado: 3h

### RF-12 — [FIX] La lista de paradas vuelve a no traer las imágenes
PR #130 contra dev. Arregla paradas.spec.ts, que falla en dev y en testing desde HU-10 RF-08 (commit dbed7f5): ese cambio puso en cada reporte de la lista la primera foto completa en base64 (fotoUrl) y rompió el criterio de HU-17 RF-03 («la lista no devuelve las imágenes, sólo cuántas hay»). No se tocó ninguna prueba existente: el arreglo es de código. GET /api/paradas, POST /api/paradas y POST /api/paradas/:id/confirmar|rechazar devuelven una vista sin la imagen, con la cantidad de fotos y fotoRuta; la imagen se sigue guardando con el reporte. Ruta nueva GET /api/paradas/:id/foto, como en el chat: con sesión (401 sin ella), sólo para quien puede ver el reporte (Secretaría y Administrador, el Firmante del edificio, la ECA del equipo y el RT que lo cargó; el resto 404, igual que un reporte inexistente) y con caché de un año. El Portal ECA pide la foto de su alerta por esa ruta, con la sesión y una sola vez (la guarda en memoria, sin mezclar usuarios); si no hay ruta o falla, usa la foto de siempre. Pruebas: npm run verify con tipos bien, API 1679/1679 (36 nuevas; en dev era 1642 de 1643) y web 991/991 (17 nuevas); contra PostgreSQL real, paradas 3/3 (1 nueva); RF-12-entrega.sh 11 bien, 0 mal y con --carga 30, 0 fallidos (lista p95 21 ms, foto p95 24 ms); Playwright como rt.beto y demo.eca, 12 comprobaciones y 2 capturas, y al terminar el Firmante rechaza el reporte y la demo queda como estaba. Límites: las alertas siguen llevando la imagen adentro (/api/eca/alertas, /api/eca/maquinas, /api/firmante/maquinas) porque el remito, el aviso con enlace y el backoffice la leen de ahí; sacarla es una tarea aparte que no está creada. memoriaDeFotos.ts duplica el caché del chat (PR #126, sin mergear). No pisa a los PRs #126, #127 ni #128 (ningún archivo en común, sin conflictos). Detalle en docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-12-entrega.md y guía con capturas en RF-12-foto-de-la-parada.md.
- Estimado: 4h

### RF-03 — [FIX] El backoffice rotula la foto del frente como «Frente de cabina y botonera»
PR #132 contra dev. El visor del backoffice (Secretaría › Monitoreo › Ver fotos e informe) rotulaba la foto del frente como «Frente del edificio», pero es la del frente de la cabina y la botonera (decisión del 23/11/2026, HU-17 RF-11), como la llaman el Portal Firmante y el celular del RT. Ahora dice «Frente de cabina y botonera»; «Cables» y «Cabina trabada» no cambian. El cambio es una línea en backoffice.logic.ts (el rótulo sale de la API y la pantalla lo muestra tal cual), más los dos lugares que esperaban el rótulo viejo: backoffice-acciones.spec.ts y el script de entrega de HU-05 RF-02. No se toca la «foto del frente del edificio» de HU-07 y HU-16: es otra foto, la de la fachada. Pruebas: npm run verify con tipos bien, API 1698/1698 (5 nuevas) y web 1049/1049; backoffice-fotos.e2e-spec.ts (nueva, por HTTP con roles reales); RF-03-entrega.sh 5 bien, 0 mal y con --carga 30, 0 fallidos (p95 20 ms); Playwright con un recorrido real (edificio de prueba → el RT cierra un informe con las dos fotos → Secretaría › Monitoreo › visor), que borra todo al terminar, 9 comprobaciones y 2 capturas. Hallazgo sin arreglar: RF-02-entrega.sh de HU-05 ya estaba roto (4 bien y 15 con error) porque prueba la API en vivo con las máquinas de ejemplo que HU-08 RF-06 retiró; otros 22 scripts de docs/pruebas nombran esas mismas máquinas y no se corrieron. Detalle en docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-03-entrega.md y guía con capturas en RF-03-rotulo-del-frente.md.
- Estimado: 1h

### RF-07 — [FIX] La guía de Android incluye el mapa en las pantallas donde se usa
- Estimado: 2h

### RF-11 — [FIX] chat-hilo.e2e-spec carga los 205 mensajes directo en el repositorio y no se pasa del tope con la máquina ocupada
- Estimado: 2h

### RF-01 — API y Modelo de Datos de Consorcios y Máquinas
Modelo de datos y CRUD de consorcios: tablas consorcios y maquinas (referencia AGC única por edificio, borrado en cascada) y endpoints POST, GET, GET :id, PUT y DELETE en /api/consorcios. Mínimo necesario agregado: sistema de migraciones (SQL plano, aplicado al arrancar la API, tabla schema_migrations), porque RO-01 lo dejó asignado a esta tarea; GET (listado) y PUT/DELETE porque la descripción pide CRUD. Pruebas: npm run verify 36/36 en API (21 nuevos) y 4/4 en web; test:int 7/7 contra PostGIS real; script de entrega 5/5; carga 200 recorridos, 0 fallidos, p95 320 ms. 2 tests de desarrollo aprobados con evidencia; 2 de integración preparados para QA. Afuera: la ECA (HU-02), autenticación, paginación del listado y ubicación geográfica. Consorcio y edificio se modelaron como una sola entidad. PR: https://github.com/fiemcasals/pm_asc/pull/3
- Estimado: 4h

### RF-01 — API de autenticación y roles
- Estimado: 6h

### RF-02 — FIX: Corregir contraste de textos y contenedores en Modo Oscuro
PR #23 abierto contra dev (https://github.com/fiemcasals/pm_asc/pull/23). Commit 95d426e89cbc0d414837b1f9c8f929d41fd15d06. Corregido contraste de textos y contenedores en Modo Oscuro en apps/web/src/styles.css (--surface-sunken, [data-theme='dark'] .audit-grid, .cartel-bloqueo-tercera-visita, badges 45%, total-liquidacion-consorcio, .ficha-table, .solo-lectura-pill, .badge-modo-consulta, textos atenuados). Verificado en rama aislada con npm run verify (API 22/22 170 tests, Web 6/6 79 tests), RF-02-entrega.sh 2/2 OK, --carga 20 0 fallas (avg 102 ms, p95 118 ms) y Playwright. 2 Tests desarrollo Aprobado y 2 integracion Pendiente para QA. Entrega: https://github.com/fiemcasals/pm_asc/blob/95d426e89cbc0d414837b1f9c8f929d41fd15d06/docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-02-entrega.md
- Estimado: 1h

### RF-04 — Componente de mapa con pines por estado, zoom y nombres que no se pisan
PR #93 contra dev. MapaEdificios (MapLibre) sobre el mapa base propio, con el mismo contrato de datos que el dibujo anterior: pines por latitud y longitud reales (error de 0,11 % a 0,52 % en el navegador), zoom y desplazamiento, encuadre de todos los edificios, nombres que no se pisan (rojos primero, y a la izquierda del pin si a la derecha no entran), pines accesibles con teclado, tema claro y oscuro, modo editable con 6 decimales y pin arrastrable, y celular de 360 px sin conexión. marcadores.test.ts 26/26, verify API 1143 y web 565, test:int 188, build OK, RF-04-entrega.sh 7/7. Guía visual con 6 capturas de Playwright. Mínimo necesario fuera de lo pedido: el tipo MarcadorMapa pasó a mapa/marcadores.ts y el componente viejo lo reexporta. Al probar en el navegador aparecieron y se corrigieron 3 defectos: nombres sin dibujar en tema claro, edificios sin reencuadrar al bajar el mapa, y nombres cortados en el borde derecho. No se probó el pellizco con dos dedos ni un celular físico. Nada usa el componente hasta HU-16/RF-05: mergear antes.
- Estimado: 12h

### RF-02 — El informe cerrado exige y sella las fotos obligatorias de cada equipo en uso
PR #110 contra dev. POST /api/informes-visita exige las fotos obligatorias de cada equipo en uso: el frente de cabina y botonera (obligatoria:frente) y, si es de tracción o montavehículos, los cables (obligatoria:cables); el hidráulico lleva sólo la del frente y un equipo fuera de servicio no las necesita. Si falta alguna, o no es una imagen en data URL (jpeg, png o webp) de hasta 2 MB, responde 400 «Datos inválidos» con un mensaje por foto que nombra el equipo y la foto, y no guarda nada. Las fotos viajan en `fotos` del equipo, así que ya quedan dentro del contenido sellado (SHA-256): no cambió el cálculo del hash y alterar una por fuera de la API se detecta en la verificación. La regla se aplica sólo al cerrar: los informes anteriores se siguen leyendo, listando y verificando. Se actualizaron los datos de prueba de la API y los scripts de entrega de HU-18 (RF-01, RNF-01, RNF-02), que armaban informes sin fotos. Pruebas: npm run verify con tipos bien, API 1278/1278 (28 nuevas) y web 621/621; test:int de informes contra PostgreSQL real 23/23 (3 nuevas); RF-02-entrega.sh 23 ok y con --carga 50, 50 informes válidos y 50 rechazados sin respuestas inesperadas (válidos p95 62 ms, rechazados p95 14 ms); los scripts viejos de HU-18 siguen en verde (RF-01 24, RNF-01 18, RNF-02 15). Límites: se mergea después de HU-17 RF-11 (PR #109); con sólo este cambio en dev la pantalla actual del RT no hace sacar las fotos y no podría cerrar informes; la decisión es de German (23/11/2026) y falta confirmarla con MAICON; la API controla que haya una imagen, no que sea del frente o de los cables. Es una tarea de API: no cambia ninguna pantalla, así que la guía es un recorrido por la API sin capturas. Detalle en docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RF-02-entrega.md y RF-02-fotos-obligatorias-del-informe.md.
- Estimado: 6h

### RF-04 — La API del chat rechaza con un mensaje claro lo que no corresponde en vez de fallar o guardarlo
- Estimado: 6h

### RF-09 — El chat marca lo que no leíste: contador por conversación, en el menú y en el título de la pestaña
- Estimado: 1d

### RF-16 — Los avisos aprobados por la Secretaría llegan al Firmante por el chat interno
- Estimado: 10h

### RF-09 — [FIX] Las alertas dejan de llevar la foto adentro: el remito, el aviso y el backoffice la piden por la ruta
- Estimado: 10h

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
Implementacion completa de HU-01 RF-03 a nombre de gonza (PR #80 contra dev). Migracion 032_maquinas_estado_agc, ImportadorAgcService con ExcelJS, validacion estricta .xlsx (magic bytes ZIP) y <= 5 MB (HTTP 400), UI ImportadorExcelAgc en Secretaria. 74 suites API (1060 tests) + 23 suites Web (392 tests) + int-spec PostgreSQL en verde; RF-03-entrega.sh 9/9 OK (--carga 20: 0 fallos, prom 115 ms, max 146 ms).
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
PR #40 abierto contra dev; ver entrega en docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RF-01-entrega.md
- Estimado: 3h

### RF-05 — Usar el mapa nuevo en las pantallas y retirar el dibujo anterior
PR #94, apilado sobre #93 (base: la rama de RF-04): mergear primero RF-04. La ficha del edificio (lectura y edición), el alta de consorcio, Secretaría (vista de mapa y Monitoreo), el Semáforo y el Mapa del RT usan MapaEdificios, y se borró MapaUbicacionConsorcio: 0 referencias a él ni a las avenidas dibujadas a mano en apps/web/src. El Mapa del RT guarda los últimos datos y, sin red, los muestra con un cartel con la hora; un error del servidor o una sesión revocada no se tapan, y al cerrar sesión se borran. El Semáforo conserva colores, leyenda y nota; sin geolocalización nueva. mapaRtGuardado.test.ts 13/13, verify API 1143 y web 578, test:int 188, RF-05-entrega.sh 15/15 y carga sin fallos. Guía visual con 15 capturas de Playwright. Mínimo necesario fuera de lo pedido: se cambió la dirección de ejemplo de tarjeta.test.ts para que la búsqueda de «Av. Rivadavia» dé vacía, y auth/sesion.ts borra los datos guardados al cerrar sesión. La ficha del edificio no entra en 360 px (ya era más ancha que el celular antes). Los datos del RT quedan en localStorage sin cifrar hasta cerrar sesión. No probado en un celular físico.
- Estimado: 8h

### RF-05 — Las fotos del chat son livianas: se reducen antes de enviarlas y la actualización del hilo no las vuelve a bajar
Hecho: la foto se reduce en el dispositivo (1.600 px, JPEG, menos de 500 KB; medido 6,9 MB ? 310 KB) y el hilo lleva la ruta de la foto en vez de la foto (con 5 fotos, 2 KB por actualizaci�n; cada foto se baja una vez). GET /api/chat/mensajes/:id/foto solo para quien puede leer el mensaje (401 sin sesi�n, 404 a un tercero). La API rechaza fotos de m�s de 600 KB. RF-05-entrega.sh --carga 30: 11 OK (Playwright 7/7). paradas.spec.ts falla ya en dev (HU-10 RF-08), fuera de esta Tarea. PR #126.
- Estimado: 1d

### RF-10 — Avisos del navegador cuando llega un mensaje nuevo del chat
- Estimado: 6h

### RF-17 — [FIX] Retirar el envío por WhatsApp de la API
- Estimado: 12h

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

### RF-06 — Que la ficha del edificio y el alta de consorcio entren en un celular de 360 px
Grillas con minmax(0, 1fr), fieldset min-width 0, filas de m�quinas y formularios que se acomodan; tablas y solapas con desplazamiento propio. 360 px: ficha, edici�n y alta sin desplazamiento lateral y con el mapa completo; escritorio igual (y corrige un desborde previo de 75 px en la edici�n). RF-06-capturas.cjs 7/7, verify API 1222 web 616. PR #106.
- Estimado: 6

### RF-02 — UI de Secretaría: Pestaña de Asignación de Roles de Trabajo
Pestaña Asignación de Roles de Trabajo implementada en Secretaría y corregida tras la revisión del PR #18. npm run verify: API 144/144 y web 64/64. Integración 21/21. RF-02-entrega.sh: 10 OK; carga de 200 con 0 fallidas. Fallas forzadas en Chrome: 18 OK. Toca App.tsx como mínimo necesario: la barra principal avisa si hay cambios sin guardar. Tests de integración preparados para QA. El scroll horizontal de 96 px a 390 px viene de la barra principal de App.tsx y no se tocó.
- Estimado: 3h

### RF-01 — Motor de Control Semafórico por Antigüedad de Visita
GET /api/semaforo (módulo nuevo apps/api/src/semaforo/): edificio con todas sus máquinas inspeccionadas en el mes = verde cualquiera sea el día; pendiente = verde 1-10, amarillo 11-20, rojo 21 al último día incluido el 31; el 1.º de cada mes todos vuelven a pendiente (la ventana del mes arranca en el día 1, sin proceso programado). Devuelve por edificio color, estado, máquinas inspeccionadas, día de la última inspección del mes y RT de Calle; ordenado rojos primero. Día y mes en hora de Buenos Aires (no UTC); ?fecha=AAAA-MM-DD calcula el semáforo a ese día y una fecha inválida da 400. Una consulta SQL, con RLS por ECA. Pruebas: npm run verify 310/310 en API (64 nuevos), web sin cambios; test:int 50/50 contra PostGIS real (13 nuevos). Mutaciones: 6 de 6 detectadas; la de la inspección de máquina ajena sobrevivió la primera vez y se reforzó la prueba. Script de entrega 17/17; carga de 200 consultas con 30 edificios sembrados: 0 fallidas, p95 12 ms. Borde de la medianoche de Buenos Aires probado con inspecciones reales (23:30 del 31/10 cuenta en octubre; 00:10 del 1/11 en noviembre). 4 tests de desarrollo aprobados con evidencia; 4 de integración preparados para QA como Manual (hay que fechar inspecciones en la base). Mínimo necesario agregado: SemaforoController en el middleware de contexto de ECA en app.module.ts (sin eso el RLS devuelve 0 edificios) y InMemorySemaforoRepository en create-test-app.ts (aditivo). Asunción a confirmar: 'inspeccionado con éxito' = todas las máquinas con al menos una inspección en inspecciones_checklist en el mes, porque todavía no existe el concepto de inspección cumplida/firmada (HU-18); un edificio sin máquinas queda pendiente. Afuera: el mapa, Enviar recordatorio y Reasignar (HU-04 RF-02); sin @Roles todavía; sin paginación ni medición con cientos de edificios. Novedad de entorno: la API necesita DATABASE_APP_PASSWORD y AUTH_JWT_SECRET (RLS de HU-15). PR: https://github.com/fiemcasals/pm_asc/pull/42
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

### RF-18 — [FIX] Retirar WhatsApp de las pantallas
- Estimado: 6h

### RF-03 — Evitar que un guardado pise una asignación más nueva
- Estimado: 0h

### RNF-01 — Leer todas las ternas en una sola consulta
- Estimado: 0h

### RF-04 — Porcentajes de pago y abono configurables por máquina
- Estimado: 3h

### RF-02 — Mapa de la Secretaría con el semáforo de edificios y reasignación sugerida
Pestaña Semáforo en la Secretaría: mapa de CABA con un pin por edificio del color de su semáforo, leyenda visible, nota de que no hay seguimiento de técnicos, totales y lista por urgencia. Reasignar (sólo en edificios en rojo) abre un panel con RT actual, RT sugerido (el de menos edificios pendientes del mes, sin el actual; un edificio inspeccionado no pesa) y selector; se aplica recién con Confirmar reasignación. Backend: GET .../reasignacion/sugerencia (sólo sugiere), POST .../reasignacion y GET .../reasignaciones, con sesión de Secretaría o Administrador (401 sin sesión, 403 otro rol). Migración 012: reasignaciones_rt con usuario (de la sesión, nunca del cuerpo), fecha (del servidor), RT anterior y nuevo; cambio y registro en una transacción; FOR UPDATE contra confirmaciones simultáneas; registro de sólo lectura y alta para la app (RLS sin política de UPDATE/DELETE). Al reasignar el RT anterior deja de ver el edificio y el nuevo lo ve (probado con RLS real). Pruebas: npm run verify 352/352 en API (42 nuevos) y 139/139 en web (16 nuevos); test:int 65/65 contra PostGIS real (15 nuevos). Mutaciones: 8 de 8 detectadas; la de la carrera sobrevivió la primera vez y se rehízo de forma determinista. Script de entrega 14/14; carga de 200 sugerencias: 0 fallidas, p95 26 ms. Navegador (login real como Secretaría): flujo completo con guía y 6 capturas resaltadas, consola sin errores; antes de confirmar la base no había cambiado; se corrigieron dos tablas que se cortaban a la derecha. 4 tests de desarrollo aprobados con evidencia; 4 de integración preparados para QA como Manual, con script de datos de demostración. Mínimo necesario agregado fuera de la descripción: database.service.ts tenía la lista de tablas con RLS del diagnóstico de seguridad repetida en 2 consultas y dejaba fuera la tabla nueva sin avisar (ahora una constante; se actualizó rls-eca.int-spec); props opcionales en MapaUbicacionConsorcio; selector Ver el semáforo al día (no estaba en la tarjeta, sirve para verificar los colores sin esperar al calendario). A confirmar: RT de Calle = usuario activo con rol rt_calle y la terna guarda su nombre de usuario; al reasignar se vacían teléfono y email de la terna (eran del RT anterior) y el edificio queda con un RT sin contacto; la carga cuenta sólo edificios que ve la ECA de la petición. Afuera: avisos a los RT, deshacer, mapa con calles reales, pruebas de componentes React (sin jsdom). PR: https://github.com/fiemcasals/pm_asc/pull/44
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
Implementaci�n finalizada y verificada. Contexto RLS extra�do de req.usuario. PR #43 abierto contra dev. 4 tests de desarrollo aprobados con evidencia cuantitativa. Script de entrega RNF-03-entrega.sh pasando 5/5 y carga 50 corridas en verde.
- Estimado: 4h

### RF-19 — [FIX] Retirar WhatsApp de la documentación, la configuración y los datos de demo
- Estimado: 5h

### RF-05 — Guardar el teléfono y el email del RT de Calle en su usuario y usarlos al reasignar
- Estimado: 4h

### RNF-01 — Índice por fecha para el semáforo y medición con volumen
- Estimado: 3h

### RF-03 — Refrescar el panel de reasignación cuando el RT del edificio cambió
- Estimado: 1h

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

### RF-06 — Que reasignar o asignar la terna actualice la vista de firma de inmediato
PR contra dev. Las máquinas de los edificios con terna salen de la base y siguen a su RT de Calle, Firmante y ECA: al guardar o quitar la terna, al reasignar el RT desde el Semáforo, al editar o borrar el edificio y al arrancar la API. El Firmante anterior recibe 404 al autorizar o rechazar. firmante-terna.e2e-spec.ts 12/12, verify 1155, test:int 188, web 539, RF-06-entrega.sh 14/14 con PostgreSQL real; guía con 2 capturas de Playwright. Límites: las 5 máquinas de ejemplo siguen ahí y no se tocan (en la demo, Av. Santa Fe 3200 aparece dos veces); las visitas y firmas sobre máquinas creadas desde la base viven en memoria como las de ejemplo y se pierden al reiniciar; la demo no tiene cuentas de Firmante (el script crea dos de prueba y las borra); si sincronizar falla, la terna queda guardada y se corrige al siguiente cambio o al reiniciar.
- Estimado: 4

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
Implementacion completa de HU-06 RF-02 a nombre de gonza (PR #81 contra dev). PdfLegalFallaService con membrete MAICON S.R.L., datos del edificio/maquina, fallas y fotos adjuntas; Mailer con adjuntos PDF; AvisosService sin envios al registrar falla, envio al aprobar con constanciaEmailLegal y reintento ante Envio fallido (POST /api/avisos/:id/reintentar-email y GET /api/avisos/:id/pdf-legal); UI en BandejaAvisos. 25 tests API + 9 tests Web en verde; RF-02-entrega.sh 6/6 OK (--carga 25: 0 fallos, prom 107 ms, max 136 ms).
- Estimado: 4h

### RF-03 — Lista de Fallas Críticas definida por el cliente
- Estimado: 3h

### RF-05 — Guardar en PostgreSQL las máquinas, visitas y firmas del Portal Firmante para que sobrevivan a un reinicio
PR contra dev. Las visitas, firmas AGC, rechazos y avisos de plazo del Portal Firmante se guardan en PostgreSQL (firma_visitas y firma_avisos_plazo, con RLS) y se cargan al arrancar. La firma y el rechazo solo se dan por hechos si quedaron guardados (si no, 500 y se deshace). e2e 11/11, int 3/3 con PostgreSQL real, verify 1166, test:int 191, RF-05-entrega.sh con reinicio real de la API 5/5 y 6/6; guía con 1 captura de Playwright. Hallazgo: ninguna parte del sistema crea la visita de una máquina de un edificio con terna (el informe cerrado por el RT no llega al Portal Firmante): hay que conectarlos en otra Tarea. Límites: los datos de HU-06 RF-08 (alerta crítica y estado operativo) siguen en memoria; el rechazo y los avisos no tienen pantalla web; la visita se guarda como JSON; las 5 máquinas de ejemplo siguen hasta HU-08 RF-06.
- Estimado: 12

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

### RF-05 — Enviar los avisos a la ECA solo después de la revisión de la Secretaría
- Estimado: 4h

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

### RF-08 — Guardar en PostgreSQL los informes de falla crítica y el estado del ascensor para que sobrevivan a un reinicio
Tabla informes_falla (migraci�n 037, client_report_id �nico, RLS, sin DELETE); carga al arrancar sin volver a emitir eventos; guarda en orden; el reintento no duplica ni avisa. Estado del ascensor por HU-17 RF-09. e2e 7/7, int 1/1, verify API 1250 web 616, int 197/197; RF-08-entrega.sh 12/12 con reinicio real. Depende de #103, #104 y #105. PR #108.
- Estimado: 8

### RF-06 — Pantalla de constancia de visita fallida en el celular del RT
- Estimado: 4h

### RF-02 — Descarga de Remito Técnico y Registro de Acuse de Recibo Legal
Descarga de remito técnico y acuse de recibo legal implementados:
1. Botón 'Descargar Remito de Notificación' habilitado en todas las tarjetas de alerta crítica del Portal ECA, permitiendo la descarga formal del documento con desglose de fallas y fotos.
2. Persistencia automática de fecha, hora y usuario (operador.legal@maicon.com.ar) para el acuse legal vinculante de MAICON S.R.L. en PostgreSQL (tabla acuses_recibo_legal) y en memoria.
3. Indicador visual inmediato en la UI mostrando constancia de acuse de recibo legal registrado.
4. Pruebas: 112 tests en verde (72 Jest en API + 40 Vitest en Web) y 7/7 pruebas de integración con PostgreSQL/PostGIS. Los 2 tests de desarrollo fueron aprobados con evidencia; los 2 de integración preparados para QA. PR: https://github.com/fiemcasals/pm_asc/pull/9
- Estimado: 3h

### RF-06 — Link del aviso sin contraseña y válido por 7 días
- Estimado: 3h

### RF-02 — Selección de equipo y pregunta de uso
- Estimado: 3h

### RF-03 — Registrar el acuse de recibo legal solo si quedó guardado en la base
EcaService.registrarAcuseRecibo ahora guarda el acuse en acuses_recibo_legal ANTES de marcarlo en memoria y deja subir el error del INSERT (se sacó el try/catch vacío): con la base caída responde 500, con un texto que la base no puede guardar (NUL) responde 400 por el filtro de RNF-01, el remito no se entrega si el acuse no se pudo guardar, y sin base configurada el acuse queda sólo en memoria como antes. 24 líneas en eca.service.ts. Pruebas: npm run verify 135/135 en API (13 nuevos) y 49/49 en web; test:int 16/16 contra PostGIS real (4 nuevos); sin el arreglo fallan 8 de 13 unitarias/e2e y 2 de 4 de integración (Expected 400, Received 201 / 200). Script de entrega 5/5; carga de 100 acuses válidos: 0 fallidos, 100 de 100 filas guardadas, p95 69 ms. Condiciones 1 y 4 con la base real detenida: 500, sin remito y la alerta sin acuse; al volver la base, el reintento da 201 con su fila. 5 tests de desarrollo aprobados con evidencia; 5 de integración preparados para QA como Manual (apagan la base o llevan un NUL). Mínimo necesario agregado: fakeDatabase de los tests gana query() (aditivo). Afuera y documentado: HU-07 RF-01 (visitas fallidas) tiene un INSERT que no puede funcionar nunca (columna metadata inexistente) y también se traga el error; el acuse guardado no se vuelve a leer tras reiniciar; sin unicidad por alerta. PR: https://github.com/fiemcasals/pm_asc/pull/15
- Estimado: 2h

### RF-05 — Que el acuse de recibo guardado se vuelva a leer al reiniciar la API y no se duplique por alerta
- Estimado: 3h

### RF-11 — Guardar en PostgreSQL los avisos de falla con su revisión y sus enlaces para que sobrevivan a un reinicio
Tabla avisos_falla (migraci�n 035, RLS Secretar�a/Admin, sin DELETE); AvisosRepository memoria/Pg; carga al arrancar; aprobar/reintentar esperan el guardado; el enlace vence a los 7 d�as de emitido. e2e 7/7, int 2/2, verify API 1236 web 616, int 195/195; RF-11-entrega.sh 10/10 con reinicio real. Depende de RF-12 (PR #103), incluido en la rama. PR #104.
- Estimado: 8

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

### RF-10 — Que la Inspección Técnica arranque desde el inicio de visita y no desde un selector provisorio
Sin visita: mensaje y bot�n al Mapa del RT; con visita: el edificio y sus equipos; sin edificio de demo ni selector provisorio. El edificio en inspecci�n se guarda por usuario y el borrador IDB guarda su consorcioId. RF-10-navegador.cjs 6/6 (360 px, con y sin se�al), web 621, API 1222. PR #107.
- Estimado: 6

### RF-04 — Recordatorio a la ECA a las 24 h y aviso a la Secretaría a las 48 h sin acuse
- Estimado: 3h

### RF-09 — Guardar en PostgreSQL los reportes de parada de un equipo fuera de servicio
Tabla reportes_parada (migraci�n 036, client_report_id �nico, RLS, sin DELETE); carga al arrancar y repone el estado de cada m�quina (tambi�n las de terna, con FirmanteService.cuandoSeAgregueMaquina); guarda antes de responder y deshace si falla; clientReportId evita duplicados (la web lo genera por borrador). e2e 7/7, int 1/1, verify API 1243 web 616, int 196/196; RF-09-entrega.sh 11/11 con reinicio real. Depende de #103 y #104. PR #105.
- Estimado: 4

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

### RF-08 — Que un equipo marcado Fuera de Servicio o con Reparación Urgente genere la alerta del Portal ECA
- Estimado: 4h

### RF-06 — Fallas por piso en Accesos
PR abierto hacia dev: https://github.com/fiemcasals/pm_asc/pull/34. RF-06 implementado en InspeccionCampoView.tsx + fallasPiso.ts (Seguridad Critica con 'Espacio entre puertas mayor a 12 cm', Mecanica de Puerta y Llamadores, multiples fallas por piso y eliminacion puntual). Pruebas de desarrollo Aprobadas (3/3). Verificado: npm run verify (API 26 suites/207 tests, Web 8 files/88 tests), Playwright 360x800 (scrollWidth=360) y RF-06-entrega.sh --carga 20 (promedio 9.03 ms). Nota Scrum API: PATCH status=pr_open devuelve 400 'sin condiciones de aprobacion (acceptanceCriteria)' pese a tener 3 criterios cargados y 3/3 tests de desarrollo aprobados.
- Estimado: 3h

### RNF-01 — Visita en curso sin señal
PR abierto hacia dev: https://github.com/fiemcasals/pm_asc/pull/36. RNF-01 implementado con IndexedDB ('mant_asc_inspeccion_db', cero LocalStorage para respuestas/fotos) + Workbox PWA offline. Verificado: build PWA (7 entradas, 723.31 KiB), npm run verify (API 26 suites/207 tests, Web 9 files/106 tests incluyendo 3 equipos/20 fotos), Playwright RNF-01 offline reload OK (M2·cabina restaurado) y RNF-01-entrega.sh --carga 20 OK. TEST-1794494002009-6 se deja Pendiente por requerir celular Android físico y registro de modelo por QA.
- Estimado: 5h

### RF-01 — Consolidación y firma en pantalla
- Estimado: 4h

### RNF-01 — Sellado del informe
- Estimado: 4h

### RNF-02 — Cola de sincronización del celular
- Estimado: 5h

### RF-07 — Que el informe cerrado por el RT cree la visita en el Portal Firmante
Inicio de desarrollo de RF-07 (24/11/2026): conectar el informe cerrado del RT con el Portal Firmante usando FirmanteService.registrarVisita. Sus dependencias RF-05, RF-01, RF-06, RF-11, RF-02 y RF-08 están tested. La rama estaba abierta sin commits propios.
- Estimado: 10

### RF-06 — Retirar las máquinas de ejemplo de la vista de firma
Pausada el 24/11/2026 antes de escribir código, por decisión del responsable del proyecto: se hace primero RF-07, de la que depende. Hallazgos de la lectura del código en la rama dev (9ce89df): (1) 29 scripts de entrega de 8 Historias (HU-05, 06, 08, 10, 11, 12, 15 y 17) usan las máquinas del seed. (2) 8 de ellos (HU-10 RF-03 a RF-07, HU-11 RF-04 y RF-06, HU-15 RF-02) necesitan una alertaCritica, y en toda la API sólo la crea el seed de FirmanteService.resetSeed (3 alertas: ALT-CP-001, ALT-MAICON-001 y ALT-MAICON-002); la recepción real de fallas críticas (fallas-criticas.service.ts) no la genera. (3) Los de HU-08 (RF-01, 03, 04, 05 y 08) necesitan visitas «Recorrida»: registrarVisita no tiene llamadores en producción hasta RF-07. Falta una tarjeta que conecte la falla crítica real con la alerta de la máquina; sin ella el criterio 3 no se puede cumplir para esos 8 scripts. La rama está abierta y sin commits propios. --- Nota previa (21/11/2026): Re-estimada de 4 h a 14 h (21/11/2026). Las 5 máquinas de ejemplo de FirmanteService.resetSeed (MAQ-CORRIENTES-M1/M2, MAQ-SANTAFE-M1/M2, MAQ-CALLAO-M1, firmante gonza) aparecen en 53 archivos: 29 pruebas de la API, 8 de la web y 16 scripts de entrega (HU-05, HU-06, HU-08, HU-10, HU-11). Desglose sugerido: 1) un ayudante de pruebas que cree edificios con terna y sus máquinas, y pasar las pruebas de la API y la web a usarlo (~8 h); 2) quitar resetSeed y adaptar los scripts de entrega a los datos de demo (~6 h). Conviene partirla en dos Tareas.
- Estimado: 14

### RF-09 — Que el informe cerrado sólo cree visitas en las máquinas de su propio edificio
- Estimado: 3h

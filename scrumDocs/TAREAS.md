# Tareas -- mant_asc

_Generado automaticamente el 2026-11-12T12:56:10.994Z -- no editar a mano, se sobreescribe en cada publicacion._

## HU-01: HU-01: Gestión y Alta de ECA y Máquinas

### RF-01: API y Modelo de Datos de Consorcios y Máquinas (Funcional)

Definir e implementar el modelo relacional y endpoints CRUD para Consorcios, Edificios y Máquinas con referencias AGC (M1, M2, etc.).

**Condiciones de aprobación**

1. El endpoint POST /api/consorcios permite registrar un consorcio con sus maquinas asociadas y referencias AGC.
2. La consulta GET /api/consorcios/:id devuelve la ficha completa del edificio y sus maquinas.

### RF-02: UI de Secretaría: Carga y Ficha de Edificios y Máquinas (Funcional)

Construir la interfaz de usuario en la pestaña Carga de Edificios y Máquinas, con formulario de alta, listado y vista de ficha técnica.

**Condiciones de aprobación**

1. La pestaña de administracion muestra el formulario de alta de consorcios con campos de direccion, administracion y grilla dinamica de maquinas AGC (M1, M2).
2. El listado permite seleccionar cualquier consorcio y visualizar su ficha tecnica completa y maquinas asociadas.

### RNF-01: Rechazar con 400 los textos que la base no puede guardar (carácter NUL) (No funcional)

Traducir a HTTP 400 los errores de PostgreSQL por texto con codificación inválida (carácter NUL, SQLSTATE 22021 y 22P05) en cualquier endpoint, en lugar de 500. Hallazgo de QA de HU-01 RF-01.

**Condiciones de aprobación**

1. POST /api/consorcios con un carácter NUL (\u0000) en nombre responde 400 con message "Datos inválidos" y una lista errores, y no guarda ninguna fila.
2. PUT /api/consorcios/:id con un NUL en la descripción de una máquina responde 400 y la ficha no cambia.
3. La respuesta 400 no incluye el texto del error de PostgreSQL ni trazas, y el error real queda en el log de la API.
4. Un error de base de datos de otro tipo (por ejemplo, con la base caída) sigue respondiendo 500 y no se convierte en 400.

### RNF-02: Evitar que las pruebas de integración fallen al correr en paralelo (No funcional)

npm run test:int falla de forma intermitente: en 3 de 6 corridas cayó el criterio 1 de texto-invalido.int-spec.ts (RNF-01). Ese test compara el total de filas de consorcios y maquinas mientras los otros archivos de integración escriben en las mismas tablas de la misma base, porque Jest los corre en paralelo. En serie (--runInBand) pasó 16 de 16 en 3 corridas de 3. Es un problema de la prueba, no de la app.

**Condiciones de aprobación**

1. Cinco corridas seguidas de npm run test:int terminan con todos los tests en verde
2. La corrida deja las tablas consorcios y maquinas con la misma cantidad de filas que antes de empezar

## HU-02: HU-02: Asignación de Roles Tripartitos por Edificio

### RF-01: API de Asignación Tripartita de Roles por Edificio (Funcional)

Implementar endpoints para asignar y actualizar la terna de trabajo por edificio: RT de Calle (60%), Usuario Firmante / RT Legal (25%) y ECA Responsable.

**Condiciones de aprobación**

1. El endpoint PUT /api/consorcios/:id/roles guarda y valida la terna (RT Calle, Firmante AGC, ECA) asignada al edificio.
2. Al consultar los roles asignados, el endpoint devuelve los porcentajes operativos y datos de contacto de cada responsable.

### RF-02: UI de Secretaría: Pestaña de Asignación de Roles de Trabajo (Funcional)

Desarrollar la interfaz en Pestaña 2 para que la secretaria asigne de forma ágil la terna de trabajo por cada edificio del sistema.

**Condiciones de aprobación**

1. La pestaña Asignacion de Roles de Trabajo presenta selectores para RT Calle (60%), Firmante AGC (25%) y ECA Responsable por cada edificio.
2. Al modificar un responsable y presionar Guardar, la interfaz actualiza los datos en tiempo real y muestra confirmacion de guardado.

### RF-03: Evitar que un guardado pise una asignación más nueva (Funcional)

Hoy PUT /api/consorcios/:id/roles reemplaza la terna completa sin comprobar si cambió desde que se leyó. Si dos personas editan el mismo edificio, la última pisa a la anterior y ambas ven la confirmación. Salió de la revisión del PR #18.

**Condiciones de aprobación**

1. Si la terna de un edificio cambió después de leerla, PUT /api/consorcios/:id/roles responde 409 y no modifica la terna.
2. Ante ese rechazo, la pestaña Asignación de Roles de Trabajo informa que la terna cambió y muestra la versión vigente.
3. Si la terna no cambió, guardar funciona igual que antes.

### RNF-01: Leer todas las ternas en una sola consulta (No funcional)

La pestaña Asignación de Roles de Trabajo hace un GET de roles por edificio al abrirse, cada uno con su transacción, sobre un pool de 5 conexiones con 2 s de espera. Con muchos edificios pueden fallar lecturas y la lista tarda lo que tarda la respuesta más lenta. Salió de la revisión del PR #18.

**Condiciones de aprobación**

1. La pestaña obtiene las ternas de todos los edificios con una sola llamada a la API.
2. Con 500 edificios cargados, abrir la pestaña no devuelve errores de lectura y se informa el tiempo medido.

## HU-03: HU-03: Mapa Interactivo de Flota y Rastreo GPS en CABA

### RF-01: Servicio de Telemetría GPS y Proximidad de Inspectores (Funcional)

Implementar el servicio backend de ingesta y consulta de ubicación GPS en tiempo real de los técnicos e inspectores en calle.

**Condiciones de aprobación**

1. El endpoint POST /api/inspectores/gps actualiza las coordenadas latitud/longitud y estado del inspector.
2. El endpoint GET /api/flota/cercano calcula y retorna el inspector mas cercano a un punto geografico de CABA ante emergencias.

### RF-02: UI Mapa de Flota interactivo CABA y Despacho de Emergencia (Funcional)

Desarrollar la pantalla principal con el mapa interactivo de CABA, visualizando los pines de inspectores en vivo y selector de desvío urgente.

**Condiciones de aprobación**

1. El mapa principal de CABA renderiza los pines de ubicacion en vivo de los tecnicos con sus datos de identificacion.
2. Ante un llamado de emergencia por ascensor parado con personas atrapadas, el mapa destaca al tecnico mas proximo con boton para desviarlo.

## HU-04: HU-04: Semáforo de Control Mensual y Reasignación Operativa

### RF-01: Motor de Control Semafórico por Antigüedad de Visita (Funcional)

Implementar las reglas de negocio del semáforo normativo según el día del mes: Verde (1 al 10), Amarillo (11 al 20) y Rojo (21 al 30).

**Condiciones de aprobación**

1. El servicio calcula el estado semaforico de cada edificio (Verde dias 1-10 cumplido, Amarillo dias 11-20 pendiente, Rojo dias 21-30 alerta critica).
2. El endpoint POST /api/inspecciones/recordatorio-ruteo despacha el recordatorio actualizando la ruta en la tablet del tecnico.

### RF-02: Integración Visual del Semáforo en Mapa y Reasignación Rápida (Funcional)

Integrar el filtro semafórico sobre el mapa interactivo y habilitar el flujo operativo de reasignación con un clic para edificios críticos en rojo.

**Condiciones de aprobación**

1. Los pines de edificios en el mapa reflejan el color semaforico correspondiente segun su estado del mes.
2. Para edificios con pin rojo, la secretaria cuenta con accion rapida de reasignacion a otro ingeniero con menor saturacion zonal.

## HU-05: HU-05: Tablero Dinámico de Monitoreo Backoffice

### RF-01: API de Monitoreo Backoffice y Acciones Comerciales (Funcional)

Desarrollar el endpoint de búsqueda y filtrado dinámico de inspecciones (por dirección, ECA, inspector, estado) y registro de remitos.

**Condiciones de aprobación**

1. El endpoint GET /api/backoffice/monitoreo responde con listado paginado filtrable por direccion, ECA e inspector con estado de visita.
2. El endpoint POST /api/backoffice/remito-eca registra el envio del remito digital a la empresa conservadora.

### RF-02: UI Tablero Dinámico de Monitoreo General (Backoffice) (Funcional)

Implementar la tabla interactiva debajo del mapa con filtros en tiempo real, visor de fotos/checklist y botones de acción comercial.

**Condiciones de aprobación**

1. La tabla dinamica muestra las columnas de direccion, inspector, estado de visita, fecha/hora, checklist, firmante AGC y acciones.
2. Permite abrir el visor de fotos e informe y ejecutar Enviar Remito a ECA o Reclamar a Admin segun el estado de la visita.

## HU-06: HU-06: Gestión de Fallas Críticas y Deslinde Legal

### RF-01: Recepción de Falla Crítica y Alerta Emergente en Secretaría (Funcional)

Implementar el pipeline de eventos ante fallas críticas cargadas por el RT de calle con disparo de notificación visual y sonora.

**Condiciones de aprobación**

1. Al registrarse un informe con falla critica (cables desgastados o limitador anulado), el servidor emite evento en tiempo real.
2. El panel de la secretaria despliega una notificacion emergente con aviso sonoro y enlace directo al informe.

### RF-02: Generación de PDF Legal MAICON S.R.L. y Despacho por Email a ECA (Funcional)

Desarrollar el generador de PDF con membrete institucional de MAICON S.R.L. y servicio de envío de email automático a la ECA para deslinde de responsabilidad.

**Condiciones de aprobación**

1. El servicio genera un documento PDF formal con membrete de MAICON S.R.L., detalle de anomalias tecnicas y fotografias adjuntas.
2. El sistema despacha automaticamente el PDF por correo electronico a la ECA contratante dejando constancia de envio.

## HU-07: HU-07: Protocolo de Visitas Fallidas y Recargo de Tercera Visita

### RF-01: Gestión de Advertencias 1 y 2 por Visita Fallida y Email a Consorcio (Funcional)

Implementar el procesamiento de visitas fallidas con foto de frente del edificio y GPS congelado, despachando email formal al consorcio.

**Condiciones de aprobación**

1. El sistema valida el reporte de visita fallida comprobando foto del frente y coordenadas GPS congeladas.
2. Al confirmarse la Advertencia 1 o 2, el sistema envia un correo formal a la administracion del consorcio notificando la ausencia.

### RF-02: Bloqueo por Advertencia 3 y Cálculo de Recargo del 45% (Funcional)

Implementar la lógica de negocio ante la 3ra advertencia consecutiva: bloqueo del edificio en el tablero y adición del 45% extra a facturación mensual.

**Condiciones de aprobación**

1. Al acumularse la Advertencia 3, el edificio queda bloqueado en el tablero exhibiendo el aviso Cobro de Tercer Visita Habilitado.
2. El modulo de facturacion mensual suma automaticamente el recargo del 45% extra a la liquidacion de esa maquina.

### RF-03: Persistir las visitas fallidas en PostgreSQL (Funcional)

Las visitas fallidas hoy viven solo en la memoria de la API: el INSERT de visitas-fallidas.service.ts usa en acuses_recibo_legal una columna inexistente (metadata), omite columnas obligatorias y oculta el error en el log de debug. Un reinicio pierde el historial y reinicia el conteo de advertencias.

**Condiciones de aprobación**

1. Al registrar una visita fallida, la visita queda guardada en PostgreSQL con todos sus datos.
2. Después de reiniciar la API, el historial del consorcio conserva las visitas registradas y la siguiente visita continúa la numeración de advertencias.
3. Si el guardado en PostgreSQL falla, la API responde con error y no informa la visita como registrada.

## HU-08: HU-08: Panel de Liquidación Rápida y Autorización de Firma AGC

### RF-01: API de Máquinas Asignadas y Autorización de Firma AGC (Funcional)

Implementar los endpoints para que el RT Legal consulte sus máquinas asignadas del mes y autorice formalmente la firma digital con respaldo legal.

**Condiciones de aprobación**

1. El endpoint GET /api/firmante/maquinas retorna la lista de maquinas del mes asignadas al usuario firmante autenticado.
2. El endpoint POST /api/firmante/autorizar valida que la visita este recorrida con fotos obligatorias y firma del encargado antes de registrar la autorizacion.

### RF-02: UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría (Funcional)

Desarrollar la interfaz limpia y corporativa del Usuario Firmante para liquidar firmas mensuales de forma ágil y segura.

**Condiciones de aprobación**

1. Visualiza lista vertical de sus maquinas con indicador de estado (Recorrida, Pendiente de Visita, Advertencia).
2. El boton Autorizar Firma AGC permanece bloqueado en maquinas pendientes y se habilita unicamente tras auditar fotos y firma en el modal.

## HU-09: HU-09: Portal de Monitoreo de Cobertura para Empresas Conservadoras

### RF-01: API de Cobertura de Flota por Empresa Conservadora (Funcional)

Implementar la API de consulta exclusiva para la ECA aliada, calculando métricas de inspección y cobertura mensual de su flota.

**Condiciones de aprobación**

1. El endpoint GET /api/eca/cobertura calcula y retorna el porcentaje de maquinas inspeccionadas y firmadas de la ECA en el mes actual.
2. El endpoint GET /api/eca/maquinas lista las maquinas de su flota con detalle de estado de forma protegida.

### RF-02: UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura (Funcional)

Construir el portal web de acceso exclusivo para la ECA con medidor gráfico de cobertura mensual y catálogo protegido sin botones de edición.

**Condiciones de aprobación**

1. La pantalla principal presenta el grafico/medidor con el porcentaje de cobertura de maquinas cubiertas y firmadas.
2. El listado de la flota se despliega en modo solo lectura, ocultando cualquier opcion de edicion o carga.

## HU-10: HU-10: Centro de Alertas Críticas y Acuse Legal en Portal ECA

### RF-01: Carteles de Alerta de Fuera de Uso y Reparación Urgente en Portal ECA (Funcional)

Implementar las alertas destacadas y parpadeantes en el portal de la ECA ante anomalías graves detectadas en su flota.

**Condiciones de aprobación**

1. Si un ascensor es marcado como Fuera de Servicio, se muestra alerta titilante roja con motivo y fotografia de la cabina trabada.
2. Si presenta anomalias graves operando, se exhibe cartel naranja gigante de Reparacion Urgente con detalle del checklist.

### RF-02: Descarga de Remito Técnico y Registro de Acuse de Recibo Legal (Funcional)

Habilitar la descarga del remito técnico para la ECA y persistir en base de datos la fecha y hora exacta del acuse de recibo legal.

**Condiciones de aprobación**

1. El portal provee boton para Descargar Remito de Notificacion con el informe y fotos de la falla.
2. Al descargarse el remito, el sistema registra automaticamente la fecha, hora y usuario para el acuse legal de MAICON S.R.L.

### RF-03: Registrar el acuse de recibo legal solo si quedó guardado en la base (Funcional)

El acuse de recibo legal de ECA se informa como registrado aunque el INSERT en acuses_recibo_legal falle, porque eca.service.ts traga el error con un try/catch vacío y marca el acuse en memoria antes de guardarlo. Guardar primero y, si falla, devolver el error sin marcar nada. Hallazgo de QA de HU-01 RNF-01.

**Condiciones de aprobación**

1. Con la base caída, POST /api/eca/alertas/ALT-MAICON-001/acuse responde 500 y no informa ok: true; GET /api/eca/alertas sigue mostrando esa alerta sin acuseRecibo.
2. POST /api/eca/alertas/ALT-MAICON-001/acuse con un carácter NUL en usuario responde 400 con message "Datos inválidos"; GET /api/eca/alertas sigue mostrando esa alerta sin acuseRecibo.
3. Con la base sana, POST /api/eca/alertas/ALT-MAICON-001/acuse con usuario "qa.valido" responde 201 con ok: true, deja 1 fila en acuses_recibo_legal con ese alerta_id y ese usuario, y GET /api/eca/alertas muestra el acuseRecibo con ese usuario.
4. Con la base caída, GET /api/eca/remito/ALT-MAICON-001 responde 500 y no entrega el remito.
5. Sin base de datos configurada (servicio creado sin DatabaseService), el acuse se sigue registrando solo en memoria, como hasta ahora.

## HU-11: HU-11: Notificaciones Automáticas por WhatsApp a la ECA

### RF-01: Conector de API de WhatsApp y Plantilla Formal de Alerta Crítica (Funcional)

Implementar la integración con la API de WhatsApp y formateador de mensajes formales de MAICON S.R.L.

**Condiciones de aprobación**

1. El servicio formatea el mensaje de alerta con plantilla formal (nombre ECA, consorcio, estado, equipo y detalle).
2. El conector realiza el envio exitoso hacia la API de WhatsApp con manejo de errores y reintentos ante fallas de red.

### RF-02: Disparo Automático Inmediato (< 5s) de WhatsApp con Link Directo (Funcional)

Configurar el webhook/trigger que detecta informes con Reparación Urgente o Fuera de Servicio y despacha el mensaje en menos de 5 segundos con enlace seguro al remito.

**Condiciones de aprobación**

1. Al consolidarse un informe critico, el disparo hacia WhatsApp se ejecuta en menos de 5 segundos comprobables.
2. El mensaje incluye un enlace directo y funcional a las fotos y al informe tecnico firmado para visualizacion inmediata en el celular.

### RF-03: No informar como entregado un WhatsApp que no se envió (Funcional)

Sin un proveedor configurado, WhatsAppConnectorService simula el envío y devuelve ok con estado "entregado". El Portal ECA muestra entonces "WhatsApp Despachado" con un ID, aunque ningún mensaje salió. Quien lo ve puede creer que la ECA fue avisada de una falla crítica.

**Condiciones de aprobación**

1. Sin proveedor de WhatsApp configurado, el envío de una alerta responde con error, informa que el envío no está configurado y no devuelve el estado "entregado".
2. En el Portal ECA, cuando el envío no se realizó, el botón Despachar Alerta WhatsApp muestra el motivo y no muestra "WhatsApp Despachado".
3. El disparo automático ante una alerta crítica registra el envío como no realizado cuando no hay proveedor configurado.

### RF-04: Enviar las alertas por WhatsApp a través de un proveedor real (Funcional)

Conectar WhatsAppConnectorService con un proveedor real (WhatsApp Cloud API de Meta o Twilio), empezando por su modo de prueba, y tomar el destino del teléfono de la ECA asignada al edificio en lugar del número fijo +5491144009988. El número remitente de producción depende de la respuesta de MAICON (P13.b).

**Condiciones de aprobación**

1. Con las credenciales del proveedor cargadas en variables de entorno, una alerta crítica llega como mensaje de WhatsApp a un número registrado en el modo de prueba del proveedor.
2. El destino es el teléfono de la ECA responsable del edificio asignada en la terna de roles; sin teléfono cargado, el envío no se hace y se informa el motivo.
3. Si el proveedor rechaza el envío, la API informa el error que devolvió el proveedor y el envío queda registrado como fallido.
4. Las credenciales del proveedor no quedan en el repositorio.

## HU-12: HU-12: Interfaz NEO Linear, Sidebar Colapsable y Buscador Global Inline

### RF-01: Shell Visual NEO Linear (Dark/Light), Sidebar Colapsable, Cobertura Neón y Buscador Global Inline (Funcional)

Implementar el sistema visual NEO estilo Linear con soporte Dark/Light, vista bento 'Estado del sistema', sidebar colapsable a 80px con ícono de expandir al lado del logo violeta sin superposición, estilos neón en Medidor de Cobertura y buscador global inline en barra superior en reemplazo de Ctrl+K.

**Condiciones de aprobación**

1. El shell principal ofrece botón 'Cambiar tema visual' entre modo oscuro y claro, vista bento 'Estado del sistema' y botón 'Alternar barra lateral' que al colapsar a 80px mantiene expandir al lado del cuadrado violeta sin superposición.
2. La barra superior incluye el buscador inline con placeholder 'Buscar consorcio, máquina (M1, M2) o portal…' sin modal Ctrl+K; al escribir muestra resultados agrupados y al elegir uno navega directo al consorcio en Secretaría o modal de auditoría en Firmante.
3. El Medidor de Cobertura Mensual en Portal ECA aplica recuadros con colores neón diferenciados de alto contraste para 'Inspeccionadas', 'Firmadas (Legal AGC)', 'Pendientes de Visita', 'Con Advertencia' y 'Flota Total'.

### RF-02: FIX: Corregir contraste de textos y contenedores en Modo Oscuro (Funcional)

Corregir en styles.css los fondos claros heredados (.audit-grid en ModalAuditoria, --surface-sunken en formulario de visita fallida y total de facturación, cartel de bloqueo por tercera visita, badges y textos atenuados) cuando data-theme='dark' está activo para garantizar lectura legible en todo el sistema.

**Condiciones de aprobación**

1. En Portal Firmante (ModalAuditoria), el bloque '1. Estado de la Inspección' (.audit-grid) muestra fondo oscuro (--card-subtle) y texto legible de alto contraste (--text / --muted) en modo oscuro sin fondo blanco.
2. En Secretaría (FichaConsorcio), las cajas '--surface-sunken' (formulario de visita fallida y fila total de facturación), el cartel de bloqueo por tercera visita y los indicadores de recargo del 45% muestran colores contrastados en modo oscuro.

## HU-13: HU-13: Claridad Operativa y Limpieza de Obviedades en Portales ECA y Consorcios

### RF-01: Alertas Críticas del Portal ECA sin prefijos obvios ni códigos duplicados (Funcional)

Limpiar los encabezados y tarjetas de Alertas Críticas en el Portal ECA eliminando prefijos redundantes ('CARTEL GIGANTE:'), evitando códigos repetidos mediante formatearNombreEquipo ('M2: Ascensor Posterior') y removiendo la etiqueta redundante sobre la fotografía.

**Condiciones de aprobación**

1. En Alertas Críticas, las tarjetas de 'ANOMALÍAS GRAVES DETECTADAS OPERANDO' muestran 'REPARACIÓN URGENTE — M1: ...' sin el prefijo 'CARTEL GIGANTE:'.
2. Los títulos de máquinas en alertas críticas usan formatearNombreEquipo sin duplicar el código (ej. 'M2: Ascensor Posterior' y no 'M2 - M2:') y sin rótulo superpuesto en la fotografía.

### RF-02: Limpieza de badges obvios y jerga técnica en Portal ECA y Consorcios (Funcional)

Remover rótulos redundantes y menciones técnicas internas en el Portal ECA y las pantallas de Consorcios para mostrar copy claro orientado al usuario final.

**Condiciones de aprobación**

1. El Portal ECA conserva el badge 'Solo lectura' y elimina los rótulos redundantes 'Modo Consulta Oficial', 'Solo lectura: Sin edición habilitada' y '(Protegido)'.
2. Las vistas de Consorcios (FichaConsorcio y FormularioConsorcio) eliminan referencias técnicas internas como '(HU-07)', 'base oficial', 'Dirección Literal' y 'Grilla Dinámica' manteniendo toda su funcionalidad.

## RO-01: RO-01: Setup del proyecto y entorno de desarrollo verificable

### RF-01: RO-01: Setup del proyecto y entorno de desarrollo verificable (Funcional)

Inicializar el monorepo (web React+Vite PWA, API NestJS, PostgreSQL+PostGIS en Docker) con HTTPS local en https://localhost:8050 y CORS habilitado solo en desarrollo para el origen de Scrum Master AI (https://scrum.nuestrocamino.cloud).

**Condiciones de aprobación**

1. GET https://localhost:8050/api/health responde 200 con el estado de la API y de la base de datos.
2. Una petición con Origin: https://scrum.nuestrocamino.cloud recibe Access-Control-Allow-Origin con ese origen, y una con otro origen no lo recibe.
3. Con la configuración de producción, la API no devuelve encabezados CORS.
4. docker compose up levanta PostgreSQL con PostGIS, y /api/health informa la versión de PostGIS.
5. https://localhost:8050 carga la app web y registra el service worker.

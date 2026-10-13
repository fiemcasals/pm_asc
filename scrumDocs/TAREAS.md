# Tareas -- mant_asc

_Generado automaticamente el 2026-10-13T16:53:17.851Z -- no editar a mano, se sobreescribe en cada publicacion._

## HU-01: HU-01: Gestión y Alta de Consorcios y Máquinas

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

## RO-01: RO-01: Setup del proyecto y entorno de desarrollo verificable

### RF-01: RO-01: Setup del proyecto y entorno de desarrollo verificable (Funcional)

Inicializar la estructura del proyecto web y API con soporte CORS habilitado para https://localhost:8050 según estándar de pruebas.

**Condiciones de aprobación**

_Sin condiciones de aprobación cargadas: pedíselas al Project Manager o al Scrum Master antes de darlo por terminado._

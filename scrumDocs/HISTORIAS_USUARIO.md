# Historias de Usuario -- mant_asc

_Generado automaticamente el 2026-10-09T15:48:21.012Z -- no editar a mano, se sobreescribe en cada publicacion._

## HU-01: HU-01: Gestión y Alta de Consorcios y Máquinas

Como Secretaria quiero cargar edificios, consorcios y sus máquinas con referencias AGC (M1, M2, etc.) para mantener el inventario técnico actualizado.

### Criterios de Aceptacion

1. Dado que la secretaria accede a la pestaña de Carga de Edificios, cuando ingresa los datos del consorcio y sus máquinas con nomenclatura AGC (ej. M1: Derecha, M2: Izquierda), entonces el sistema los guarda y lista correctamente.
2. Dado un edificio con máquinas registradas, cuando se consulta su ficha, entonces muestra la dirección, datos de administración y máquinas asociadas.

## HU-02: HU-02: Asignación de Roles Tripartitos por Edificio

Como Secretaria quiero asignar a cada edificio el RT de Calle (60%), el Usuario Firmante / RT Legal (25%) y la ECA Responsable para definir las responsabilidades operativas y legales.

### Criterios de Aceptacion

1. Dado un edificio registrado, cuando la secretaria selecciona el RT de Calle, el Usuario Firmante y la ECA responsable, entonces el sistema guarda la terna y aplica el esquema de asignación.
2. Dado que se reasigna un RT de Calle o Firmante, cuando se guardan los cambios, entonces se actualiza inmediatamente la vista de ruteo y firma de los usuarios afectados.

## HU-03: HU-03: Mapa Interactivo de Flota y Rastreo GPS en CABA

Como Secretaria quiero visualizar en tiempo real la ubicación GPS de los técnicos en calle sobre el mapa de CABA para desviar al recurso más cercano ante llamados de emergencia.

### Criterios de Aceptacion

1. Dado que los técnicos tienen sus tablets activas, cuando la secretaria abre el mapa principal, entonces visualiza los pines de ubicación en vivo de los ingenieros.
2. Dado un llamado de emergencia con personas atrapadas en un ascensor, cuando la secretaria selecciona el edificio, entonces el mapa resalta qué técnico está más próximo para su desvío.

## HU-04: HU-04: Semáforo de Control Mensual y Reasignación Operativa

Como Secretaria quiero monitorear el estado de inspecciones con semáforo por día del mes (Verde 1-10, Amarillo 11-20, Rojo 21-30) para enviar recordatorios de ruteo o reasignar edificios críticos.

### Criterios de Aceptacion

1. Dado un edificio con inspección cumplida en días 1-10, cuando se visualiza en el mapa, entonces se muestra con pin Verde.
2. Dado un edificio pendiente en días 11-20, cuando la secretaria presiona Enviar recordatorio de ruteo, entonces el sistema actualiza automáticamente el mapa en la tablet del técnico.
3. Dado un edificio en estado crítico (días 21-30, pin Rojo), cuando la secretaria presiona Reasignar, entonces permite transferir el edificio con un clic a otro ingeniero con menor saturación.

## HU-05: HU-05: Tablero Dinámico de Monitoreo Backoffice

Como Secretaria quiero contar con una tabla dinámica con filtros de búsqueda rápida por dirección, ECA e inspector para monitorear el avance y ejecutar acciones comerciales.

### Criterios de Aceptacion

1. Dado el tablero de monitoreo, cuando la secretaria filtra por dirección, ECA o inspector, entonces la grilla muestra en tiempo real las filas correspondientes con sus estados (Cumplida, Pendiente, Advertencias).
2. Dado un registro con visita cumplida, cuando la secretaria interactúa con la fila, entonces permite ver fotos/informe y ejecutar el envío de remito a la ECA.

## HU-06: HU-06: Gestión de Fallas Críticas y Deslinde Legal

Como Secretaria quiero recibir alertas sonoras inmediatas ante fallas críticas (cables desgastados, limitador anulado) y despachar un PDF formal a la ECA para desligar de responsabilidad legal al firmante.

### Criterios de Aceptacion

1. Dado que un RT de calle carga una Falla Crítica en su informe, cuando se recibe en el panel de secretaría, entonces se dispara una notificación emergente visual y sonora.
2. Dado el informe de falla crítica abierto, cuando la secretaria presiona el botón de generación, entonces el sistema genera un PDF con membrete de MAICON S.R.L. y lo envía automáticamente por email a la ECA contratante.

## HU-07: HU-07: Protocolo de Visitas Fallidas y Recargo de Tercera Visita

Como Secretaria quiero registrar advertencias por visitas fallidas con foto y GPS congelado, notificando al consorcio y habilitando el cobro del 45% extra en la tercera advertencia.

### Criterios de Aceptacion

1. Dado que el RT reporta No se pudo realizar la inspección con foto de frente y GPS congelado (Advertencia 1 o 2), cuando la secretaria lo valida, entonces el sistema envía un email formal a la administración del consorcio dejando constancia de la ausencia.
2. Dado un edificio que acumula la Advertencia 3, cuando el sistema la registra, entonces bloquea el edificio, muestra el cartel Cobro de Tercer Visita Habilitado y suma automáticamente el recargo del 45% extra a la facturación mensual.

## HU-08: HU-08: Panel de Liquidación Rápida y Autorización de Firma AGC

Como Usuario Firmante (RT Legal) quiero acceder a una lista limpia de mis máquinas asignadas para revisar informes con fotos obligatorias y autorizar la firma digital ante AGC con respaldo jurídico.

### Criterios de Aceptacion

1. Dado que el Usuario Firmante inicia sesión, cuando accede a su panel, entonces visualiza la lista vertical de sus máquinas con su estado (Recorrida, Pendiente de Visita, Advertencia).
2. Dado un registro en estado Pendiente de Visita, cuando el usuario mira los controles, entonces el botón de autorizar se encuentra bloqueado.
3. Dado un registro en estado Recorrida, cuando el firmante abre el informe, revisa las fotos obligatorias (cables, frente) y firma del encargado, entonces se habilita el botón Autorizar Firma AGC para dar conformidad legal.

## HU-09: HU-09: Portal de Monitoreo de Cobertura para Empresas Conservadoras

Como Empresa Conservadora (ECA) quiero consultar un portal de solo lectura con medidor de cobertura mensual y alertas para conocer el estado de mi flota contratada.

### Criterios de Aceptacion

1. Dado que una ECA accede a su portal exclusivo, cuando visualiza la pantalla principal, entonces observa el gráfico de cobertura mensual con el porcentaje de máquinas inspeccionadas y firmadas.
2. Dado que un ascensor tiene informe normal, cuando la ECA navega su listado, entonces no visualiza opciones de carga ni modificación.

## HU-10: HU-10: Centro de Alertas Críticas y Acuse Legal en Portal ECA

Como Empresa Conservadora (ECA) quiero ver carteles prominentes ante equipos Fuera de Uso o con Reparación Urgente para descargar el remito técnico y registrar la notificación legal.

### Criterios de Aceptacion

1. Dado un ascensor marcado como NO, FUERA DE SERVICIO o con Reparación Urgente, cuando la ECA entra al portal, entonces se visualiza una alerta parpadeante en la parte superior con fotos y detalle de la anomalía.
2. Dado que la ECA presiona Descargar Remito de Notificación, cuando se descarga el documento, entonces el sistema registra fecha y hora del acuse de recibo legal para MAICON S.R.L.

## HU-11: HU-11: Notificaciones Automáticas por WhatsApp a la ECA

Como Empresa Conservadora (ECA) quiero recibir mensajes instantáneos de WhatsApp (< 5 seg) ante fallas graves o clausuras con enlace directo a fotos e informe para actuar de inmediato.

### Criterios de Aceptacion

1. Dado que el RT de calle consolida un informe con Alerta de Reparación Urgente o Fuera de Uso, cuando el servidor lo procesa, entonces en menos de 5 segundos envía un mensaje de WhatsApp a través de la API al celular del responsable de la ECA.
2. Dado el mensaje de WhatsApp recibido, cuando el usuario abre el enlace adjunto, entonces puede visualizar de forma directa la fotografía de la falla y el informe técnico firmado.

# Historias de Usuario -- mant_asc

_Generado automaticamente el 2026-11-13T16:44:01.264Z -- no editar a mano, se sobreescribe en cada publicacion._

## HU-01: HU-01: Gestión y Alta de ECA y Máquinas

Como Secretaria quiero cargar empresas conservadoras (ECA), edificios y sus máquinas con referencias AGC (M1, M2, etc.) para mantener el inventario técnico actualizado.

### Criterios de Aceptacion

- 1. Dado que la secretaria accede a la pestaña de Carga de Empresas, cuando ingresa los datos de la ECA y sus máquinas con nomenclatura AGC (ej. M1: Derecha, M2: Izquierda), entonces el sistema los guarda y lista correctamente.
- 2. Dado un edificio con máquinas registradas, cuando se consulta su ficha, entonces muestra la dirección, datos de administración y máquinas asociadas.

## HU-02: HU-02: Asignación de Roles Tripartitos por Edificio

Como Secretaria quiero asignar a cada edificio (con sus máquinas) el RT de Calle, el Usuario Firmante / RT Legal y la ECA Responsable para definir las responsabilidades operativas y legales.

### Criterios de Aceptacion

- 1. Dado un edificio registrado, cuando la secretaria selecciona el RT de Calle, el Usuario Firmante y la ECA responsable, entonces el sistema guarda la terna y aplica el esquema de asignación.
- 2. Dado que se reasigna un RT de Calle o Firmante, cuando se guardan los cambios, entonces se actualiza inmediatamente la vista de ruteo y firma de los usuarios afectados.

## HU-04: HU-04: Semáforo de Control Mensual y Reasignación Operativa

Como Secretaria quiero monitorear el estado de inspecciones con semáforo por día del mes (Verde 1-10, Amarillo 11-20, Rojo 21-30) para enviar recordatorios de ruteo o reasignar edificios críticos.

### Criterios de Aceptacion

- 1. Dado un edificio con inspección cumplida en días 1-10, cuando se visualiza en el mapa, entonces se muestra con pin Verde.
- 2. Dado un edificio pendiente en días 11-20, cuando la secretaria presiona Enviar recordatorio de ruteo, entonces el sistema actualiza automáticamente el mapa en la tablet del técnico.
- 3. Dado un edificio en estado crítico (días 21-30, pin Rojo), cuando la secretaria presiona Reasignar, entonces permite transferir el edificio con un clic a otro ingeniero con menor saturación.

## HU-05: HU-05: Tablero Dinámico de Monitoreo Backoffice

Como Secretaria quiero contar con una tabla dinámica con filtros de búsqueda rápida por dirección, ECA e inspector para monitorear el avance y ejecutar acciones comerciales.

### Criterios de Aceptacion

- 1. Dado el tablero de monitoreo, cuando la secretaria filtra por dirección, ECA o inspector, entonces la grilla muestra en tiempo real las filas correspondientes con sus estados (Cumplida, Pendiente, Advertencias).
- 2. Dado un registro con visita cumplida, cuando la secretaria interactúa con la fila, entonces permite ver fotos/informe y ejecutar el envío de remito a la ECA.

## HU-06: HU-06: Gestión de Fallas Críticas y Deslinde Legal

Como Secretaria quiero recibir alertas sonoras inmediatas ante fallas críticas (cables desgastados, limitador anulado) y despachar un PDF formal a la ECA para desligar de responsabilidad legal al firmante.

### Criterios de Aceptacion

- 1. Dado que un RT de calle carga una Falla Crítica en su informe, cuando se recibe en el panel de secretaría, entonces se dispara una notificación emergente visual y sonora.
- 2. Dado el informe de falla crítica abierto, cuando la secretaria presiona el botón de generación, entonces el sistema genera un PDF con membrete de MAICON S.R.L. y lo envía automáticamente por email a la ECA contratante.

## HU-07: HU-07: Protocolo de Visitas Fallidas y Recargo de Tercera Visita

Como Secretaria quiero registrar advertencias por visitas fallidas con foto y GPS congelado, notificando al consorcio y habilitando el cobro del 45% extra en la tercera advertencia.

### Criterios de Aceptacion

- 1. Dado que el RT reporta No se pudo realizar la inspección con foto de frente y GPS congelado (Advertencia 1 o 2), cuando la secretaria lo valida, entonces el sistema envía un email formal a la administración del consorcio dejando constancia de la ausencia.
- 2. Dado un edificio que acumula la Advertencia 3, cuando el sistema la registra, entonces bloquea el edificio, muestra el cartel Cobro de Tercer Visita Habilitado y suma automáticamente el recargo del 45% extra a la facturación mensual.

## HU-08: HU-08: Panel de Liquidación Rápida y Autorización de Firma AGC

Como Usuario Firmante (RT Legal) quiero acceder a una lista limpia de mis máquinas asignadas para revisar informes con fotos obligatorias y autorizar la firma digital ante AGC con respaldo jurídico.

### Criterios de Aceptacion

- 1. Dado que el Usuario Firmante inicia sesión, cuando accede a su panel, entonces visualiza la lista vertical de sus máquinas con su estado (Recorrida, Pendiente de Visita, Advertencia).
- 2. Dado un registro en estado Pendiente de Visita, cuando el usuario mira los controles, entonces el botón de autorizar se encuentra bloqueado.
- 3. Dado un registro en estado Recorrida, cuando el firmante abre el informe, revisa las fotos obligatorias (cables, frente) y firma del encargado, entonces se habilita el botón Autorizar Firma AGC para dar conformidad legal.

## HU-09: HU-09: Portal de Monitoreo de Cobertura para Empresas Conservadoras

Como Empresa Conservadora (ECA) quiero consultar un portal de solo lectura con medidor de cobertura mensual y alertas para conocer el estado de mi flota contratada.

### Criterios de Aceptacion

- 1. Dado que una ECA accede a su portal exclusivo, cuando visualiza la pantalla principal, entonces observa el gráfico de cobertura mensual con el porcentaje de máquinas inspeccionadas y firmadas.
- 2. Dado que un ascensor tiene informe normal, cuando la ECA navega su listado, entonces no visualiza opciones de carga ni modificación.

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

## HU-12: HU-12: Interfaz NEO Linear, Sidebar Colapsable y Buscador Global Inline

Como operador de mant_asc (Secretaría, Firmante y ECA) quiero una interfaz moderna estilo Linear con modo oscuro/claro, sidebar colapsable sin superposición, tarjetas neón de cobertura y un buscador global inline en la barra superior para navegar edificios y máquinas sin fricción.

### Criterios de Aceptacion

1. Dado el shell principal de la aplicación, cuando el usuario alterna entre modo oscuro y claro o colapsa el sidebar a 80px, entonces los íconos del encabezado quedan lado a lado sin superponerse y la vista se adapta con contraste NEO.
2. Dado el buscador inline de la barra superior, cuando el operador escribe al menos 2 caracteres de un consorcio o máquina, entonces visualiza resultados agrupados y al seleccionar uno navega directo al consorcio o modal de auditoría sin usar modal Ctrl+K.
3. Dado el Medidor de Cobertura Mensual del Portal ECA, cuando se visualizan las tarjetas de estado (Inspeccionadas, Firmadas, Pendientes, Con Advertencia y Flota Total), entonces presentan bordes y acentos neón diferenciados de alto contraste.

## HU-13: HU-13: Claridad Operativa y Limpieza de Obviedades en Portales ECA y Consorcios

Como usuario del Portal ECA y Secretaría quiero pantallas libres de prefijos redundantes, textos obvios y jerga técnica interna para leer alertas críticas y fichas de consorcio con información directa y accionable.

### Criterios de Aceptacion

1. Dado el centro de Alertas Críticas del Portal ECA, cuando se muestran equipos en Fuera de Servicio o con Anomalías Graves, entonces no aparecen los prefijos 'CARTEL GIGANTE:', códigos duplicados como 'M2 - M2:' ni etiquetas redundantes sobre la fotografía.
2. Dado el Portal ECA y las vistas de Consorcios, cuando el operador consulta fichas, formularios o encabezados de solo lectura, entonces no se muestran badges obvios ni referencias técnicas internas ('(HU-07)', 'PostgreSQL', 'base oficial', 'Dirección Literal', 'Grilla Dinámica').

## HU-14: HU-14: Acceso por rol y sesión en el celular

Como usuario del sistema (RT de Calle, Secretaría, Firmante, ECA o Administrador) quiero ingresar con mis credenciales desde el celular o la computadora para ver solo lo que corresponde a mi rol.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

### Criterios de Aceptacion

1. Dado un usuario activo, cuando ingresa usuario y contraseña correctos, entonces entra a la pantalla inicial de su rol.
2. Dadas credenciales incorrectas, cuando intenta ingresar, entonces ve un error y no entra.
3. Dado un usuario de un rol, cuando pide un recurso de otro rol, entonces el sistema responde 403.
4. Dado un RT que usa su celular personal, cuando ingresa por primera vez, entonces acepta el aviso de uso de su ubicación antes de empezar a trabajar.
5. Dado un celular perdido o un RT que deja la empresa, cuando un Administrador revoca su sesión, entonces ese celular no puede volver a pedir ni enviar datos.

## HU-15: HU-15: Aislamiento de datos entre ECA

Como Empresa Conservadora quiero que mis datos queden aislados de los de otras ECA para mantener la confidencialidad de mis clientes.
Se asume una sola ECA por edificio, como asigna hoy HU-02; si MAICON confirma que un edificio puede tener equipos de distintas ECA, el aislamiento pasa al equipo.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

### Criterios de Aceptacion

1. Dado un usuario de la ECA A, cuando consulta listados, entonces solo ve datos de la ECA A.
2. Dado un usuario de la ECA A, cuando pide por URL un recurso de la ECA B, entonces recibe 404.
3. Dado un RT de Calle o un Firmante, cuando consulta edificios o máquinas, entonces ve solo los asignados, aunque sean de varias ECA.

## HU-16: HU-16: Mapa del RT y llegada al edificio

Como RT de Calle quiero ver en el celular mis edificios pendientes según estén abiertos o cerrados ahora, con su contacto, y poder iniciar la inspección solo cuando estoy en el edificio, para no ir en vano y dejar constancia de mi presencia.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

### Criterios de Aceptacion

1. Dado un RT logueado, cuando entra, entonces ve su zona, la hora actual y solo sus edificios pendientes.
2. Dado un edificio, cuando se evalúa su horario, entonces el pin es verde si está abierto, rojo si está cerrado y amarillo si es "A coordinar".
3. Dado un pin, cuando el RT lo toca, entonces ve la tarjeta con dirección, estado, encargado y horarios, y puede llamar o abrir la ruta.
4. Dado un RT a 30 m o menos del edificio, cuando mira la tarjeta, entonces aparecen "Iniciar Inspección" y "No se pudo realizar la inspección".
5. Dado un GPS sin precisión suficiente, cuando el RT está en el edificio, entonces puede iniciar con foto y justificación, y la visita queda marcada para revisión de la Secretaría.

## HU-17: HU-17: Inspección técnica por solapas

Como RT de Calle quiero relevar cada equipo del edificio por solapas desde el celular, moviéndome por el edificio, para registrar el estado de todas las máquinas en una sola visita, aunque no tenga señal.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

### Criterios de Aceptacion

1. Dado un edificio con varios equipos, cuando el RT inicia la visita, entonces puede cambiar de M1 a M2 o M3 dentro de la misma solapa sin perder lo cargado.
2. Dado un ítem marcado con Falla Crítica o un equipo Fuera de Servicio, cuando el RT lo carga, entonces la foto es obligatoria; en el resto de las fallas es opcional.
3. Dada una sala de máquinas compartida, cuando se cargan los datos del entorno en un equipo, entonces se aplican a los demás de esa sala.
4. Dado un equipo fuera de servicio, cuando se guarda el reporte de parada, entonces la Secretaría y el Firmante reciben el aviso y ese equipo queda resuelto sin afectar a los demás.
5. Dado que no hay señal, cuando el RT trabaja, entonces no pierde nada de lo cargado, fotos incluidas.

## HU-18: HU-18: Cierre, firma y envío del informe

Como RT de Calle quiero consolidar todos los equipos en un informe que el encargado firme una sola vez en el celular, y que se envíe aunque al firmar no haya señal, para cerrar la visita con validez.
La firma en pantalla es una firma electrónica (Ley 25.506), no digital: su valor probatorio se apoya en el sellado del informe.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

### Criterios de Aceptacion

1. Dadas todas las solapas completas, cuando el RT termina, entonces se habilita "Consolidar Informe y Proceder a Firma".
2. Dado el informe consolidado, cuando el encargado firma con nombre, apellido y carácter, entonces se genera un informe por equipo con esa firma.
3. Dado que no hay nadie para firmar, cuando el RT cierra "Sin firma" con motivo y foto, entonces el informe se envía marcado para que lo vean la Secretaría y el Firmante.
4. Dado un informe cerrado, cuando alguien intenta modificarlo, entonces el sistema lo rechaza.
5. Dado que no hay señal al cerrar, cuando vuelve la conexión con la app abierta, entonces el informe se envía sin duplicarse.

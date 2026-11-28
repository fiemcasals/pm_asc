# Tareas -- mant_asc

_Generado automaticamente el 2026-11-28T14:52:47.937Z -- no editar a mano, se sobreescribe en cada publicacion._

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

### RF-03: Importar el listado Excel de la AGC (máquinas, ubicaciones y estados) (Funcional)

El cliente informó (P11) que la AGC tiene un listado tipo Excel con máquinas, ubicaciones y estados (APTO, etc.). Encargado, teléfono, horarios y email de la ECA se cargan a mano. Las columnas exactas dependen del ejemplo que tiene que mandar MAICON; mientras tanto se trabaja con un archivo de prueba con las columnas dirección, matrícula AGC, tipo de equipo y estado.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. La Secretaría sube un archivo .xlsx y el sistema crea las máquinas nuevas y actualiza las existentes, identificadas por matrícula AGC, sin duplicarlas.
2. Una fila inválida se informa con su número y motivo, y no impide importar las demás.
3. Al terminar se muestra un resumen: cantidad de máquinas creadas, actualizadas y rechazadas.
4. Un archivo que no es .xlsx o supera 5 MB se rechaza con 400 sin importar nada.

### RF-04: Horarios de atención por edificio editables por la Secretaría (Funcional)

Definición del cliente (P12): hasta 2 franjas por día, que pueden variar según el día de la semana; lo habitual es de 08:00 a 12:00 y de 17:00 a 20:00. La Secretaría los modifica por edificio: algunos tienen horarios particulares o requieren coordinación ("A coordinar", pin amarillo). Los feriados cuentan como cerrado.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. Un edificio nuevo arranca con lunes a viernes de 08:00 a 12:00 y de 17:00 a 20:00.
2. La Secretaría puede editar hasta 2 franjas por día de la semana; una franja con hora de fin anterior a la de inicio o superpuesta con la otra se rechaza con 400.
3. La Secretaría puede marcar un edificio como "A coordinar", que reemplaza las franjas.
4. La API informa si un edificio está abierto en un momento dado, considerando cerrado los feriados.

### RF-05: Datos operativos del edificio y del equipo para la calle (Funcional)

El RT necesita en la calle datos que hoy la ficha no guarda: encargado y su teléfono, pisos, ubicación del edificio en el mapa, tipo de cada equipo y sala de máquinas compartida. La administración (nombre, teléfono, email) ya existe. Los horarios van en la tarea "Horarios de atención por edificio".
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Un edificio guarda encargado, teléfono del encargado y lista de pisos, y la Secretaría los edita desde la ficha.
2. Un edificio guarda su ubicación como punto geográfico (PostGIS), que la Secretaría puede ajustar sobre el mapa; un edificio sin ubicación no aparece en los mapas y la ficha lo advierte.
3. Cada equipo guarda su tipo: tracción, hidráulico o montavehículos.
4. Dos o más equipos del mismo edificio pueden compartir una sala de máquinas, y la ficha muestra cuáles la comparten.

### RF-06: Que la ficha del edificio y el alta de consorcio entren en un celular de 360 px (Funcional)

La ficha del edificio y el alta de consorcio tienen una grilla de 340 + 736 px y no entran en un celular de 360 px: se desborda hacia la derecha y el mapa queda cortado. Ya pasaba antes de la mejora del mapa.

**Condiciones de aprobación**

- 1. Dada una pantalla de 360 px de ancho, cuando se abre la ficha de un edificio (lectura y edición), entonces no hay desplazamiento horizontal y el mapa se ve completo.
- 2. Dada una pantalla de 360 px de ancho, cuando se abre el alta de nuevo consorcio, entonces todos los campos, el mapa y los botones entran sin desplazarse hacia los costados.
- 3. En escritorio las dos pantallas se ven como antes.
- 4. La guía visual tiene capturas de Playwright de las dos pantallas en 360 px y en escritorio.

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

### RNF-03: Evitar que informes.e2e-spec falle de forma intermitente (No funcional)

En una corrida completa, informes.e2e-spec falló una vez sin repetirse al volver a correr. Un test que a veces falla le quita valor a toda la corrida. Esta Tarea encuentra la causa y la corrige.

**Condiciones de aprobación**

- 1. Dada la suite completa de la API, cuando se corre 10 veces seguidas, entonces informes.e2e-spec pasa las 10 veces.
- 2. La causa de la falla intermitente queda escrita en la entrega y corregida en el código o en la prueba, no tapada con reintentos.

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

### RF-04: Porcentajes de pago y abono configurables por máquina (Funcional)

Hoy el 60 % (RT de Calle) y el 25 % (Firmante) son constantes en el código (PORCENTAJES_OPERATIVOS). El cliente aclaró (cuestionario 06/11) que no son fijos: son un modelo inicial de pago que depende del monto de cada máquina. También pidió abono mensual por máquina; los valores los manda MAICON.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. Cada máquina tiene abono mensual, porcentaje del RT de Calle y porcentaje del Firmante editables; una máquina nueva arranca con 60 % y 25 %.
2. La liquidación usa los valores guardados de cada máquina, no constantes del código.
3. Un porcentaje menor que 0, mayor que 100, o una suma de porcentajes mayor que 100 se rechaza con 400 y el motivo.
4. Cada cambio de abono o porcentaje queda registrado con usuario, fecha, valor anterior y valor nuevo.

### RF-05: Guardar el teléfono y el email del RT de Calle en su usuario y usarlos al reasignar (Funcional)

Hoy, al reasignar un edificio en rojo, la terna del RT nuevo queda sin teléfono ni email (se vacían los del anterior para no dejarle datos ajenos) porque el usuario del RT no tiene datos de contacto. Un edificio con un RT sin contacto es algo que PUT /roles no permite crear a mano. Origen: hallazgo de HU-04 RF-02.

**Condiciones de aprobación**

1. El Administrador puede cargar y editar el teléfono y el email de un usuario con rol rt_calle; los datos se guardan y se devuelven al consultarlo.
2. Al reasignar un edificio, la terna queda con el teléfono y el email del RT nuevo y no con los del anterior.
3. Si el RT nuevo no tiene teléfono ni email cargados, la reasignación responde 409 con un mensaje que lo dice y no cambia nada.
4. Un edificio nunca queda con un RT de Calle sin ningún dato de contacto después de reasignarlo.

### RF-06: Que reasignar o asignar la terna actualice la vista de firma de inmediato (Funcional)

HU-02 pide que, al reasignar un RT de Calle o un Firmante, se actualice inmediatamente la vista de ruteo y de firma de los usuarios afectados. La vista de ruteo (Mapa del RT) ya lee la terna de la base, pero la vista de firma (Portal Firmante) y las pantallas que cuelgan de las mismas máquinas (Portal ECA, Monitoreo, avisos, paradas) leen máquinas fijas en memoria de FirmanteService, sin relación con los edificios reales ni con su terna. Esta Tarea hace que las máquinas de los edificios con terna asignada salgan de la base y que su RT, Firmante y ECA sean siempre los de la terna vigente: se actualiza al guardar la terna, al quitarla, al reasignar un RT desde el Semáforo, al editar o borrar el edificio y al arrancar la API.

**Condiciones de aprobación**

- 1. Dado un edificio con terna asignada, cuando el Firmante de la terna abre el Portal Firmante, entonces ve las máquinas de ese edificio (de la base) y no las de otro Firmante.
- 2. Dado un edificio con terna, cuando la Secretaría cambia el Firmante en Asignación de Roles, entonces el Firmante anterior deja de ver sus máquinas y el nuevo las ve en su siguiente consulta, sin reiniciar nada.
- 3. Dado un edificio en rojo, cuando la Secretaría confirma la reasignación del RT de Calle desde el Semáforo, entonces el RT de calle que figura en el Portal Firmante, el Portal ECA y el Monitoreo para las máquinas de ese edificio es el nuevo.
- 4. Dado un edificio al que se le quita la terna o que se elimina, cuando se consulta el Portal Firmante, entonces sus máquinas ya no aparecen a nombre del Firmante anterior.
- 5. Un Firmante solo puede autorizar o rechazar informes de las máquinas de sus edificios según la terna vigente: con la terna cambiada, el anterior recibe el mismo 404 que ante una máquina ajena.
- 6. Al reiniciar la API, las máquinas de los edificios con terna vuelven a salir de la base con la terna vigente.
- 7. Las pruebas existentes de las pantallas de firma, ECA, Monitoreo y Semáforo siguen en verde, y hay pruebas nuevas de cada criterio.

### RNF-01: Leer todas las ternas en una sola consulta (No funcional)

La pestaña Asignación de Roles de Trabajo hace un GET de roles por edificio al abrirse, cada uno con su transacción, sobre un pool de 5 conexiones con 2 s de espera. Con muchos edificios pueden fallar lecturas y la lista tarda lo que tarda la respuesta más lenta. Salió de la revisión del PR #18.

**Condiciones de aprobación**

1. La pestaña obtiene las ternas de todos los edificios con una sola llamada a la API.
2. Con 500 edificios cargados, abrir la pestaña no devuelve errores de lectura y se informa el tiempo medido.

## HU-04: HU-04: Semáforo de Control Mensual y Reasignación Operativa

### RF-01: Motor de Control Semafórico por Antigüedad de Visita (Funcional)

Calcular el color mensual de cada edificio para el mapa de la Secretaría. Definición del cliente (P2.c, cuestionario 06/11): un edificio pendiente toma el color del tramo del mes y pasa a verde en cuanto se inspecciona; el día 31 un pendiente es rojo. No hay seguimiento GPS de técnicos (P2.a, opción A).
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. Un edificio inspeccionado con éxito en el mes en curso está en verde, cualquiera sea el día.
2. Un edificio pendiente está en verde del día 1 al 10, en amarillo del 11 al 20 y en rojo del 21 al último día del mes, incluido el 31.
3. El 1.º de cada mes todos los edificios vuelven a pendiente.
4. El endpoint del semáforo devuelve, por edificio, su color, el día de la última inspección del mes y el RT de Calle asignado.

### RF-02: Mapa de la Secretaría con el semáforo de edificios y reasignación sugerida (Funcional)

Mapa de CABA para la Secretaría que muestra solo los edificios con el color del semáforo del mes (P2.a, opción A: sin técnicos en vivo). Para un edificio en rojo, el sistema sugiere al RT de Calle con menos edificios pendientes y la Secretaría confirma la reasignación (P2.d).
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. El mapa de la Secretaría muestra un pin por edificio con el color del semáforo del mes y una leyenda visible de los colores.
2. El mapa no muestra la ubicación de ningún técnico.
3. En un edificio en rojo, la acción "Reasignar" sugiere al RT de Calle con menos edificios pendientes del mes.
4. La reasignación se aplica recién cuando la Secretaría la confirma, y queda registrada con usuario, fecha, RT anterior y RT nuevo.

### RF-03: Refrescar el panel de reasignación cuando el RT del edificio cambió (Funcional)

Si la Secretaría confirma con una vista vieja (otra persona ya reasignó el edificio), la API responde 409 y la pantalla muestra el aviso, pero el panel sigue mostrando el RT y la sugerencia viejos hasta que se lo vuelve a abrir. Origen: observación de QA de HU-04 RF-02.

**Condiciones de aprobación**

1. Cuando la confirmación responde 409 porque el RT cambió, el panel muestra el mensaje y se vuelve a cargar solo: "RT actual" pasa a ser el RT vigente.
2. Después de recargarse, la sugerencia y la lista de candidatos corresponden al RT vigente y el RT vigente no figura entre los candidatos.
3. El botón "Confirmar reasignación" vuelve a quedar disponible sin cerrar el panel.
4. No se agrega ningún registro a "Reasignaciones registradas" por la confirmación rechazada.

### RF-04: [FIX] Script de entrega de HU-04 RF-02: la inspección de prueba la carga un RT y el login usa el certificado de mkcert (Funcional)

docs/pruebas/hu-04-.../RF-02-entrega.sh falla hoy 2 de sus 14 verificaciones aunque la app anda bien. La función inspeccionado() carga la inspección del 5/11 del edificio C2 con la sesión de la Secretaría; desde HU-06 RF-06 el checklist es solo del RT y el API responde 403, así que la inspección nunca se crea, el RT c queda con 2 pendientes en lugar de 1 (candidatos 'd:0,b:2,c:2' en vez de 'd:0,c:1,b:2') y la verificación «un edificio ya inspeccionado no cuenta como carga» falla. Además el login de la Secretaría de prueba usa curl sin el certificado de mkcert: contra https://localhost:8050 no ingresa y el script se corta. Es el mismo defecto que se corrigió en RF-02-datos-demo.sh (HU-11 RF-07). Se arregla solo este script: ningún archivo de apps/ cambia.

**Condiciones de aprobación**

1. docs/pruebas/hu-04-.../RF-02-entrega.sh carga la inspección del 5/11/2026 del edificio C2 ingresando con la sesión del RT c (el checklist es solo del RT), y si el API no la crea, el script corta e imprime el motivo en lugar de seguir con un SQL sobre un id inexistente.
2. El login de la Secretaría de prueba usa el certificado de mkcert igual que el resto de las llamadas: corrido contra https://localhost:8050 ingresa sin error de TLS.
3. Corrido contra https://localhost:8050 y contra http://127.0.0.1:3050, el script termina con "14 verificaciones OK, 0 fallidas", incluida «un edificio ya inspeccionado no cuenta como carga (c: 2 edificios, 1 pendiente)».
4. El modo --carga 20 termina con 0 consultas fallidas contra las dos direcciones.
5. Al terminar, la base no tiene usuarios RF02-ent-*, edificios de prueba ni filas de esos usuarios en intentos_login.
6. El diff del Pull Request toca solamente archivos bajo docs/pruebas/: ningún archivo de apps/ cambia.

### RNF-01: Índice por fecha para el semáforo y medición con volumen (No funcional)

La consulta del semáforo filtra inspecciones_checklist por created_at, que no tiene índice (sólo consorcio_id, maquina_id), y devuelve todos los edificios sin paginar. Se midió con 30 edificios (p95 12 ms) pero no con cientos. Origen: hallazgo de HU-04 RF-01.

**Condiciones de aprobación**

1. Una migración agrega un índice en inspecciones_checklist que cubre la consulta del semáforo por edificio y fecha.
2. Con 500 edificios y 20.000 inspecciones cargados, GET /api/semaforo responde con p95 menor a 500 ms en 100 consultas (se informa el valor medido).
3. El plan de ejecución de la consulta usa el índice nuevo (se adjunta el EXPLAIN).
4. El resultado del semáforo con el índice es idéntico al de antes: las pruebas de integración existentes siguen en verde.

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

### RF-03: [FIX] El backoffice rotula la foto del frente como «Frente de cabina y botonera» (Funcional)

En el detalle de una visita del backoffice la foto `frente` se rotula «Frente del edificio» (backoffice.logic.ts), mientras que el Portal Firmante y HU-17 RF-11 la llaman «Frente de cabina y botonera» (decisión del 23/11/2026: la foto es de la cabina, no del edificio). Hay que unificar el nombre para que nadie busque la fachada.

**Condiciones de aprobación**

1. Dado el detalle de una visita en el backoffice, cuando tiene la foto del frente, entonces se rotula «Frente de cabina y botonera» y no «Frente del edificio».
2. Las pruebas del backoffice (backoffice-acciones.spec.ts y las que nombran la etiqueta) se actualizan y siguen en verde, y ninguna parte de la aplicación vuelve a llamar «del edificio» a esa foto.

## HU-06: HU-06: Gestión de Fallas Críticas y Deslinde Legal

### RF-01: Recepción de Falla Crítica y Alerta Emergente en Secretaría (Funcional)

Implementar el pipeline de eventos ante fallas críticas cargadas por el RT de calle con disparo de notificación visual y sonora.

**Condiciones de aprobación**

1. Al registrarse un informe con falla critica (cables desgastados o limitador anulado), el servidor emite evento en tiempo real.
2. El panel de la secretaria despliega una notificacion emergente con aviso sonoro y enlace directo al informe.

### RF-02: Generación de PDF Legal MAICON S.R.L. y envío por email a la ECA (Funcional)

Generar el PDF formal de la falla con membrete de MAICON S.R.L. para el deslinde de responsabilidad, y el servicio que lo envía por email a la ECA. El envío NO se dispara al registrar la falla: lo invoca la aprobación de la Secretaría (tarea "Enviar los avisos a la ECA solo después de la revisión de la Secretaría", HU-11), porque el cliente pidió que nada salga sin revisión (P4 y cuestionario 06/11). Logo, membrete y textos legales los provee MAICON (P13.a); hasta tenerlos se usa un membrete provisorio. Remitente provisorio informado por el cliente en P10.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. El servicio genera un PDF con membrete de MAICON S.R.L., datos del edificio y la máquina, detalle de las fallas y las fotos adjuntas.
2. Registrar una Falla Crítica no envía ningún email: el envío ocurre solo cuando se lo invoca para un aviso aprobado.
3. Al enviarse, el PDF llega por email a la ECA del edificio y queda registrada la constancia de envío con fecha y hora.
4. Si el envío del email falla, queda registrado como "Envío fallido" con el motivo y se puede reintentar.

### RF-03: Lista de Fallas Críticas definida por el cliente (Funcional)

Hoy el sistema solo reconoce dos fallas críticas (cables desgastados y limitador anulado). El cliente definió la lista final (P3 y P6):
• Sala de Máquinas: Cables de tracción DESGASTADOS; Corte de fuerza motriz NO ACTÚA.
• Cabina: Botón de PARE Falla; Paracaídas Anomalía.
• Accesos: Destrabe manual TRABADO / INEXISTENTE; Cerradura no traba; Contacto eléctrico puenteado / falla; Espacio entre puertas mayor a 12 cm (requiere suplemento).
• Caja: Instalaciones ajenas SÍ; Espacios CON ABERTURAS; Límites superiores o inferiores FALLAN / ANULADOS.
• Fosa: Stop de fosa DEFICIENTE / INEXISTENTE.
• Solo hidráulicos: Aceite de batea insuficiente.
Sacó: pérdida de aceite crítica, limitador DEFICIENTE, tablero fuera de norma, puerta tijera, alarma, piso de madera, baranda de techo y extensión de cables.
Pendiente de confirmar con MAICON: si "limitador anulado" sigue siendo crítico (se mantiene hasta que responda) y si se agrega un ítem "frenos defectuosos", que hoy no existe en el checklist.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. El informe acepta cada uno de los ítems de la lista del cliente y cualquiera de ellos marcado genera la alerta de Falla Crítica.
2. Los ítems que el cliente sacó (pérdida de aceite, limitador deficiente, tablero, puerta tijera, alarma, piso, baranda, extensión de cables) se registran como falla común y no generan alerta crítica.
3. "Aceite de batea insuficiente" se acepta solo en máquinas hidráulicas; en una máquina de tracción el informe responde 400 con el motivo.
4. La alerta de la Secretaría muestra el nombre legible de cada falla crítica detectada, agrupada por zona (Sala de Máquinas, Cabina, Accesos, Caja, Fosa).

### RF-04: Alerta de Falla Crítica también al RT Firmante y alarma sonora hasta que se abra (Funcional)

El cliente pidió que la Falla Crítica se avise a la Secretaría y al RT Firmante del edificio (P4), y que la alarma sonora siga sonando hasta que alguien la abra (cuestionario 06/11). La persona de guardia fuera de horario queda pendiente: MAICON tiene que indicarla.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. Al registrarse una Falla Crítica, el RT Firmante asignado al edificio la ve en su portal como alerta nueva.
2. En la Secretaría la alarma sonora se repite hasta que un usuario abre la alerta; al abrirla deja de sonar en todas las pantallas de la Secretaría.
3. La alerta registra qué usuario la abrió primero y la fecha y hora.

### RF-05: Estado del ascensor: el RT lo marca y el Firmante lo confirma (Funcional)

Definición del cliente (P4 y cuestionario 06/11): "Reparación Urgente" = funciona con riesgo; "Fuera de Servicio" = no debe usarse. El RT de Calle marca el estado, el RT Firmante lo confirma en coordinación con la Secretaría, y se avisa a la Secretaría y al Firmante. Vuelve a "Normal" solo con una nueva inspección del RT con foto.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. El RT de Calle puede marcar una máquina como "Reparación Urgente" o "Fuera de Servicio"; el estado queda "Pendiente de confirmación" y se avisa a la Secretaría y al Firmante.
2. Solo el RT Firmante asignado al edificio puede confirmar o rechazar el estado; otro rol recibe 403.
3. El estado confirmado se ve en la ficha de la máquina y en el portal de la ECA.
4. Volver a "Normal" exige una nueva inspección del RT con al menos una foto; sin foto responde 400.

### RF-06: RT con sesión: fallas críticas y checklist solo para quien corresponde (Funcional)

Hoy cargar un informe de falla crítica (POST /api/fallas-criticas/informes) y las rutas del checklist (configuración, crear y ver inspecciones) no piden sesión: cualquiera puede registrar una falla crítica, que dispara el aviso a la Secretaría, y el inspector se toma del cuerpo del pedido. Pedir sesión, dejar que registren solo el RT, tomar el inspector de la sesión y hacer que el celular trabaje con esa sesión sin perder fallas críticas: la cola offline hoy descarta cualquier error 4xx, así que con sesión un 401 borraría una falla pendiente. Fuente: revisión de seguridad del 18/11/2026 (serie que empezó con el Portal ECA).

**Condiciones de aprobación**

1. Sin sesión, registrar un informe de falla crítica y las rutas del checklist (configuración, crear y ver inspecciones) responden 401.
2. Solo el RT registra informes de falla crítica y crea inspecciones; el resto de los roles recibe 403. La configuración y la lectura del checklist son para el RT, la Secretaría, el Administrador y el Firmante.
3. El inspector del informe de falla crítica es el usuario de la sesión, no el que venga en el cuerpo del pedido.
4. La cola del celular manda las fallas críticas con la sesión y, si la sesión venció, las conserva (no las descarta) y las manda al volver a ingresar.
5. El celular pide la configuración del checklist con la sesión, y sigue usando el respaldo local si no hay red o sesión.

### RF-07: Canal en tiempo real de fallas críticas con sesión (Funcional)

El canal de eventos de fallas críticas (GET /api/fallas-criticas/eventos, Server-Sent Events) es público: cualquiera lo abre y recibe en vivo cada falla crítica (edificio, dirección, máquina, inspector, ECA) y cada apertura de alerta, y a todo Firmante le llegan las de todos los edificios (el panel filtra en el navegador, que no es una barrera). Pedir sesión (Secretaría, Administrador y Firmante), que el Firmante reciba solo lo suyo, y hacer que el panel escuche con la sesión: EventSource no puede mandar el encabezado Authorization, así que el panel pasa a leer el canal con fetch. Como una conexión abierta no se vuelve a validar, el canal se cierra solo cada pocos minutos y el panel lo reabre con la sesión (renovándola), de modo que una sesión revocada deja de recibir. Fuente: revisión de seguridad del 18/11/2026 (serie que empezó con el Portal ECA).

**Condiciones de aprobación**

1. Sin sesión (o con un token inventado), el canal de eventos de fallas críticas responde 401 y no manda ningún evento.
2. Abren el canal la Secretaría, el Administrador y el Firmante; el RT y la ECA reciben 403.
3. El Firmante recibe por el canal solo las fallas críticas y las aperturas de alerta de sus edificios; la Secretaría y el Administrador reciben todas.
4. El canal se cierra solo pasado un tiempo (5 minutos) para volver a validar la sesión; el panel lo reabre renovando la sesión, y si la sesión fue revocada no lo reabre.
5. El panel de Secretaría y el del Firmante escuchan el canal con la sesión (sin EventSource), muestran las alertas como antes y se reconectan solos, con espera creciente, si se corta la conexión.

### RF-08: Guardar en PostgreSQL los informes de falla crítica y el estado del ascensor para que sobrevivan a un reinicio (Funcional)

Los informes de falla crítica que carga el RT (y su idempotencia por clientId), la alerta crítica de la máquina y el estado que el RT marca y el Firmante confirma están en memoria: un reinicio de la API los borra y la alerta desaparece del Portal ECA y de la Secretaría. Esta Tarea los guarda en la base.

**Condiciones de aprobación**

- 1. Dado un informe de falla crítica enviado por el RT, cuando se reinicia la API, entonces el informe y la alerta de la máquina siguen visibles para la Secretaría, el Firmante y la ECA que corresponden.
- 2. Dado un informe ya recibido con su clientId, cuando el celular lo reintenta después de un reinicio, entonces no se duplica ni se vuelve a avisar.
- 3. Dado un estado de ascensor marcado por el RT y confirmado o rechazado por el Firmante, cuando se reinicia la API, entonces el estado y la confirmación se mantienen.
- 4. Un RT solo ve sus informes y la ECA solo los de sus edificios, igual que antes del cambio.
- 5. Las pruebas existentes de fallas críticas y del canal en tiempo real siguen en verde, y una prueba de integración con la base real reinicia el servicio y comprueba los criterios 1 a 3.

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

### RF-04: Recargo del 45 % una sola vez por máquina no inspeccionada (Funcional)

Hoy la liquidación suma el 45 % cada vez que se liquida mientras el edificio tenga 3 advertencias (visitas-fallidas.service.ts, liquidación mensual). El cliente definió (cuestionario 06/11): el recargo se aplica una sola vez por máquina no inspeccionada, en la liquidación siguiente, y un Administrador puede anularlo indicando el motivo (P9).
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. Al llegar a la 3.ª advertencia, el recargo del 45 % se suma una sola vez, en la liquidación siguiente, por cada máquina no inspeccionada del edificio.
2. Las liquidaciones de los meses posteriores no vuelven a sumar el recargo, aunque el edificio siga bloqueado.
3. Un Administrador puede anular el recargo con motivo obligatorio; la anulación queda registrada con usuario, fecha y motivo, y la liquidación deja de incluirlo.
4. Otro rol que intente anular el recargo recibe 403.

### RF-05: Edificio bloqueado fuera del recorrido y mínimo 1 día entre visitas fallidas (Funcional)

Definiciones del cliente (P9 y cuestionario 06/11): las advertencias son consecutivas y solo se reinician con una visita exitosa; entre visitas fallidas tiene que pasar al menos 1 día; un edificio bloqueado sale del recorrido del RT hasta que la Secretaría lo desbloquea.
Pendiente de confirmar con MAICON: si "consorcio cerrado" y "administración que cancela" también suman advertencia (P9.a menciona solo "encargado o responsable ausente").
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. Un edificio bloqueado no aparece en la lista de edificios a visitar del RT.
2. La Secretaría puede desbloquear el edificio con motivo obligatorio; vuelve al recorrido y el desbloqueo queda registrado.
3. Una segunda visita fallida del mismo edificio en el mismo día responde 409 y no suma advertencia.
4. El contador de advertencias vuelve a cero solo con una visita exitosa.

### RF-06: Pantalla de constancia de visita fallida en el celular del RT (Funcional)

HU-07 describe el reporte del RT, pero nadie construye la pantalla. Al tocar "No se pudo realizar la inspección" se registra la constancia con GPS y hora no editables, causa y foto del ingreso.
Causa: el cliente confirmó solo "Encargado o responsable ausente" (P9.a); queda pendiente si "consorcio cerrado" y "administración que cancela" también cuentan, por eso la lista de causas es configurable.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. La pantalla exige elegir la causa; la causa por defecto es "Encargado o responsable ausente" y la lista sale de configuración.
2. "Guardar Advertencia de Visita" queda deshabilitado hasta tener causa y foto del ingreso.
3. El registro guarda coordenadas, precisión del GPS, hora del dispositivo y hora del servidor, y ninguna se puede editar.
4. Al guardar, el contador de advertencias del edificio suma 1 y el pin desaparece del mapa del RT por ese día; un segundo intento el mismo día se rechaza con el motivo.

### RF-07: FIX: La lista «Edificios pendientes de hoy» del RT no se queda en «Cargando…» sin conexión (Funcional)

En el celular del RT, sin señal, el mapa muestra los pines con los últimos datos descargados (HU-16 RF-05), pero la lista «Edificios pendientes de hoy» (RecorridoRt) queda para siempre en «Cargando tus edificios…». La causa: cargarRecorrido (visitasFallidas/constanciaVisita.ts) devuelve null cuando falla el pedido a /api/recorrido, y null es también el estado «cargando», así que la pantalla no distingue un error de una carga en curso. Se encontró en QA de HU-16 RF-05 sobre testing (4413966), con rt.beto en 360 px y la red cortada.

**Condiciones de aprobación**

- 1. Dado el RT sin conexión y sin una lista guardada, cuando abre el Mapa del RT, entonces la lista deja de decir «Cargando tus edificios…» y muestra un aviso claro de que no se pudo cargar por falta de conexión, con un botón «Reintentar».
- 2. Dado el RT que ya cargó la lista con conexión, cuando pierde la señal y vuelve a abrir la pantalla, entonces ve la última lista descargada y un cartel con la hora de esos datos, igual que los pines del mapa.
- 3. Dado que vuelve la conexión, cuando el RT aprieta «Reintentar» (o se recarga la pantalla), entonces la lista se actualiza desde /api/recorrido sin cerrar sesión.
- 4. Dado un error del servidor (respuesta no 2xx) con conexión, entonces se muestra el aviso de error con «Reintentar», no «Cargando…».
- 5. La lista guardada es solo la del RT que inició sesión: al cerrar sesión se borra y otro usuario en el mismo celular no la ve.
- 6. Las pruebas de la web cubren cargando, error sin conexión, error del servidor y lista guardada; npm run verify sigue en verde, y una prueba con Playwright en 360 px y la red cortada comprueba los criterios 1 y 2.

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

### RF-03: Rechazo del Firmante vuelve a la Secretaría y plazo de 5 días hábiles (Funcional)

Definición del cliente (cuestionario 06/11): si el Firmante rechaza un informe, vuelve a la Secretaría, no al RT de Calle. El Firmante tiene 5 días hábiles para autorizar; si no lo hace, se avisa a la Secretaría. El trámite ante la AGC se hace por fuera del sistema.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. El Firmante puede rechazar un informe con motivo obligatorio; sin motivo responde 400.
2. El informe rechazado aparece en la bandeja de la Secretaría con el motivo, y no en la del RT de Calle.
3. Un informe que lleva más de 5 días hábiles (lunes a viernes) sin autorizar genera un aviso a la Secretaría, una sola vez.
4. Un informe autorizado o rechazado dentro del plazo no genera aviso.

### RF-04: Portal del Firmante con sesión: cada Firmante ve y firma solo lo suyo (Funcional)

Hoy las rutas del Firmante (máquinas, autorizar y rechazar) no piden sesión: cualquiera puede autorizar o rechazar la firma AGC de cualquier máquina, porque autorizar y rechazar no controlan que la máquina sea del Firmante y la identidad sale de un header (con «gonza» por defecto). Pedir sesión de rol Firmante, tomar su identidad de la sesión, controlar que la máquina sea suya y hacer que el portal de la web trabaje con esa sesión; la Secretaría y el Administrador ven todo pero no autorizan. Fuente: revisión de seguridad del 18/11/2026 (serie que empezó con el Portal ECA).

**Condiciones de aprobación**

1. Sin sesión, las rutas del Firmante (máquinas, autorizar y rechazar) responden 401.
2. Un Firmante ve solo sus máquinas (según su sesión) y no puede autorizar ni rechazar la de otro Firmante (404, igual al de una máquina inexistente).
3. La Secretaría y el Administrador ven las máquinas de todos los Firmantes pero no autorizan ni rechazan (403); el RT y la ECA reciben 403 en todo.
4. La autorización y el rechazo quedan a nombre del usuario de la sesión.
5. La web funciona con la sesión: el Firmante ve, autoriza y rechaza lo suyo; la Secretaría ve todo sin esos botones.

### RF-05: Guardar en PostgreSQL las máquinas, visitas y firmas del Portal Firmante para que sobrevivan a un reinicio (Funcional)

Hoy las visitas, las firmas AGC, los rechazos y los avisos de plazo vencido del Portal Firmante viven en memoria de FirmanteService: cada reinicio de la API los borra, y con ellos lo que ven el Portal ECA, el Monitoreo y los avisos, que leen las mismas máquinas. Es un riesgo legal (una firma AGC autorizada se pierde). Esta Tarea las guarda en la base, con RLS por Firmante como el resto de los datos.

**Condiciones de aprobación**

- 1. Dada una visita registrada y una firma AGC autorizada por el Firmante, cuando se reinicia la API, entonces el Portal Firmante muestra la misma visita con la misma firma: fecha, protocolo AGC y quién la autorizó.
- 2. Dado un informe rechazado con su motivo, cuando se reinicia la API, entonces sigue rechazado, con el motivo, quién lo rechazó y la fecha, y sigue en la bandeja de la Secretaría.
- 3. Dado un aviso de plazo de 5 días hábiles vencido, cuando se reinicia la API, entonces el aviso no se pierde ni se genera de nuevo.
- 4. Dados dos Firmantes, cuando cualquiera consulta o firma después del reinicio, entonces cada uno ve y firma solo lo suyo, igual que antes.
- 5. El Portal ECA, el Monitoreo, las fallas críticas y las paradas siguen mostrando las mismas máquinas y estados, y las pruebas existentes de esas pantallas siguen en verde.
- 6. Una prueba de integración con la base real reinicia el servicio y comprueba los criterios 1 a 3.

### RF-06: Retirar las máquinas de ejemplo de la vista de firma (Funcional)

FirmanteService todavía arranca con 5 máquinas de ejemplo (Av. Corrientes 1234, Callao 850, Santa Fe 3200) que no existen en la base. Con las máquinas y las visitas guardadas en la base, los ejemplos sobran y confunden (en la demo, «Av. Santa Fe 3200» aparece dos veces). Esta Tarea los retira.

**Condiciones de aprobación**

- 1. Dada una API recién iniciada con edificios con terna, cuando se abre el Portal Firmante como Secretaría, entonces solo aparecen máquinas de esos edificios.
- 2. Dada una base sin ningún edificio con terna, cuando se abre el Portal Firmante, entonces se ve un mensaje de lista vacía y no un error.
- 3. Los scripts de entrega y las pruebas que usaban las máquinas de ejemplo usan los datos de demo de la base y siguen en verde.
- 4. Los Portales Firmante y ECA y el Monitoreo muestran los datos de demo reales (DEMO …) sin duplicados por dirección.

### RF-07: Que el informe cerrado por el RT cree la visita en el Portal Firmante (Funcional)

Hoy el informe que el RT cierra en el celular (HU-18) se guarda en la base pero no llega al Portal Firmante: las visitas que el Firmante ve y firma son las de las máquinas de ejemplo, y ninguna parte del sistema crea la visita de una máquina de un edificio con terna. Esta Tarea conecta los dos: al cerrarse el informe, cada equipo del informe pasa a ser la visita de su máquina en el mes (con sus fotos, la firma del encargado o el cierre «Sin firma»), usando FirmanteService.registrarVisita de HU-08 RF-05.

Decisión de producto del 23/11/2026 (German, opción A): el RT saca en cada equipo en uso la foto del frente de cabina y, si tiene cables de tracción, la de cables (HU-17 RF-11); la API las exige y las sella (HU-18 RF-02); el Portal pide la de cables sólo a los equipos que tienen cables (HU-08 RF-08). Esta Tarea toma esas fotos de cada equipo del informe (las claves «obligatoria:frente» y «obligatoria:cables» de sus fotos) y las pone como las fotos obligatorias de la visita. Se hace después de esas tres. HU-08 RF-06 (retirar las máquinas de ejemplo) va después de ésta.

**Condiciones de aprobación**

- 1. Dado un RT que cierra el informe de una visita a un edificio con terna, cuando el informe queda guardado, entonces cada máquina del informe aparece en el Portal Firmante del Firmante de la terna como «Recorrida», con la visita, las fotos obligatorias y la firma del encargado.
- 2. Dado un informe cerrado «Sin firma», cuando se abre el Portal Firmante, entonces la visita figura para revisión y no se puede autorizar hasta que tenga la firma del encargado o se resuelva.
- 3. Dado un equipo del informe que quedó fuera de servicio o con visita fallida, cuando se abre el Portal Firmante, entonces la máquina figura con el estado que corresponde («Advertencia» o «Pendiente de Visita») y no como recorrida.
- 4. Dado el mismo informe reenviado por el celular (mismo clientReportId), cuando llega de nuevo, entonces no se duplica la visita ni se pisa una firma ya autorizada.
- 5. Dada una visita creada desde un informe, cuando se reinicia la API, entonces sigue en el Portal Firmante con su firma o su rechazo (usa lo guardado de HU-08 RF-05).
- 6. Las pruebas existentes de informes y del Portal Firmante siguen en verde, y una prueba de integración con la base real cierra un informe y comprueba los criterios 1 y 5.

### RF-08: El Portal Firmante pide la foto de cables sólo a los equipos con cables de tracción (Funcional)

El Portal Firmante exige dos fotos fijas, «cables» y «frente», para autorizar una visita. Los ascensores hidráulicos no tienen cables de tracción (el checklist ya no les pregunta por ellos), así que hoy un hidráulico nunca se podría autorizar y su modal de auditoría marcaría «✗ Falta» en una foto que no existe. Esta Tarea hace que la foto de cables sólo se exija —en la API y en la pantalla— cuando la máquina es de tracción o montavehículos (o no tiene tipo cargado, que se toma como de tracción); la del frente se sigue exigiendo siempre. Es parte de la decisión del 23/11/2026 de pedir las fotos del frente y de cables en cada visita (HU-17 RF-11, HU-18 RF-02).

**Condiciones de aprobación**

1. Dada una máquina hidráulica con visita Recorrida, foto del frente y firma del encargado, cuando el Firmante autoriza, entonces se autoriza aunque la visita no tenga foto de cables.
2. Dada una máquina de tracción o montavehículos, o sin tipo, sin foto de cables, cuando se intenta autorizar, entonces se rechaza como hoy con el mensaje de las fotos que faltan.
3. Dada cualquier máquina sin foto del frente, cuando se intenta autorizar, entonces se rechaza como hoy.
4. Dado el modal de auditoría de una máquina hidráulica, cuando el Firmante lo abre, entonces la tarjeta de cables dice «No aplica (equipo hidráulico)» y no «Falta», y el botón Autorizar se habilita con la foto del frente y la firma.
5. Las pruebas del Portal Firmante (unitarias, e2e e integración con la base real) siguen en verde y se suman las del caso hidráulico.

### RF-09: Que el informe cerrado sólo cree visitas en las máquinas de su propio edificio (Funcional)

Hallazgo de QA del 24/11/2026 sobre HU-08 RF-07 (rama testing, 6220a60). Al cerrarse un informe, InformesService.sincronizarConPortalFirmante busca la máquina de cada equipo primero en el edificio del informe y, si no la encuentra, entre TODAS las máquinas del Portal por id o por código AGC. Si el informe de un edificio A trae un equipo que A no tiene (un dato viejo del celular, una máquina dada de baja, un error del cliente), la visita termina en la máquina del mismo código de OTRO edificio. Reproducido por HTTP: un informe del edificio A con un equipo «M9» que A no tiene responde 201, y la máquina M9 del edificio B queda con la visita de ese informe (inspector, fotos y firma del informe de A). Con eso el Firmante de B ve fotos y firma de otro edificio y podría autorizarlas. Esta Tarea corrige sólo eso y no cambia lo demás que hizo RF-07. Decisión que se propone y puede cambiarse antes de tomarla: rechazar el informe con 400 en lugar de cerrarlo sin visita para ese equipo (criterio 3).

**Condiciones de aprobación**

1. Dado un informe de un edificio A con un equipo cuya máquina no pertenece a A, cuando se envía, entonces ninguna máquina de otro edificio cambia de estado ni recibe visita (se comprueba leyendo GET /api/firmante/maquinas de los Firmantes de A y de B antes y después).
2. Dados dos edificios A y B con una máquina «M9» cada uno, cuando se cierra el informe de A con su propia «M9», entonces la visita queda sólo en la M9 de A y la M9 de B sigue sin cambios.
3. Dado el informe del criterio 1, cuando la API responde, entonces rechaza con 400, nombra el equipo que no es del edificio y no guarda ningún informe (la fila no existe en la base).
4. Los criterios 1 a 5 de HU-08 RF-07 siguen pasando: informe firmado → «Recorrida», «Sin firma» sin autorizar, equipo fuera de servicio fuera de «Recorrida», reenvío sin duplicar ni pisar una firma autorizada, y la visita sigue después de reiniciar la API.
5. Hay una prueba automática por HTTP y otra contra PostgreSQL real que reproducen el caso «M9» del criterio 1 y fallan con el código actual de testing.

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

### RF-04: Recordatorio a la ECA a las 24 h y aviso a la Secretaría a las 48 h sin acuse (Funcional)

Definición del cliente (cuestionario 06/11): si la ECA no acusa recibo de una alerta, a las 24 h se le manda un recordatorio y a las 48 h se avisa a la Secretaría.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. Una alerta sin acuse a las 24 h genera un recordatorio a la ECA, registrado en el historial de la alerta.
2. Una alerta sin acuse a las 48 h genera un aviso en la Secretaría con el edificio y la ECA.
3. Si la ECA acusa recibo antes, no se envía el recordatorio ni el aviso.
4. Cada recordatorio y aviso se envía una sola vez por alerta.

### RF-05: Que el acuse de recibo guardado se vuelva a leer al reiniciar la API y no se duplique por alerta (Funcional)

El acuse de recibo legal de ECA se guarda en acuses_recibo_legal pero nadie lo vuelve a leer: GET /api/eca/alertas lo informa desde memoria, así que al reiniciar la API la alerta vuelve a figurar sin acuse aunque la fila exista. Además cada POST inserta una fila nueva, sin unicidad por alerta. Origen: hallazgo de QA de HU-10 RF-03.

**Condiciones de aprobación**

1. Después de reiniciar la API, GET /api/eca/alertas muestra el acuseRecibo de las alertas que ya tienen una fila en acuses_recibo_legal, con su usuario y su fecha.
2. Un segundo POST del acuse de la misma alerta no crea una segunda fila y responde con el acuse ya registrado.
3. La base impide por sí misma dos acuses de la misma alerta (restricción de unicidad).
4. Un acuse registrado por otra ECA o en otra alerta no aparece en la alerta consultada.

### RF-06: FIX: Descarga del remito t�cnico en formato PDF oficial en Portal ECA (Funcional)

Reemplazar la descarga del remito t�cnico en formato JSON por un documento PDF formal de MAICON S.R.L. Todo contenido descargable en el portal debe ser en formato PDF (.pdf con Content-Type application/pdf), incluyendo membrete formal, datos del consorcio, m�quina, detalle de la falla cr�tica y registro fehaciente del acuse de recibo legal.

**Condiciones de aprobación**

1. Al presionar Descargar Remito de Notificacion en el Portal ECA, el archivo se descarga en formato PDF (.pdf) con Content-Type application/pdf.
2. El documento PDF contiene el membrete formal de MAICON S.R.L., datos del consorcio, maquina, detalles de la falla critica detectada y sello de notificacion legal.
3. La descarga del PDF registra el acuse de recibo legal en la base de datos (con usuario, fecha y hora exacta).
4. Las pruebas automatizadas verifican que el endpoint responde con un buffer PDF valido (%PDF-) y cabecera Content-Disposition con extension .pdf.

### RF-07: FIX: Los símbolos del remito PDF salen como caracteres rotos (Funcional)

El remito técnico en PDF usa los símbolos de advertencia y de tilde (y el título de la alerta puede traer emojis) que la fuente estándar del PDF no tiene: salen como «& þ» y «'». Reemplazarlos por palabras y limpiar el texto que viene de los datos para que ningún carácter salga roto, sin cambiar el contenido del documento. Fuente: verificación de QA de la tarjeta RF-06 de HU-10 del 18/11/2026.

**Condiciones de aprobación**

1. El texto del PDF no tiene caracteres fuera de la codificación de la fuente: ya no aparecen «& þ» ni otros símbolos rotos.
2. Los estados se leen como palabras, «ATENCIÓN» y «OK», en lugar de los símbolos de advertencia y de tilde.
3. Un título de alerta con emoji se imprime sin el emoji y sin dejar caracteres basura.
4. El membrete, los datos del consorcio, el diagnóstico y el acuse siguen iguales, y las pruebas del ECA siguen en verde.

### RF-08: Que un equipo marcado Fuera de Servicio o con Reparación Urgente genere la alerta del Portal ECA (Funcional)

Hallazgo de QA del 24/11/2026 al medir HU-08 RF-06 (rama testing, 6220a60). En toda la API la alerta crítica de una máquina (alertaCritica, lo que leen el Portal ECA, el Monitoreo, los avisos y el disparo de WhatsApp) sólo la crea el seed de FirmanteService.resetSeed: ALT-CP-001, ALT-MAICON-001 y ALT-MAICON-002. Cuando el RT marca un equipo «Fuera de Servicio» o «Reparación Urgente» con POST /api/paradas (HU-17), la API sólo cambia estadoOperativo y confirmacionEstado de la máquina y guarda el reporte: no crea ninguna alerta. La recepción de una falla crítica (HU-06 RF-01) tampoco la crea. Mientras existía el seed, el Centro de Alertas de HU-10 se podía mostrar con alertas de ejemplo. Al retirarlo (HU-08 RF-06) no queda ningún camino real que las genere, y tres scripts de entrega que andaban empeoraron: HU-10 RF-04 pasó de 5 a 1 comprobación pasada, HU-11 RF-04 de 6 pasadas y 0 fallas a 5 y 1, y HU-15 RF-02 de 18 a 10 pasadas. Esta Tarea conecta el reporte de parada real con la alerta de la máquina. Es lo que HU-08 RF-06 necesita para poder cumplir su criterio 3.

**Condiciones de aprobación**

1. Dado un edificio con terna cuyo equipo el RT marca «Fuera de Servicio» o «Reparación Urgente» con su causa y sus fotos (POST /api/paradas), cuando la ECA de la terna abre el Portal ECA, entonces el Centro de Alertas muestra una alerta de ese equipo con el edificio, la máquina, el tipo, la fecha de detección y la causa, sin que exista ninguna máquina de ejemplo.
2. Dada esa alerta, cuando la ECA descarga el remito y registra el acuse de recibo (HU-10 RF-02 y RF-03), entonces el acuse queda registrado con fecha y hora igual que con las alertas anteriores.
3. Dada esa alerta, cuando otra ECA abre su Portal ECA, entonces no la ve.
4. Dada esa alerta, cuando el RT normaliza el equipo (POST /api/paradas/maquinas/<id>/normalizar), entonces la alerta deja de figurar en el Portal ECA.
5. Dada esa alerta, cuando se reinicia la API, entonces sigue figurando: sale de lo que ya se guarda en la base (los reportes de parada) y no de la memoria.
6. Los scripts de entrega de HU-10 (RF-03 a RF-07), HU-11 (RF-04 y RF-06) y HU-15 (RF-02), que hoy dependen de ALT-CP-001, ALT-MAICON-001 y ALT-MAICON-002, crean su alerta por este camino y pasan sin las máquinas de ejemplo; la entrega informa cuántas comprobaciones pasan antes y después de cada script.

### RF-09: [FIX] Las alertas dejan de llevar la foto adentro: el remito, el aviso y el backoffice la piden por la ruta (Funcional)

HU-17 RF-12 hizo que la lista de paradas no trajera imágenes y que el Portal ECA pida la foto de su alerta por una ruta aparte (GET /api/paradas/:id/foto, con sesión). Pero la alerta de la máquina sigue llevando la foto adentro (fotografiaCabinaTrabada, una data URL en base64), así que GET /api/eca/alertas, GET /api/eca/maquinas y GET /api/firmante/maquinas siguen bajando una foto entera por alerta en cada consulta. No se pudo sacar en HU-17 RF-12 porque otras tres partes leen ese campo: el remito de la ECA (JSON y HTML, eca.controller), el aviso de la Secretaría con su enlace de 7 días sin sesión (avisos.service) y el detalle de visita del backoffice (backoffice.logic). Esta Tarea las pasa a pedir la foto por separado y saca la imagen de lo que devuelve la API: el remito y el aviso la toman del servidor, el aviso con enlace la sirve por una ruta propia del token (sin sesión, sólo mientras el enlace vale), y el backoffice la pide por la ruta con sesión. Se coordina con HU-11 RF-16 y RF-17, que tocan el servicio de avisos.

**Condiciones de aprobación**

1. Dados GET /api/eca/alertas, GET /api/eca/maquinas y GET /api/firmante/maquinas, cuando una alerta viene de un reporte de parada, entonces trae fotoRuta y ninguna imagen (ni base64 ni data URL); con 5 alertas con una foto de 500 KB cada una, cada respuesta pesa menos de 10 KB.
2. Dado el Portal ECA, cuando la ECA abre la alerta de un equipo fuera de servicio, entonces ve la foto de la cabina como hoy, pedida por la ruta con sesión una sola vez.
3. Dado el remito de una alerta (JSON y HTML), cuando la ECA lo descarga, entonces muestra la foto de la falla como hoy.
4. Dado el aviso de una falla crítica aprobado por la Secretaría, cuando el Firmante o la ECA abre el enlace sin sesión dentro de los 7 días, entonces ve la foto de la falla y el informe, y la foto sólo se sirve con ese enlace vigente: con el enlace vencido o inexistente no se entrega.
5. Dado el detalle de una visita en el backoffice, cuando la visita tiene una alerta con foto de cabina trabada, entonces la muestra como hoy.
6. Las pruebas existentes de HU-10, HU-11, HU-05 y HU-17 siguen en verde (se actualizan las que leen la imagen de la alerta en línea) y hay pruebas nuevas por HTTP y contra PostgreSQL real de los criterios 1, 3 y 4.

## HU-11: HU-11: Avisos automáticos de fallas críticas al Firmante y a la ECA

### RF-05: Enviar los avisos a la ECA solo después de la revisión de la Secretaría (Funcional)

El cliente pidió que ningún aviso salga automático: WhatsApp y PDF a la ECA se envían recién cuando la Secretaría revisa la falla y aprueba el envío (P4 y cuestionario 06/11). Hoy el disparo es automático e inmediato (< 5 s, POST /api/whatsapp/trigger-alerta-critica). Hay que reemplazarlo por una bandeja "Pendiente de revisión" en la Secretaría con la acción "Aprobar y enviar". El aviso va a la ECA y también al RT Firmante del edificio.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

Nota del 28/11/2026: la aplicación ya no usa WhatsApp; los avisos van por el chat interno (docs/decisiones/2026-11-28-retiro-de-whatsapp/README.md). Lo que esta Tarea dice de WhatsApp es historia: el aviso sigue sin salir hasta que la Secretaría lo aprueba, pero ahora sale por el chat (RF-16 de HU-11) y el código viejo se retira en RF-17.

**Condiciones de aprobación**

1. Al registrarse una Falla Crítica no se envía ningún WhatsApp ni email: el aviso queda en estado "Pendiente de revisión" y aparece en la bandeja de la Secretaría.
2. Cuando la Secretaría aprueba el aviso, se envían el WhatsApp a la ECA y al RT Firmante del edificio y el PDF legal por email a la ECA, y el aviso pasa a "Enviado".
3. El endpoint de disparo automático ya no envía nada sin aprobación: un pedido de envío de un aviso no aprobado responde 409 con el motivo.
4. El historial de envíos registra quién aprobó cada aviso y la fecha y hora de la aprobación.

### RF-06: Link del aviso sin contraseña y válido por 7 días (Funcional)

El cliente aceptó que el link del aviso abra el informe sin pedir contraseña, con vencimiento de 7 días (cuestionario 06/11). El link tiene que ser imposible de adivinar y mostrar solo el informe de ese aviso.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

Nota del 28/11/2026: la aplicación ya no usa WhatsApp; los avisos van por el chat interno (docs/decisiones/2026-11-28-retiro-de-whatsapp/README.md). El enlace viaja ahora en el mensaje del chat al Firmante y en el correo a la ECA.

**Condiciones de aprobación**

1. El link del aviso abre el informe de la falla sin iniciar sesión.
2. El link contiene un token aleatorio de al menos 128 bits; un token inexistente o alterado responde 404 sin revelar datos.
3. Pasados 7 días desde el envío, el link responde 410 con el mensaje "Este enlace venció" y no muestra el informe.
4. El link muestra únicamente el informe de ese aviso, no otros edificios ni otras fallas de la ECA.

### RF-07: FIX: Scripts de entrega desactualizados de HU-11, HU-15 y HU-18, y datos de demo de HU-04 (Funcional)

Seis scripts de entrega fallan hoy aunque la app anda bien, porque se escribieron antes de cambios posteriores: HU-18 RNF-01 suma clientReportId al recalcular el hash (el API no lo sella desde RNF-02); HU-11 RF-03 dispara un aviso que ahora queda pendiente de revisión; HU-11 RF-05 y RF-06 registran la falla crítica sin sesión de RT (desde el PR #82 el endpoint la exige); HU-15 RNF-01 y RNF-02 usan el header x-eca-actual, que RNF-03 reemplazó por la sesión. Además RF-02-datos-demo.sh de HU-04 tira un error SQL al cargar la inspección del 5/11, y los scripts que dependen de los datos de demo intentan ingresar aunque falten, con lo que bloquean la cuenta demo.secretaria 15 minutos. Se arreglan solo los scripts y el script de datos de demo: ningún archivo de apps/ cambia.

**Condiciones de aprobación**

1. docs/pruebas/hu-18-.../RNF-01-entrega.sh recalcula el hash por fuera sin el campo clientReportId, que el API no incluye en el contenido sellado, y termina con "Resultado: 18 ok, 0 con error".
2. docs/pruebas/hu-11-.../RF-05-entrega.sh y RF-06-entrega.sh registran la falla crítica ingresando antes con un usuario de rol rt_calle, y terminan con 0 fallas.
3. docs/pruebas/hu-11-.../RF-03-entrega.sh verifica que el disparo automático sobre un aviso pendiente de revisión responde 409 con el mensaje de que la Secretaría tiene que aprobarlo, que no sale ningún WhatsApp, y que una vez aprobado el envío queda como no realizado por falta de proveedor; termina con 0 fallas.
4. docs/pruebas/hu-15-.../RNF-01-entrega.sh y RNF-02-entrega.sh ingresan con una sesión (POST /api/auth/login) en lugar de mandar el header x-eca-actual, y terminan con 0 fallas.
5. docs/pruebas/hu-04-.../RF-02-datos-demo.sh carga los 5 edificios DEMO y la inspección del 5/11/2026 sin ningún error de SQL en la salida.
6. Los scripts que dependen de los datos de demo (HU-11 RF-05 y RF-06, HU-15 RF-02, HU-18 RF-01, RNF-01 y RNF-02) revisan antes que existan; si faltan, avisan que hay que correr RF-02-datos-demo.sh y salen con código 2 sin intentar ingresar, de modo que intentos_login queda sin filas de demo.secretaria.
7. Desde una base con los datos de demo recién cargados, los 12 scripts de entrega de HU-11 (RF-03 a RF-06), HU-15 (RF-01, RF-02, RNF-01, RNF-02 y RNF-03) y HU-18 (RF-01, RNF-01 y RNF-02), corridos uno tras otro, terminan con 0 fallas.
8. El diff del Pull Request toca solamente archivos bajo docs/pruebas/: ningún archivo de apps/ cambia.

### RF-11: Guardar en PostgreSQL los avisos de falla con su revisión y sus enlaces para que sobrevivan a un reinicio (Funcional)

Los avisos de falla crítica (pendientes de revisión, aprobados, con sus envíos) y los enlaces sin contraseña válidos 7 días están en memoria de AvisosService. Un reinicio borra los avisos que la Secretaría todavía no revisó y deja sin efecto los enlaces que ya llegaron por WhatsApp. Esta Tarea los guarda en la base.

Nota del 28/11/2026: la aplicación ya no usa WhatsApp; los avisos van por el chat interno (docs/decisiones/2026-11-28-retiro-de-whatsapp/README.md). Los envíos de WhatsApp que guarda se retiran en RF-17; el aviso y su enlace siguen guardándose.

**Condiciones de aprobación**

- 1. Dado un aviso «Pendiente de revisión», cuando se reinicia la API, entonces sigue pendiente en la bandeja de la Secretaría y se puede aprobar.
- 2. Dado un enlace de aviso enviado por WhatsApp, cuando se reinicia la API, entonces el enlace sigue abriendo el informe y vence a los 7 días de creado, no del reinicio.
- 3. Dado un aviso ya aprobado y enviado, cuando se reinicia la API, entonces no se vuelve a enviar y conserva el estado de cada envío.
- 4. Las pruebas existentes de avisos y del enlace siguen en verde, y una prueba de integración con la base real reinicia el servicio y comprueba los criterios 1 a 3.

### RF-15: Diagnóstico de seguridad con sesión: solo quien corresponde (las rutas de WhatsApp se retiraron) (Funcional)

Hoy las rutas que mandan WhatsApp (POST /api/whatsapp/enviar-alerta y trigger-alerta-critica), el formateador (formatear), el estado del proveedor (GET /api/whatsapp/estado) y el diagnóstico de RLS (GET /api/seguridad/rls) no piden sesión: cualquiera puede hacer que el número de la empresa mande un WhatsApp a un teléfono que elija (spam y costo por mensaje de Meta) y ver si hay proveedor configurado y cuál. Pedir sesión: enviar, disparar, formatear y ver el estado, solo Secretaría y Administrador; el diagnóstico de RLS, solo Administrador. Los webhooks de Meta y Twilio siguen sin sesión porque los llaman los proveedores, y ya rechazan lo que no viene firmado: se fija con pruebas. En el portal de la ECA, el botón manual de WhatsApp pasa a mostrarse solo a quien puede usarlo y a mandar con la sesión. Fuera de alcance, para otra tarjeta: ese botón manda a un teléfono fijo y con una dirección localhost fija. Fuente: revisión de seguridad del 18/11/2026 (serie que empezó con el Portal ECA).

Nota del 28/11/2026: la aplicación ya no usa WhatsApp; los avisos van por el chat interno (docs/decisiones/2026-11-28-retiro-de-whatsapp/README.md). Las rutas de WhatsApp que esta Tarea protegía se retiran en RF-17; el diagnóstico de seguridad (GET /api/seguridad/rls) sigue.

**Condiciones de aprobación**

1. Sin sesión, enviar-alerta, trigger-alerta-critica, formatear, el estado del proveedor y el diagnóstico de RLS responden 401, y no se envía ningún mensaje.
2. Enviar-alerta, trigger-alerta-critica, formatear y el estado del proveedor son solo de la Secretaría y el Administrador (el RT, el Firmante y la ECA reciben 403 y no se envía nada); el diagnóstico de RLS es solo del Administrador.
3. Los webhooks de WhatsApp siguen sin sesión (los llaman Meta y Twilio) y rechazan todo lo que no viene firmado: queda fijado con pruebas.
4. En el portal de la ECA, el botón «Despachar Alerta WhatsApp» solo aparece para la Secretaría y el Administrador, y el pedido lleva la sesión.
5. La bandeja de Avisos sigue mostrando el estado del proveedor y el historial de envíos a la Secretaría y al Administrador.

### RF-16: Los avisos aprobados por la Secretaría llegan al Firmante por el chat interno (Funcional)

Hoy, al aprobar un aviso de falla crítica, salen un WhatsApp a la ECA, un WhatsApp al Firmante y un correo con el PDF legal a la ECA. El cliente quiere usar el chat interno de la aplicación (HU-19) y no WhatsApp. Esta Tarea pone el chat en lugar de los WhatsApp: al aprobar, la Secretaría (o el Administrador) le manda al Firmante del edificio un mensaje privado desde su propio usuario, con la etiqueta del edificio y del equipo que ya usa el chat (HU-19 RF-07), el detalle de la falla y el enlace al informe. La ECA queda fuera del chat (HU-19, criterio 7: las ECA y los ajenos no tienen acceso): sigue recibiendo el aviso en su Portal ECA (alerta con acuse, HU-10) y por correo con el PDF legal, que ya existen. El estado del aviso es «Enviado» cuando el mensaje del chat y el correo salieron y «Falló el envío» si alguno no, con el motivo y el reintento que ya existen. Es el reemplazo del canal; retirar el código de WhatsApp es la Tarea siguiente. Decisión y diseño: docs/decisiones/2026-11-28-retiro-de-whatsapp/README.md. A confirmar por el cliente: que la ECA reciba el aviso por Portal y correo y no por el chat.

**Condiciones de aprobación**

1. Dado un aviso pendiente, cuando la Secretaría o el Administrador lo aprueba, entonces el Firmante del edificio recibe en el chat un mensaje privado de quien aprobó, con la etiqueta del edificio y del equipo, el detalle de la falla y el enlace al informe, y queda registrado quién aprobó y cuándo.
2. Dado un edificio cuyo Firmante no tiene usuario en el chat, cuando se aprueba el aviso, entonces el aviso queda «Falló el envío» con el motivo escrito («el Firmante no tiene usuario en el chat»), el aviso no se pierde y la Secretaría puede reintentar cuando se corrija.
3. Dado un aviso aprobado, cuando la ECA lo necesita, entonces lo recibe por su Portal ECA y por el correo con el PDF legal, como hasta ahora; ningún mensaje del aviso va a la ECA por el chat.
4. Dado un reintento de un aviso cuyo correo falló pero cuyo mensaje del chat ya salió, cuando la Secretaría reintenta, entonces no se manda de nuevo el mensaje del chat y el aviso pasa a «Enviado» si el correo sale.
5. Dado el mensaje del chat, cuando el Firmante abre el enlace, entonces ve la foto de la falla y el informe firmado sin pedir contraseña, y el enlace vence a los 7 días del envío.
6. Las pruebas de avisos y del chat siguen en verde y hay pruebas nuevas, unitarias, por HTTP y contra PostgreSQL real, de los criterios 1, 2 y 4.

### RF-17: [FIX] Retirar el envío por WhatsApp de la API (Funcional)

La aplicación ya no usa WhatsApp (decisión del 28/11/2026, docs/decisiones/2026-11-28-retiro-de-whatsapp/README.md). Cuando los avisos salen por el chat interno, el módulo de WhatsApp de la API sobra y es un riesgo: tiene rutas públicas de webhook, variables de entorno de proveedor y una tabla de historial de envíos. Esta Tarea retira del servidor todo lo de WhatsApp: la carpeta apps/api/src/whatsapp (conector, proveedor Meta y Twilio, formateador, disparador, webhook, historial), las rutas /api/whatsapp/*, sus variables de entorno, lo que AvisosService, el tipo CanalAviso y la configuración le piden, y sus pruebas. Los avisos que ya se guardaron con envíos de WhatsApp se siguen leyendo: esos envíos pasan a figurar como un canal histórico y no se envía nada más. Se hace después de que los avisos salgan por el chat.

**Condiciones de aprobación**

1. Dado el servidor, cuando se piden las rutas /api/whatsapp/estado, /api/whatsapp/enviar-alerta, /api/whatsapp/trigger-alerta-critica y los webhooks de Meta y de Twilio, entonces responden 404 y la carpeta apps/api/src/whatsapp ya no existe.
2. Dado un aviso que se aprueba, cuando se envía, entonces no se llama a ningún proveedor de WhatsApp: los canales del aviso son sólo el chat al Firmante y el correo a la ECA, y el tipo CanalAviso ya no tiene canales de WhatsApp (salvo el histórico del criterio 3).
3. Dado un aviso guardado antes con envíos de WhatsApp, cuando se lo lee, se lo lista o se lo reintenta, entonces se lee igual y sus envíos viejos figuran con el canal histórico «whatsapp_retirado»; una migración de datos reescribe esos canales y elimina la tabla del historial de envíos de WhatsApp (whatsapp_envios), y una prueba con la base real lo comprueba.
4. Dada la configuración, cuando se mira config.ts y .env.example, entonces no hay variables WHATSAPP_*, ni de Meta ni de Twilio; y si un .env viejo todavía las trae, la API arranca igual y las ignora, avisándolo una sola vez en el registro.
5. Las pruebas propias de WhatsApp (whatsapp*.spec y e2e/int) se retiran junto con el código; el resto de las pruebas de la API (npm run verify y npm run test:int) sigue en verde, y apps/api no menciona WhatsApp salvo el canal histórico y la prueba de la migración.

### RF-18: [FIX] Retirar WhatsApp de las pantallas (Funcional)

Las pantallas todavía hablan de WhatsApp: la bandeja de avisos de la Secretaría («WhatsApp activo», el estado de cada envío y el historial), el Portal ECA y las alertas críticas, el menú y los estilos. Esta Tarea las pone al día con el canal nuevo: por cada aviso se ve el estado del mensaje al Firmante por el chat y el del correo a la ECA, y los envíos viejos de WhatsApp se muestran como «WhatsApp (retirado)», sólo para leer. Se hace después de retirar WhatsApp de la API. Decisión: docs/decisiones/2026-11-28-retiro-de-whatsapp/README.md

**Condiciones de aprobación**

1. Dada la bandeja de avisos de la Secretaría, cuando se la abre, entonces cada aviso muestra el estado del mensaje al Firmante por el chat interno y el del correo a la ECA, y no aparece «WhatsApp activo» ni el estado ni el historial de envíos de WhatsApp.
2. Dado un aviso con envíos viejos de WhatsApp, cuando se lo mira, entonces esos envíos figuran como «WhatsApp (retirado)», sin botón de reintento.
3. Dado el Portal ECA y las alertas críticas, cuando se los mira, entonces ningún texto ni ícono nombra WhatsApp (donde decía que el aviso llegaba por WhatsApp, dice que llega por el Portal y por correo).
4. Dado el menú, el buscador y las hojas de estilo, cuando se revisan, entonces no ofrecen nada de WhatsApp ni quedan clases de WhatsApp sin uso.
5. La web compila, sus pruebas siguen en verde y una prueba con Playwright, en un celular de 360 px, recorre la bandeja de avisos con un aviso nuevo y uno viejo, con capturas.

### RF-19: [FIX] Retirar WhatsApp de la documentación, la configuración y los datos de demo (Funcional)

Después de retirar WhatsApp del servidor y de las pantallas, quedan menciones en la documentación (el manual de uso, el README, unos 40 documentos de entrega en docs/pruebas), en la configuración de ejemplo y en los scripts de demo. Esta Tarea las deja al día: lo que documentaba tareas que ya no existen se archiva (con un índice que explica por qué), lo que sigue vigente se corrige, y el manual de uso explica cómo llega un aviso ahora (chat interno al Firmante; Portal y correo a la ECA). Se hace al final. Decisión: docs/decisiones/2026-11-28-retiro-de-whatsapp/README.md

**Condiciones de aprobación**

1. Dado el repositorio, cuando se busca «whatsapp» sin distinguir mayúsculas, entonces sólo aparece en docs/archivo/whatsapp/ (lo archivado), en docs/decisiones/2026-11-28-retiro-de-whatsapp/ y en la migración que retira el historial.
2. Dados los documentos de entrega, guías y scripts de docs/pruebas que describían tareas borradas, cuando se mira docs/pruebas, entonces están en docs/archivo/whatsapp/ con un README que dice qué eran y por qué se archivaron, y los que siguen vigentes (revisión de la Secretaría, enlace, persistencia de avisos, seguridad) ya no nombran WhatsApp.
3. Dado el manual de uso, cuando se lee la parte de avisos de fallas críticas, entonces explica cómo llega un aviso al Firmante (chat interno) y a la ECA (Portal ECA y correo), con las pantallas actuales.
4. Dados el README, .env.example y los scripts de demo (scripts/visual-run.mjs y los de datos de demo), cuando se los lee, entonces no piden credenciales ni números de WhatsApp.
5. Los scripts de entrega que siguen vigentes corren sin errores después del cambio.

## HU-12: HU-12: Interfaz NEO Linear, Sidebar Colapsable y Buscador Global Inline

### RF-01: Shell Visual NEO Linear (Dark/Light), Sidebar Colapsable, Cobertura Neón y Buscador Global Inline (Funcional)

Implementar el sistema visual NEO estilo Linear con soporte Dark/Light, vista bento 'Estado del sistema', sidebar colapsable a 80px con ícono de expandir al lado del logo violeta sin superposición, estilos neón en Medidor de Cobertura y buscador global inline en barra superior en reemplazo de Ctrl+K.

**Condiciones de aprobación**

1. El shell principal ofrece botón 'Cambiar tema visual' entre modo oscuro y claro y botón 'Alternar barra lateral' que al colapsar a 80px mantiene expandir al lado del cuadrado violeta sin superposición.
2. La barra superior incluye el buscador inline con placeholder 'Buscar consorcio, máquina (M1, M2) o portal…' sin modal Ctrl+K; al escribir muestra resultados agrupados y al elegir uno navega directo al consorcio en Secretaría o modal de auditoría en Firmante.
3. El Medidor de Cobertura Mensual en Portal ECA aplica recuadros con colores neón diferenciados de alto contraste para 'Inspeccionadas', 'Firmadas (Legal AGC)', 'Pendientes de Visita', 'Con Advertencia' y 'Flota Total'.

### RF-02: FIX: Corregir contraste de textos y contenedores en Modo Oscuro (Funcional)

Corregir en styles.css los fondos claros heredados (.audit-grid en ModalAuditoria, --surface-sunken en formulario de visita fallida y total de facturación, cartel de bloqueo por tercera visita, badges y textos atenuados) cuando data-theme='dark' está activo para garantizar lectura legible en todo el sistema.

**Condiciones de aprobación**

1. En Portal Firmante (ModalAuditoria), el bloque '1. Estado de la Inspección' (.audit-grid) muestra fondo oscuro (--card-subtle) y texto legible de alto contraste (--text / --muted) en modo oscuro sin fondo blanco.
2. En Secretaría (FichaConsorcio), las cajas '--surface-sunken' (formulario de visita fallida y fila total de facturación), el cartel de bloqueo por tercera visita y los indicadores de recargo del 45% muestran colores contrastados en modo oscuro.

### RF-03: FIX: Mostrar las horas en formato de 24 horas en toda la app (Funcional)

La web formatea fechas y horas con toLocaleString('es-AR') sin indicar el ciclo horario. En Chrome eso escribe las 15:15 como «21/11/2026, 03:15:00», sin a. m. ni p. m., así que una alerta de la tarde parece de la madrugada. Hay 23 usos en 9 archivos: avisos/BandejaAvisos.tsx (4), consorcios/FichaConsorcio.tsx (7), eca/AlertasCriticas.tsx (3), checklist/InspeccionCampoView.tsx (2), fallas/AlertaFallaCritica.tsx (2), firmante/ModalAuditoria.tsx (2), informe/cola.ts (1), mapa/descarga.ts (1) y visitasFallidas/ConstanciaVisitaFallida.tsx (1). backoffice/monitoreo.ts ya lo hace bien con hourCycle 'h23' y la zona America/Argentina/Buenos_Aires. Se encontró en QA de HU-11 RF-10 sobre testing (4413966).

**Condiciones de aprobación**

- 1. Dada una fecha con hora de la tarde (por ejemplo 15:15 de Buenos Aires), cuando se muestra en cualquier pantalla de la app, entonces se lee «15:15» y nunca «03:15» sin a. m./p. m.
- 2. Todas las fechas con hora de la web salen de una única función de formato compartida, con hourCycle 'h23' y la zona America/Argentina/Buenos_Aires; en apps/web/src no queda ningún toLocaleString o toLocaleTimeString con hora que no la use.
- 3. Las fechas sin hora no cambian.
- 4. Una prueba de la función de formato cubre la mañana, la tarde, la medianoche (00:xx) y un navegador en otra zona horaria; npm run verify sigue en verde.
- 5. Una captura con Playwright de la bandeja de avisos y de la ficha del edificio muestra una hora de la tarde en formato de 24 horas.

### RF-04: Retirar la telemetría de «Estado del sistema» y dejar el mapa sin conexión en su pestaña (Funcional)

La vista «Estado del sistema» muestra un encabezado y cuatro tarjetas (Backend NestJS, Base de datos PostgreSQL + PostGIS, Modo offline PWA e Interfaz) con texto técnico de desarrollo («Proxy local /api → puerto :3050», «Rama experimental local GONZA») que no le sirve a nadie que use la aplicación. Retirar ese encabezado y esas tarjetas. Debajo de ellas vive el panel «Mapa de CABA sin conexión» (HU-16 RF-03), donde el RT baja el mapa al celular con wifi: se conserva, y la pestaña pasa a llamarse «Mapa sin conexión» (menú lateral, barra inferior del celular y buscador global). El endpoint GET /api/health no se toca (lo piden RO-01 RF-01 y los chequeos de despliegue). El indicador chico «API + PostGIS OK» del pie del menú lateral sigue como indicador, pero ya no lleva a esa pestaña. Se corrige el criterio 1 de HU-12 RF-01, que nombra la «vista bento Estado del sistema», y las guías y scripts de entrega que la citan (HU-12 RF-01, HU-16 RF-03, RO-01 RF-01). Pedido del usuario del 25/11/2026.

**Condiciones de aprobación**

1. La pestaña que antes se llamaba «Estado del sistema» ya no muestra el encabezado «Estado del sistema» ni las tarjetas de Backend, Base de datos, Modo offline e Interfaz.
2. Esa pestaña se llama «Mapa sin conexión» en el menú lateral y en el buscador global, y «Sin conexión» en la barra inferior del celular, y sigue mostrando el panel «Mapa de CABA sin conexión» con su botón para bajar el mapa, que funciona igual que antes.
3. El indicador «API + PostGIS OK» del pie del menú lateral sigue informando el estado de la API, y ya no lleva a la pestaña del mapa.
4. GET /api/health responde igual que antes (estado de la API y versión de PostGIS) y la aplicación ya no muestra ninguna de las tarjetas que lo leían.
5. El criterio 1 de HU-12 RF-01 ya no nombra la vista bento «Estado del sistema», y las guías y scripts de entrega de HU-12 RF-01, HU-16 RF-03 y RO-01 RF-01 describen la pantalla actual y siguen pasando.

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

## HU-14: HU-14: Acceso por rol y sesión en el celular

### RF-01: API de autenticación y roles (Funcional)

Login con usuario y contraseña, sesión con token de acceso corto y token de refresco en cookie httpOnly, y control de acceso por rol (RT de Calle, Secretaría, Firmante, ECA, Administrador) en todas las rutas.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. POST /api/auth/login responde 200 con credenciales válidas y 401 con inválidas, con el mismo mensaje exista o no el usuario.
2. La contraseña se guarda con bcrypt, costo 12 o superior; nunca en texto plano ni en los logs.
3. El token de acceso vence a los 15 minutos y se renueva con un token de refresco guardado en cookie httpOnly, Secure y SameSite.
4. Una ruta con rol requerido responde 401 sin sesión y 403 con un rol distinto.
5. Tras 5 intentos fallidos seguidos para el mismo usuario, el login responde 429 durante 15 minutos.

### RF-02: Pantalla de ingreso (Funcional)

Pantalla de login de la PWA, pensada primero para el celular del RT.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. La pantalla muestra el logo de MAICON S.R.L., "Usuario / Email", "Contraseña" con opción de ver u ocultar, e "Ingresar al Sistema".
2. Con credenciales válidas redirige a la pantalla inicial del rol; el RT de Calle entra a su mapa.
3. Con credenciales inválidas muestra el error y no navega.
4. En un celular de 360 px de ancho la pantalla se usa sin desplazamiento horizontal.
5. Una sesión ya iniciada sigue disponible sin señal hasta que el RT cierra sesión.

### RF-03: Cargar en los datos de demo un Firmante y un usuario de ECA con sesión (Funcional)

Los datos de demostración tienen Secretaría, Administrador y cuatro RT, pero ningún Firmante ni usuario de ECA: para probar esos portales con sesión hay que crear las cuentas a mano. Esta Tarea las suma al script de datos de demo.

**Condiciones de aprobación**

- 1. Dado el script de datos de demo, cuando se corre, entonces existen un Firmante y un usuario de ECA que ingresan con la clave de demo.
- 2. Dado el Firmante de demo, cuando abre el Portal Firmante, entonces ve las máquinas de los edificios cuya terna lo nombra, y no las de otros.
- 3. Dado el usuario de ECA de demo, cuando abre el Portal ECA, entonces ve solo los edificios de su ECA.
- 4. Dado que el script se corre dos veces, entonces no duplica ni falla.

### RNF-01: Consentimiento de ubicación y revocación de sesiones (No funcional)

Los RT usan su celular personal (P2), así que la ubicación es un dato personal (Ley 25.326): se pide consentimiento informado y solo se toma al validar la presencia, sin seguimiento. Un Administrador tiene que poder cortar el acceso de un celular perdido o de un RT que deja la empresa.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. En su primer ingreso el RT ve el aviso de uso de ubicación (para qué, cuándo se toma y quién la ve) y no puede seguir sin aceptarlo; la aceptación queda registrada con fecha y versión del texto.
2. La app toma la ubicación solo al iniciar una inspección o registrar una visita fallida; no hay seguimiento en segundo plano.
3. Un Administrador puede revocar las sesiones de un usuario; desde ese momento el refresco y cualquier envío de ese celular responden 401.
4. Al recibir el 401 por revocación, la app cierra la sesión y lo informa; lo pendiente no se envía hasta un nuevo ingreso válido.

## HU-15: HU-15: Aislamiento de datos entre ECA

### RF-01: Asociar la ECA al usuario y exponerla en la sesión (Funcional)

Un usuario con rol eca hoy no sabe a qué Empresa Conservadora pertenece. Se agrega la ECA al usuario (el mismo nombre que figura en consorcios.eca_nombre) y el guard la deja disponible en la petición, para que el RLS la tome de la sesión.
Origen: revisión de los PRs #28 y #29 contra la API de autenticación de HU-14 (12/11/2026). El middleware del RLS toma la ECA y el rol de los headers x-eca-actual y x-rol-actual, que cualquier cliente puede mandar; y los usuarios no tienen ECA asociada.

**Condiciones de aprobación**

1. POST /api/usuarios con rol "eca" exige el campo "eca" (nombre de la ECA); sin él responde 400. Con cualquier otro rol, "eca" se rechaza con 400.
2. El login, el refresco y GET /api/auth/me devuelven la "eca" del usuario cuando tiene una.
3. El guard deja la ECA en la petición (req.usuario.eca), tomada de la base en cada pedido: cambiarle la ECA a un usuario vale en el pedido siguiente.
4. La migración agrega la columna sin romper usuarios existentes, y un test de integración contra PostgreSQL real la verifica.

### RF-02: Portal ECA con sesión: cada ECA ve solo lo suyo (Funcional)

Hoy las rutas del portal ECA (alertas, cobertura, máquinas, remito y acuse) no piden sesión: cualquiera puede verlas y registrar un acuse legal con el usuario que escriba en la URL, y la ECA se toma de un header que cualquiera puede cambiar. Pedir sesión de rol ECA (con Secretaría y Administrador viendo todas las ECA), tomar la ECA y el usuario del acuse desde la sesión y hacer que el portal de la web trabaje con esa sesión. Fuente: revisión de seguridad del 18/11/2026 (el guard de la API es abierto por defecto: una ruta sin @Roles es pública).

**Condiciones de aprobación**

1. Sin sesión, las rutas del portal ECA (alertas, cobertura, máquinas, remito y acuse) responden 401.
2. Un usuario ECA solo ve y descarga lo de su ECA: la ECA sale de su sesión, un header o parámetro con otra ECA se ignora y una alerta de otra ECA da 404.
3. Secretaría y Administrador ven cualquier ECA; RT y Firmante reciben 403.
4. El usuario del acuse legal es el de la sesión, aunque la URL traiga otro usuario.
5. El portal de la web funciona con la sesión: al ingresar como ECA se ven sus alertas y se descarga el remito.

### RNF-01: Row Level Security por ECA (No funcional)

Aislar los datos de cada ECA en la base con Row Level Security de PostgreSQL, para que un error en una consulta no pueda mostrar datos de otra ECA.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Toda tabla con datos de una ECA tiene RLS activo con una política por ECA.
2. La API se conecta con un usuario de base sin permiso BYPASSRLS y que no es dueño de las tablas.
3. Una consulta sin contexto de ECA devuelve 0 filas.
4. Un test automático crea datos de 2 ECA y falla si una puede leer filas de la otra.

### RNF-02: Acceso de RT y Firmante a edificios de varias ECA (No funcional)

El RT de Calle y el Firmante trabajan para varias ECA: ven lo que tienen asignado en la terna de roles (HU-02), sin importar la ECA.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Un RT de Calle ve solo los edificios asignados a él, sin importar la ECA.
2. Un Firmante ve solo las máquinas de los edificios donde figura como Firmante.
3. Al quitar una asignación, ese usuario deja de ver el edificio en la siguiente consulta.

### RNF-03: Tomar la ECA y el rol del RLS desde la sesión del usuario (No funcional)

El contexto del RLS (eca, rol, usuario) tiene que salir de la sesión verificada (req.usuario), no de headers del cliente. El middleware corre antes que el guard, así que el contexto se arma en el guard o en un interceptor. Se elimina el fallback a una ECA por defecto: sin sesión no hay datos.
Origen: revisión de los PRs #28 y #29 contra la API de autenticación de HU-14 (12/11/2026). El middleware del RLS toma la ECA y el rol de los headers x-eca-actual y x-rol-actual, que cualquier cliente puede mandar; y los usuarios no tienen ECA asociada.

**Condiciones de aprobación**

1. El contexto de RLS se arma con la ECA, el rol y el usuario de la sesión verificada. Los headers x-eca-actual, x-rol-actual y x-usuario-actual se ignoran.
2. Un usuario de la ECA A que manda x-eca-actual con la ECA B sigue viendo solo los datos de la ECA A. Un test automático lo verifica y falla si ve filas de la B.
3. Una petición sin sesión a una ruta con datos de ECA responde 401, y ninguna ruta cae a una ECA por defecto (RLS estricto siempre activo, sin variable de entorno).
4. El RT de Calle y el Firmante siguen viendo solo los edificios que tienen asignados, de cualquier ECA, y nuestro consentimiento de ubicación sigue funcionando con el usuario de aplicación del RLS (npm run test:int en verde).

## HU-16: HU-16: Mapa del RT y llegada al edificio

### RF-01: Mapa del RT con pines por horario (Funcional)

Pantalla inicial del RT en el celular: mapa con sus edificios pendientes, coloreados según estén abiertos ahora. Es un mapa distinto del de la Secretaría (que muestra el semáforo del mes).
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. El encabezado muestra saludo, zona y hora actual, como "Hola Ing. Aliado 1 | Zona Norte | 11:30 hs".
2. Una función de cálculo devuelve verde (abierto), rojo (cerrado) o amarillo ("A coordinar"), con tests para dentro de franja, fuera de franja, feriado y "A coordinar".
3. Los pines cambian de color al cruzar una franja horaria sin recargar la pantalla, y el mapa muestra la leyenda de colores.
4. El mapa no muestra edificios de otro RT, ni los ya resueltos en el día, ni los bloqueados.
5. En un celular de 360 px de ancho el mapa y el encabezado se usan sin desplazamiento horizontal.

### RF-02: Tarjeta del edificio y validación de presencia a 30 m (Funcional)

Tarjeta de contacto del edificio y botones de inicio que aparecen recién a 30 m (P1). Si el GPS no logra precisión suficiente, se permite con foto del frente y justificación, y la Secretaría lo revisa (P1 y P1.c).
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Al tocar un pin se muestran dirección, estado, encargado y horarios; el botón de llamada abre el marcador con el teléfono del encargado y "Cómo llegar" abre Google Maps con destino en el edificio.
2. A 30 m o menos aparecen "Iniciar Inspección" y "No se pudo realizar la inspección"; más lejos no aparecen.
3. Si la precisión del GPS no alcanza, aparece "Sin buena señal GPS", que exige foto del frente y justificación escrita, y marca la visita para revisión de la Secretaría.
4. Al iniciar se registran coordenadas, precisión, hora del dispositivo y hora del servidor, y ninguna se puede editar.

### RF-03: Mapa base de CABA propio, que se dibuja sin conexión (Funcional)

El mapa de hoy es un dibujo fijo de 600×260 con tres avenidas dibujadas a mano, sin relación exacta con las calles reales, y no sirve para ubicarse en la calle. El RT trabaja muchas veces sin wifi y sin señal, así que el mapa tiene que dibujarse completo aun sin conexión, y eso descarta usar los mosaicos del servidor público de OpenStreetMap: su política prohíbe descargarlos para uso sin conexión. La opción es un mapa vectorial propio: un archivo PMTiles con las calles de CABA, generado una vez desde los datos de OpenStreetMap con un script propio que lee la compilación diaria de Protomaps (hace lo mismo que la herramienta pmtiles extract, sin depender de un ejecutable externo) (recuadro de CABA: longitud -58.535 a -58.335, latitud -34.705 a -34.525), que el servidor de la app entrega y el celular guarda para usarlo sin señal. Esta tarea deja listo el mapa base y su descarga; dibujar los pines es la tarea siguiente.

**Condiciones de aprobación**

1. Un script bajo scripts/ (npm run mapa:generar) genera el archivo de mapa de CABA a partir de una compilación de Protomaps con fecha, con el recuadro de CABA y un zoom máximo de 15 o menos, y deja anotados la fecha y la fuente; el mapa se dibuja sin pedirle nada a ningún servidor de mapas de terceros.
2. Las tipografías y los íconos que necesita el estilo del mapa también salen del servidor de la app, no de un tercero.
3. El archivo pesa 60 MB o menos (si pesa más, se baja el zoom máximo); el tamaño real queda anotado en el documento de entrega.
4. Un botón «Descargar mapa para usar sin señal» baja el archivo una sola vez, con un indicador de avance, y lo guarda en el celular de modo que el mapa lo lea desde ahí.
5. Con el mapa ya descargado y la red cortada (modo avión), el mapa base de CABA se dibuja completo, con calles y nombres de calles, y se puede acercar y desplazar entre los zooms 10 y 15; una prueba con Playwright corta la red y lo verifica.
6. Si el mapa no se descargó y no hay red, la pantalla dice «Mapa sin descargar: conectate a una red para bajarlo» y no queda un recuadro en blanco ni roto.
7. El mapa muestra la atribución «© OpenStreetMap contributors» y la del proveedor del estilo.
8. Cuando el servidor tiene una versión más nueva del archivo, la app lo avisa y la actualiza sin borrar la versión anterior hasta que la nueva termine de bajar.

### RF-04: Componente de mapa con pines por estado, zoom y nombres que no se pisan (Funcional)

Un componente de mapa nuevo, con MapLibre GL JS, que reemplaza al dibujo actual (MapaUbicacionConsorcio) y se apoya en el mapa base de la tarea anterior. Mantiene lo que el componente de hoy ya hace —pines de color por estado, elegir un edificio con clic o teclado, fijar una ubicación tocando el mapa— y corrige lo que hoy está mal: las posiciones salen distorsionadas porque el recuadro de CABA se estira, los nombres se pisan o se cortan y no hay zoom ni desplazamiento. Mismo contrato de datos que el componente actual, para poder cambiarlo pantalla por pantalla.

**Condiciones de aprobación**

1. El componente recibe los mismos datos que el actual (marcadores con id, etiqueta, color y subtítulo; una ubicación única; modo editable para fijar un punto) y se dibuja sobre el mapa base de CABA propio.
2. Los pines se ubican por latitud y longitud reales, sin distorsión: dos edificios a 500 metros de distancia se ven a 500 metros en el mapa; una prueba lo verifica con coordenadas conocidas.
3. El mapa se acerca y se aleja con la rueda y con el pellizco, se desplaza arrastrando, y al abrirse encuadra a todos los edificios con margen.
4. Los nombres de los edificios no se pisan: con 20 edificios cercanos, las etiquetas de menor prioridad se ocultan (los rojos primero) y reaparecen al acercar; el pin siempre se ve.
5. Cada pin se puede elegir con clic o con teclado y mantiene su aria-label «Nombre. Color: estado», igual que hoy.
6. El mapa sigue el tema claro u oscuro de la app.
7. En modo editable, tocar el mapa fija la ubicación y devuelve latitud y longitud con 6 decimales, y el pin se puede arrastrar para ajustarla.
8. En un celular de 360 px de ancho el mapa ocupa el ancho disponible y se maneja con una mano; una prueba con Playwright en esa medida y con la red cortada comprueba que se ven el mapa base y los pines.

### RF-05: Usar el mapa nuevo en las pantallas y retirar el dibujo anterior (Funcional)

Cambia el componente viejo por el nuevo en las cinco pantallas que hoy lo usan: ficha del edificio (lectura y edición), alta de consorcio, Secretaría (dos lugares), Semáforo y Mapa del RT. En el Mapa del RT, que es donde más se trabaja sin señal, agrega que el mapa siga mostrando los edificios con los últimos datos descargados cuando no hay conexión.

**Condiciones de aprobación**

1. La ficha del edificio (lectura y edición), el alta de consorcio, Secretaría (los dos lugares donde aparece), el Semáforo y el Mapa del RT usan el componente nuevo; en apps/web/src no queda ninguna referencia a MapaUbicacionConsorcio ni a las avenidas dibujadas a mano («Av. Rivadavia», «Av. 9 de Julio», «Av. Cabildo / Santa Fe»).
2. Las pruebas de la web existentes siguen en verde, y npm run verify y npm run test:int también.
3. En el Mapa del RT, con la red cortada y el mapa ya descargado, se ven el mapa base y los pines con los últimos datos descargados, y un cartel indica a qué hora son esos datos.
4. El Semáforo conserva los colores de sus pines, su leyenda y la nota «El mapa muestra solamente edificios: no hay seguimiento de técnicos en vivo».
5. La app no pide ninguna geolocalización nueva: la prueba de apps/web/src/auth/ubicacion.test.ts que prohíbe otros accesos sigue en verde.
6. La guía visual tiene capturas con Playwright de las cinco pantallas, en escritorio y en un celular de 360 px, con la mejora a la vista.

### RF-06: Que los mapas se vean: el archivo del mapa va con el sitio y la app avisa cuando falta (Funcional)

Hoy ningún mapa de la aplicación se dibuja en el sitio desplegado: el archivo con las calles de CABA (apps/web/public/mapa/caba.pmtiles, 10,67 MB) está en el .gitignore y no se sube al repositorio, así que el sitio, que se arma desde el repositorio, no lo tiene. Al pedirlo, el servidor responde 200 con la página de la app (text/html, 924 bytes) en lugar del mapa, y la aplicación no lo nota: dibuja un recuadro vacío y lo marca como «listo», sin ningún aviso. Las tipografías y los íconos del mapa sí están en el repositorio y se sirven bien. Esta Tarea sube el archivo generado al repositorio (decisión del usuario del 25/11/2026) para que cualquier armado del sitio lo traiga, y hace que la aplicación avise «El mapa no está disponible» cuando falte, en vez de mostrar un mapa vacío; el botón de descarga para usar sin señal tampoco debe ofrecer bajar una página como si fuera el mapa. Los datos son de OpenStreetMap (ODbL) y la atribución sigue visible.

**Condiciones de aprobación**

1. El archivo del mapa de CABA (caba.pmtiles) está en el repositorio y una aplicación armada desde el repositorio lo sirve: pidiendo los primeros bytes con Range, responde 206 y empieza con «PMTiles».
2. Los mapas de la Secretaría, de la ficha del edificio, del alta de consorcio, del Semáforo, del Mapa del RT y de «Mapa sin conexión» dibujan las calles de CABA.
3. Si el archivo no está en el servidor (o el servidor responde una página en su lugar), el mapa muestra «El mapa no está disponible» con la explicación de que falta cargar el archivo del mapa en el servidor y un botón para reintentar, en vez de quedar vacío como si estuviera listo; y el botón de descarga para usar sin señal no ofrece bajar esa página como si fuera el mapa.
4. El script que genera el mapa sigue funcionando, la guía de HU-16 RF-03 explica que el archivo va en el repositorio y cómo actualizarlo (generar de nuevo y subirlo), y la atribución «© OpenStreetMap contributors» sigue visible en el mapa.
5. El sitio desplegado sirve el archivo: pidiendo los primeros bytes del mapa con Range responde 206 y empieza con «PMTiles», y sus mapas se dibujan.

### RF-07: [FIX] La guía de Android incluye el mapa en las pantallas donde se usa (Funcional)

La guía docs/android/INSTALAR-Y-PROBAR-EN-ANDROID.md se escribió el 19/11/2026, cuando el mapa nuevo sólo estaba en Estado del sistema. Desde HU-16 RF-04 y RF-05 el mapa también está en la ficha del consorcio, el alta de consorcio, la Secretaría, el semáforo y el Mapa del RT, con pines por estado. La guía no dice cómo probar eso en el celular. Esta Tarea la completa, sin cambiar código.

**Condiciones de aprobación**

1. Dada la guía, cuando se lee la parte de qué probar, entonces lista las pantallas donde está el mapa y qué se mira en cada una (calles con nombre, pines por estado, abrir un pin).
2. Dada la prueba sin señal, cuando se la sigue paso a paso, entonces incluye una pantalla con pines, además de Estado del sistema, y qué se espera ver con la red cortada y con el mapa guardado.
3. El registro de la prueba (tabla al final de la guía) tiene una columna por pantalla del mapa, y los enlaces de la guía siguen funcionando.

## HU-17: HU-17: Inspección técnica por solapas

### RF-01: Motor del checklist configurable (Funcional)

Las 5 solapas (Sala de Máquinas, Cabina, Accesos, Caja, Fosa), sus subgrupos, ítems y opciones se definen en configuración, para que una pantalla genérica las dibuje y los cambios del cliente no obliguen a reprogramar pantallas.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Las 5 solapas, subgrupos, ítems y opciones se definen en un archivo de configuración versionado, no en pantallas programadas una por una.
2. Cada opción indica si es falla, si es Falla Crítica y si la foto es obligatoria; la foto es obligatoria en Falla Crítica y en equipo Fuera de Servicio, y opcional en el resto (P5).
3. Cada ítem indica a qué tipos de equipo aplica: en hidráulicos no aparecen poleas, cables ni extensión de cables de tracción, y aparece "Aceite de batea".
4. Un test verifica que la configuración incluye todos los ítems del documento del cliente y que las opciones críticas son exactamente las de la lista definida por el cliente.
5. Cada inspección guarda qué versión del checklist se usó.

### RF-02: Selección de equipo y pregunta de uso (Funcional)

Después de "Iniciar Inspección", el RT elige el equipo y responde si está en uso o fuera de servicio.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Muestra los equipos del edificio con su referencia AGC y su tipo.
2. "SÍ, EN USO" habilita las solapas y "NO, FUERA DE SERVICIO" abre el reporte de parada.
3. No se puede avanzar sin responder la pregunta.

### RF-03: Reporte de parada de un equipo fuera de servicio (Funcional)

Reporte de un equipo detenido. Según el cliente (P4), el RT marca el estado y el Firmante lo confirma en coordinación con la Secretaría; el aviso va a la Secretaría y al Firmante.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. "Guardar Reporte de Parada" se habilita solo con causa y al menos una foto.
2. Al guardar, el equipo queda "Fuera de Servicio — Pendiente de confirmación" y la Secretaría y el Firmante reciben el aviso.
3. El pin del edificio desaparece del mapa del RT recién cuando todos sus equipos están resueltos.

### RF-04: Pantalla de solapa generada desde el motor (Funcional)

Una sola pantalla, pensada para celular, que dibuja cualquiera de las 5 solapas a partir de la configuración del checklist.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Una sola pantalla dibuja las 5 solapas a partir de la configuración.
2. Cada solapa tiene "Observaciones" de texto libre (el dictado usa el micrófono del teclado del celular).
3. Una solapa queda con tilde solo cuando todos sus ítems que aplican al equipo están respondidos.
4. En un celular de 360 px de ancho cada opción se puede tocar sin zoom y sin desplazamiento horizontal.

### RF-05: Fotos por anomalía (Funcional)

Fotos tomadas con la cámara del celular al marcar una falla. Obligatorias en Falla Crítica y Fuera de Servicio, opcionales en el resto (P5). Pendiente de MAICON: si la foto de cables y la del frente son siempre obligatorias (P7.a vs. P13).
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Marcar una falla muestra "Adjuntar Foto de Anomalía" con el nombre del ítem; una opción correcta no lo muestra.
2. Una Falla Crítica sin foto impide completar la solapa; una falla común sin foto sí se puede completar.
3. Las fotos se comprimen a 500 KB o menos antes de guardarse en el celular.
4. Cada foto guarda a qué equipo, solapa e ítem corresponde, y la hora en que se tomó.

### RF-06: Fallas por piso en Accesos (Funcional)

En la solapa Accesos, las fallas se cargan por piso, como describe el documento del cliente.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. "+ Agregar Falla en un Piso" permite elegir un piso de la lista del edificio y el componente.
2. Los componentes son los del documento del cliente: Mecánica de Puerta, Seguridad Crítica y Llamadores, incluido "Espacio entre puertas mayor a 12 cm".
3. Se pueden cargar varias fallas por piso y eliminar una antes de cerrar la solapa.

### RF-07: Navegación por estaciones y sala compartida (Funcional)

El RT recorre el edificio por estaciones (sala de máquinas, accesos, cabinas) y no por equipo: en cada solapa cambia entre M1, M2, M3. La sala compartida se carga una sola vez.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Cada solapa muestra los selectores de equipo (M1, M2, M3) y cambiar de equipo conserva lo cargado.
2. Los datos de entorno cargados en una sala compartida aparecen en los demás equipos de esa sala sin volver a cargarlos.
3. "Ir a Accesos/Cabinas" lleva a la estación siguiente.

### RF-08: Las Fallas Críticas del checklist llegan a la Secretaría (Funcional)

Conectar el checklist con la recepción de Fallas Críticas (HU-06): hoy esa recepción recibe el informe por API, pero ninguna pantalla del RT lo genera.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Al guardar una solapa con una opción crítica, se registra el informe de Falla Crítica con el edificio, el equipo, las fallas y sus fotos.
2. La Secretaría y el Firmante reciben la alerta como define HU-06.
3. Sin señal, el informe queda en el celular y se envía al volver la conexión, una sola vez.

### RF-09: Guardar en PostgreSQL los reportes de parada de un equipo fuera de servicio (Funcional)

Los reportes de parada que el RT carga cuando un equipo está fuera de servicio viven en memoria de ParadasService y se pierden al reiniciar la API. Esta Tarea los guarda en la base.

**Condiciones de aprobación**

- 1. Dado un reporte de parada cargado por el RT, cuando se reinicia la API, entonces el reporte sigue visible para el Firmante, la Secretaría y la ECA que corresponden.
- 2. Dado un reporte ya recibido, cuando el celular lo reintenta después del reinicio, entonces no se duplica.
- 3. Las pruebas existentes de paradas siguen en verde, y una prueba de integración con la base real reinicia el servicio y comprueba los criterios 1 y 2.

### RF-10: Que la Inspección Técnica arranque desde el inicio de visita y no desde un selector provisorio (Funcional)

La pantalla de Inspección Técnica usa un edificio fijo («Edificio demo Av. Callao 450») con un selector provisorio, a la espera de integrar el inicio de visita. Esta Tarea la conecta: el RT inicia la visita en un edificio y la inspección trabaja sobre las máquinas de ese edificio.

**Condiciones de aprobación**

- 1. Dado un RT que inició la visita en un edificio, cuando abre Inspección Técnica, entonces ve las máquinas de ese edificio y no un edificio de demo.
- 2. Dado un RT sin visita iniciada, cuando abre Inspección Técnica, entonces ve un mensaje que le explica cómo iniciarla.
- 3. El selector provisorio y el edificio de demo ya no existen en la pantalla.
- 4. El borrador sin señal sigue funcionando por edificio y máquina, y las pruebas existentes del checklist siguen en verde.

### RF-11: Fotos obligatorias del frente de cabina y de los cables en cada equipo en uso (Funcional)

Decisión de producto del 23/11/2026 (German): para que cada visita quede auditable, el RT saca en cada equipo en uso una foto del frente de cabina y botonera y, en los equipos con cables de tracción (tracción y montavehículos), una foto de los cables, aunque no haya ninguna falla. Hoy el checklist sólo pide fotos de las anomalías (HU-17 RF-05), así que un informe sin fallas no trae ninguna foto y el Portal Firmante (HU-08) no deja autorizarlo, porque exige las de «frente» y «cables». Los equipos hidráulicos no tienen cables de tracción: sólo llevan la foto del frente. Un equipo fuera de servicio no las pide (ya lleva su reporte de parada con fotos). Esta Tarea es la parte del celular: sacarlas, guardarlas aunque no haya señal y exigirlas antes de consolidar el informe. Que la API también las exija y las selle es HU-18 RF-02, y que el Portal no pida cables a un hidráulico es HU-08 RF-08. Resuelve lo que HU-17 RF-05 dejó pendiente de MAICON («si la foto de cables y la del frente son siempre obligatorias»).

**Condiciones de aprobación**

1. Dado un equipo en uso, cuando el RT abre sus solapas, entonces ve «Fotos obligatorias del equipo» con el botón para sacar la foto del frente de cabina y botonera; si el equipo es de tracción o montavehículos ve también la de cables de tracción, y si es hidráulico sólo la del frente.
2. Dada una foto sacada, cuando se guarda, entonces se comprime a 500 KB o menos como las de anomalía, queda con el equipo, su nombre y la hora en que se tomó, se ve en miniatura y se puede quitar y volver a sacar.
3. Dado un equipo en uso al que le falta alguna de sus fotos obligatorias, cuando el RT intenta consolidar el informe, entonces «Consolidar Informe y Proceder a Firma» sigue deshabilitado y dice qué equipo y qué foto faltan.
4. Dado un equipo fuera de servicio, cuando el RT consolida, entonces no se le piden estas fotos; y si lo vuelve a poner en uso, se le piden. Dado un cambio de tipo de equipo (por ejemplo de tracción a hidráulico), la foto de cables deja de exigirse.
5. Dada una visita sin señal, cuando el RT saca las fotos y cierra la app, entonces al volver a abrirla las fotos siguen ahí, con el resto del borrador, y el informe las lleva al enviarse.
6. Las pruebas existentes del checklist y del informe siguen en verde y hay pruebas nuevas de la regla (qué fotos exige cada tipo de equipo y cuándo se puede consolidar).

### RF-12: [FIX] La lista de paradas vuelve a no traer las imágenes (Funcional)

Desde HU-10 RF-08 cada parada de la lista trae fotoUrl, la primera foto completa en base64, para mostrarla en la alerta del Portal ECA. Eso rompió el criterio de HU-17 RF-03 («la lista no devuelve las imágenes, sólo cuántas hay»): paradas.spec.ts falla en dev y en testing y npm run verify de la API no pasa. Además repite el problema de peso que el chat resolvió en HU-19 RF-05: cada consulta de la lista baja una foto entera por parada. Esta Tarea devuelve a la lista sólo la cantidad de fotos y hace que la foto de la alerta del Portal ECA se pida aparte, con sesión, a quien corresponde. Es un arreglo de un cambio de otra Tarea que quedó `tested` con una prueba en rojo.

**Condiciones de aprobación**

1. Dada la lista de reportes de parada, cuando se la pide, entonces cada reporte trae la cantidad de fotos y ninguna imagen (ni base64 ni data URL), y paradas.spec.ts vuelve a pasar completo.
2. Dada una alerta del Portal ECA generada por una parada, cuando la ECA la abre, entonces ve la foto de la cabina, pedida con una ruta aparte que exige sesión, sólo la sirve a quien puede ver esa alerta (401 sin sesión, 404 a un tercero) y no cambia lo que ve hoy.
3. Dados 5 reportes con una foto de 500 KB cada uno, cuando se pide la lista, entonces la respuesta pesa menos de 10 KB (medido).
4. npm run verify de la API termina sin fallas en dev, con pruebas nuevas por HTTP y contra PostgreSQL real de los criterios 1 y 2.

### RNF-01: Visita en curso sin señal (No funcional)

El RT trabaja en salas de máquinas y fosas sin señal, con su celular Android personal (P2). Nada de lo cargado se puede perder.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Respuestas y fotos se guardan en IndexedDB al cargarlas, nunca en LocalStorage.
2. Cerrar y reabrir la app sin señal recupera la visita en el mismo punto.
3. La app abre sin señal si ya se cargó una vez con señal.
4. Una visita de 3 equipos con 20 fotos se completa sin conexión en un celular Android real, y queda registrado el modelo usado en la prueba.

## HU-18: HU-18: Cierre, firma y envío del informe

### RF-01: Consolidación y firma en pantalla (Funcional)

Firma única del encargado para todo el edificio. Datos obligatorios definidos por el cliente (P7) y cierre "Sin firma" (P8), que decide el Firmante.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. "Consolidar Informe y Proceder a Firma" se habilita solo con todas las solapas de todos los equipos completas o resueltos como fuera de servicio.
2. La firma se captura con el dedo y no se acepta vacía.
3. Exige nombre, apellido y carácter de quien firma (Encargado, Administrador o Propietario); el DNI es opcional.
4. "Sin firma" exige motivo y foto, y el informe queda marcado para que lo vean la Secretaría y el Firmante.

### RF-02: El informe cerrado exige y sella las fotos obligatorias de cada equipo en uso (Funcional)

Hoy la API acepta un informe sin ninguna foto. Para que la auditoría no dependa de que el celular lo haga bien (una versión vieja de la app, un envío armado a mano), la API rechaza el cierre de un informe donde un equipo en uso no trae la foto del frente de cabina y, si no es hidráulico, la de los cables (HU-17 RF-11 las hace sacar en el celular). Las fotos quedan dentro del contenido sellado del informe (SHA-256, HU-18 RNF-01): cambiar una después de cerrado invalida el sello. Un equipo fuera de servicio no las necesita. Esto cambia el formato de los informes de prueba: los tests y los scripts de entrega que arman informes tienen que mandar las fotos.

**Condiciones de aprobación**

1. Dado un informe con un equipo en uso sin la foto del frente, cuando se cierra, entonces la API responde 400 con un mensaje que nombra el equipo y la foto que falta, y no guarda nada.
2. Dado un equipo en uso de tracción o montavehículos sin la foto de cables, cuando se cierra el informe, entonces se rechaza igual; un equipo hidráulico sin foto de cables se acepta.
3. Dada una foto obligatoria que no es una imagen en data URL (jpeg, png o webp) o que pesa más de 2 MB, cuando se cierra el informe, entonces se rechaza con un mensaje que dice cuál es.
4. Dado un equipo fuera de servicio sin estas fotos, cuando se cierra el informe, entonces se acepta.
5. Dado un informe cerrado con sus fotos, cuando se verifica el sello, entonces el hash coincide; y si se cambia una de esas fotos directamente en la base, entonces la verificación detecta que no coincide.
6. Los informes ya guardados siguen pudiéndose leer y verificar, y las pruebas de informes (unitarias, e2e e integración con la base real) y los scripts de entrega de HU-18 siguen en verde, actualizados para mandar las fotos.

### RNF-01: Sellado del informe (No funcional)

El informe cerrado no se puede modificar y se puede demostrar que no cambió: es lo que da valor probatorio a la firma electrónica (Ley 25.506).
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Al cerrar se calcula un hash SHA-256 del contenido, la firma y las fotos.
2. Se guardan la hora del dispositivo y la del servidor.
3. Un intento de modificar un informe cerrado responde 409 y queda registrado.
4. Una función verifica que el hash coincide y lo informa en la auditoría.

### RNF-02: Cola de sincronización del celular (No funcional)

Lo que el RT cierra sin señal queda en cola y se envía solo cuando vuelve la conexión, sin duplicar ni perder fotos.
Fuente: "Desarrollo lógico de app para Representante Técnico" (cliente) y respuestas de MAICON del 06/11 y 12/11/2026.

**Condiciones de aprobación**

1. Lo pendiente queda en cola y la app muestra "N inspecciones sin subir".
2. Al volver la señal con la app abierta, la cola se envía sola.
3. Reenviar el mismo informe no lo duplica, gracias a un identificador generado en el celular.
4. Un envío interrumpido se reintenta sin perder fotos.
5. Si la sesión venció, lo pendiente se conserva y se envía después de volver a ingresar.

## HU-19: HU-19: Chat interno entre operarios e ingenieros para consultas y reportes

### RF-01: RF-01: Chat interno para operarios e ingenieros con mensajes, fotos y enlaces (Funcional)

Desarrollo de un chat integrado en la aplicación que permite a los operarios en la calle y a los ingenieros comunicarse en tiempo real. Cuenta con un canal general para todo el equipo y chats privados individuales. Permite mandar mensajes de texto, fotos sacadas con el celular o de la galería, enlaces directos a páginas web y seleccionar el edificio o ascensor para avisar rápido sobre cualquier falla o consulta técnica.

**Condiciones de aprobación**

1. En la barra de navegación lateral se muestra el botón 'Chat' para operarios de calle, ingenieros y administradores.
2. La pantalla permite elegir entre hablar en el canal 'Grupo General' o seleccionar un compañero para abrir un chat privado individual.
3. Los mensajes de texto enviados se muestran de inmediato con el nombre de la persona, su rol, la hora y el texto.
4. Se pueden adjuntar y enviar fotos desde la cámara o galería, viéndose como fotos dentro de la conversación.
5. Los enlaces web que se envíen se pueden tocar o clickear para abrirlos directamente.
6. El operario puede elegir el edificio o ascensor de una lista para que el mensaje aclare dónde está trabajando.
7. Los mensajes quedan guardados y no se pierden al recargar la página o volver a entrar al sistema.

### RF-02: El hilo del chat muestra siempre los mensajes más nuevos y deja leer los anteriores (Funcional)

Hoy el chat pide los 200 mensajes MÁS VIEJOS de cada conversación (orden ascendente con límite 200): al pasar los 200, los mensajes nuevos dejan de verse para todos aunque se guardan y la lista de chats los muestra como «último mensaje» (probado: con 210 mensajes el hilo quedó clavado en el 187). Además, cada 3,5 segundos la actualización automática lleva el hilo al final, así que no se pueden leer mensajes anteriores (probado: se pasó de arriba a abajo en menos de 8 s). Esta tarjeta hace que el hilo muestre los 200 más nuevos, permita pedir los anteriores y respete el lugar donde está leyendo quien subió.

**Condiciones de aprobación**

1. Cuando el grupo general o un chat privado tiene más de 200 mensajes, el hilo muestra los 200 más nuevos, de más viejo a más nuevo, y un mensaje recién enviado aparece en el hilo de todos los participantes
2. El último mensaje que se ve al final del hilo es el mismo que muestra la lista de chats como último mensaje de esa conversación
3. Un botón «Ver mensajes anteriores» agrega al principio del hilo los 200 mensajes previos sin mover lo que se está leyendo, y deja de aparecer cuando no quedan más
4. Si se sube a leer mensajes anteriores, la actualización automática no devuelve el hilo al final: se queda en el mismo lugar
5. Si se está al final del hilo, un mensaje nuevo lo baja para mostrarlo; si se está leyendo más arriba, aparece el aviso «Mensajes nuevos ↓» que lleva al final al tocarlo

### RF-03: La Secretaría figura como contacto en el chat y sus mensajes privados se pueden leer y responder (Funcional)

La Secretaría puede entrar al chat y escribirle por privado a cualquiera, pero no figura en la lista de contactos de nadie (solo se listan Técnicos RT, Firmantes y Administradores). Resultado probado en pantalla: un mensaje privado de la Secretaría a un RT se guarda, pero el RT no tiene ese chat en su lista, nunca lo ve y no puede contestar. Esta tarjeta agrega a la Secretaría como contacto de los demás roles del chat, para que los privados con ella funcionen en las dos direcciones.

**Condiciones de aprobación**

1. La lista de chats de un Técnico RT, de un Ingeniero Firmante y de un Administrador incluye a la Secretaría como contacto, y la Secretaría no se ve a sí misma en su lista
2. Un mensaje privado de un Técnico RT a la Secretaría llega y la Secretaría lo ve al abrir el chat con ese Técnico
3. Un mensaje privado de la Secretaría a un Técnico RT aparece en el chat del Técnico con la Secretaría, y la respuesta del Técnico le llega a la Secretaría
4. Los privados con la Secretaría solo los ven sus dos participantes: otro Técnico, el Firmante y el Administrador no los ven ni en el grupo general ni abriendo su propio chat
5. La ECA sigue sin chat: no ve la pestaña «Chat Operativo» y la API del chat le responde 403

### RF-04: La API del chat rechaza con un mensaje claro lo que no corresponde en vez de fallar o guardarlo (Funcional)

La API del chat casi no valida lo que recibe. Probado con una sesión de Técnico RT: un destinatario que no es un identificador válido o que no existe, un tipo de sala inventado o ausente, un edificio inválido o un contenido que no es texto devuelven 500 (error del servidor) en vez de 400; pedir los mensajes de una sala inválida también da 500. Y se guardan sin objeción un mensaje de 100.000 caracteres (armó un globo de casi 59.000 px que dejó el hilo inutilizable para todos), adjuntos con dirección `javascript:` o `http://` externa (el navegador de cada lector pide esa dirección) y privados a alguien que no es contacto del emisor. Esta tarjeta pone esas validaciones en la API (que es la que manda) y un tope de largo en la caja de texto. Va después de la tarjeta de la Secretaría porque «destinatario que no es contacto» necesita que la lista de contactos ya esté completa.

**Condiciones de aprobación**

1. Un mensaje privado cuyo destinatario no es un identificador válido, no existe, está inactivo o no es un contacto del emisor responde 400 con un mensaje que lo explica, nunca 500, y no se guarda
2. Un mensaje con tipo de sala distinto de «global» o «directo», o sin tipo de sala, responde 400 y no se guarda
3. Un mensaje con un edificio que no existe o que no es un identificador válido responde 400 y no se guarda
4. Un contenido que no es texto, o de más de 2.000 caracteres, responde 400; la caja de texto del chat no deja escribir más de 2.000 caracteres
5. Un adjunto que no es una imagen en formato data:image (png, jpeg o webp), por ejemplo una dirección `javascript:` o `http://`, responde 400 y no se guarda
6. Pedir los mensajes de una sala que no es «global» ni un identificador válido responde 400 en vez de 500

### RF-05: Las fotos del chat son livianas: se reducen antes de enviarlas y la actualización del hilo no las vuelve a bajar (Funcional)

La foto se manda tal como la saca el celular y viaja dentro de cada mensaje en base64; además, cada usuario baja el hilo completo cada 3,5 segundos. Probado: con una sola foto de 8 MB, cada actualización del hilo bajó 8,1 MB por usuario; con unas pocas fotos de celular el chat se vuelve inusable con datos móviles. Esta tarjeta reduce la foto en el dispositivo antes de enviarla (lado mayor 1.600 px, JPEG) y hace que el hilo no lleve las fotos adentro: se piden aparte, una vez, y el navegador las guarda. Va después de la validación de la API porque define el formato y el tope de los adjuntos.

**Condiciones de aprobación**

1. Al elegir una foto de celular (por ejemplo 4000×3000 px y 5 MB), la pantalla la reduce antes de enviarla a 1.600 px como máximo del lado mayor, en JPEG, y lo enviado pesa menos de 500 KB; al agrandarla en el hilo se sigue leyendo bien
2. La actualización automática del hilo no vuelve a bajar las fotos: en una conversación con 5 fotos, cada actualización pesa menos de 50 KB
3. La foto se ve en el hilo de quien la envió y de los demás participantes, y al tocarla se agranda
4. Solo pueden pedir una foto quienes pueden leer ese mensaje (en el grupo, los roles del chat; en un privado, sus dos participantes): sin sesión responde 401 y un tercero en un privado no la obtiene
5. Si el archivo elegido no es una imagen o, ya reducida, supera el tope permitido, la pantalla lo dice con un mensaje claro y no envía nada

### RF-06: El chat avisa en pantalla cuando un mensaje no se envió y muestra el estado real de la conexión (Funcional)

Hoy, si el envío falla (sin red, error del servidor o foto demasiado grande) la pantalla no muestra nada: el texto queda en la caja y quien escribe no sabe si salió. Probado sin red y con un error 500 simulado. Además, la cabecera dice siempre «Equipo conectado» (grupo) o «En línea» (privados) como texto fijo, incluso sin conexión. Esta tarjeta muestra un aviso cuando el envío falla y hace que el estado de la cabecera refleje el resultado real de la última actualización.

**Condiciones de aprobación**

1. Si el envío falla por falta de conexión o por un error del servidor, debajo de la caja de texto aparece un aviso que dice que el mensaje no se envió, el texto escrito se conserva y un botón «Reintentar» lo vuelve a enviar
2. Si el servidor rechaza el mensaje con un 400, el aviso muestra el motivo en lenguaje claro
3. La cabecera del chat muestra «Conectado» cuando la última actualización salió bien y «Sin conexión, reintentando…» cuando falló, y vuelve a «Conectado» sola al recuperarse la red; ya no dice «Equipo conectado» ni «En línea» fijos
4. Mientras un mensaje se está enviando, el botón Enviar queda deshabilitado y no se puede enviar dos veces el mismo texto

### RF-07: La etiqueta de edificio del chat se elige para cada mensaje y la ven todos los que lo leen (Funcional)

El edificio elegido en el selector queda elegido después de enviar: todos los mensajes siguientes salen etiquetados con ese edificio (probado: una foto enviada después del primer mensaje salió con la etiqueta sin que se la eligiera de nuevo). Además, la etiqueta se arma con una consulta que respeta la seguridad por edificio, así que un Técnico o Firmante que no está asignado a ese edificio ve el mensaje sin etiqueta aunque quien lo envió sí la puso. Supuesto de esta tarjeta, a confirmar: la etiqueta es parte del mensaje y debe verla cualquiera que pueda leerlo (el nombre del edificio lo eligió quien escribe dentro de su propia lista).

**Condiciones de aprobación**

1. Después de enviar un mensaje con un edificio vinculado, el selector vuelve a «(Opcional) Vincular Edificio…» y el siguiente mensaje sale sin etiqueta salvo que se elija un edificio otra vez
2. Un mensaje con edificio muestra la etiqueta «📍 nombre del edificio» (y la máquina si se indicó) a todos los que pueden leerlo, estén o no asignados a ese edificio
3. El campo de máquina aparece solo cuando hay un edificio elegido, admite hasta 40 caracteres y se vacía al enviar
4. El selector ofrece a cada usuario los edificios que puede ver (Técnico y Firmante, los asignados; Secretaría y Administrador, todos)

### RF-08: Detalles del chat: hora en 24 horas con el día, y Escape cierra la foto agrandada (Funcional)

Tres detalles menores. (1) La hora de los mensajes y de la lista de chats usa `toLocaleTimeString`, que muestra la hora con el formato del dispositivo (AM/PM en algunos) y rompe la prueba guardiana de HU-12 RF-03 (única prueba de la web que hoy falla en `dev`). (2) El mensaje muestra solo la hora, sin el día: uno de ayer se ve igual que uno de hoy. (3) La foto agrandada solo se cierra tocando el fondo: Escape no la cierra y no hay botón visible para cerrarla.

**Condiciones de aprobación**

1. La hora de cada mensaje y la de la lista de chats se muestra en formato de 24 horas (HH:MM) igual en cualquier dispositivo, con el mismo formato de fechas que el resto de la aplicación
2. Los mensajes de un día anterior muestran el día: un separador «Hoy», «Ayer» o la fecha completa entre mensajes de distintos días
3. La foto agrandada se cierra con la tecla Escape y con un botón «Cerrar» visible, y el foco vuelve a la foto desde la que se abrió
4. La prueba guardiana de formato de fechas de HU-12 RF-03 pasa: ninguna parte del chat usa el formato de hora del dispositivo

### RF-09: El chat marca lo que no leíste: contador por conversación, en el menú y en el título de la pestaña (Funcional)

Hoy el chat no tiene ninguna noción de «no leído» ni de aviso: la lista de chats se carga una sola vez al abrir la pantalla y solo se consulta la conversación abierta, así que quien está en otra conversación o en otra pestaña de la aplicación (Mapa del RT, Inspección…) no se entera de que le escribieron (probado con dos usuarios a la vez). Esta tarjeta es la base de los avisos: guarda en el servidor hasta dónde leyó cada usuario cada conversación y muestra contadores. Va después del arreglo de los 200 mensajes (el «último leído» depende de qué mensajes se ven) y de la Secretaría como contacto (para que sus privados también cuenten).

**Condiciones de aprobación**

1. Cada conversación de la lista de chats muestra un contador con sus mensajes no leídos y su nombre en negrita mientras tenga alguno; la lista se actualiza sola cada pocos segundos y ordena primero la conversación con el mensaje más reciente
2. La pestaña «Chat Operativo» del menú muestra el total de no leídos, también cuando la persona está en otra pestaña de la aplicación, y el título de la pestaña del navegador muestra ese total, por ejemplo «(3) mant_asc»
3. Al abrir una conversación y ver sus mensajes, su contador vuelve a cero; los mensajes que uno mismo envía nunca cuentan como no leídos
4. Lo leído se guarda por usuario en el servidor: al salir y entrar desde otro dispositivo, los contadores son los mismos
5. Nadie cuenta ni ve mensajes de privados ajenos: el total de no leídos de cada usuario solo suma el grupo general y sus propios privados

### RF-10: Avisos del navegador cuando llega un mensaje nuevo del chat (Funcional)

Prueba de avisos con las notificaciones del navegador (pedido del usuario del 25/11/2026, «por si acaso»). Alcance: funcionan mientras la aplicación está abierta en el navegador, incluso si la pestaña está en segundo plano o la persona está en otra pestaña de la aplicación; con la aplicación cerrada o el celular bloqueado NO llegan (eso necesitaría notificaciones push con un servidor de claves y es otra tarjeta, si se quiere). Nota técnica: en Chrome de Android el aviso no se puede crear con `new Notification()`; hay que mostrarlo desde el service worker de la aplicación (`registration.showNotification`). Depende de la tarjeta de no leídos, que es la que sabe qué mensajes son nuevos.

**Condiciones de aprobación**

1. Un botón «Activar avisos del chat» pide el permiso del navegador solo cuando se lo toca, nunca al cargar la página, y muestra si los avisos están activados, bloqueados o no disponibles en ese navegador
2. Con los avisos activados, cuando llega un mensaje nuevo de otra persona y la pestaña está en segundo plano, o la persona está en otra conversación o en otra pestaña de la aplicación, el navegador muestra un aviso con el nombre de quien escribió y el comienzo del mensaje (hasta 100 caracteres, sin la foto)
3. Tocar el aviso lleva a la aplicación y abre esa conversación
4. No se avisa por los mensajes propios ni por los de la conversación que ya se está viendo con la pestaña a la vista; varios mensajes seguidos de la misma conversación reemplazan al aviso anterior en vez de apilarse
5. Si el permiso está denegado o el navegador no admite avisos, el chat y los contadores de no leídos funcionan igual y la pantalla lo explica sin errores; desactivar los avisos los detiene y la preferencia se recuerda en ese dispositivo

### RF-11: [FIX] chat-hilo.e2e-spec carga los 205 mensajes directo en el repositorio y no se pasa del tope con la máquina ocupada (Funcional)

chat-hilo.e2e-spec escribe 205 mensajes uno por uno por HTTP para pasar el límite de 200 del hilo, y no declara su propio tope, así que usa los 5 s de Jest. Con la máquina libre sus dos pruebas de 205 mensajes tardan 2,1 y 1,8 s; con la máquina ocupada, 4,9 y 4,1 s; y en la suite completa de la API bajo carga fallaron las dos con «Exceeded timeout of 5000 ms» (medido el 28/11/2026, docs/decisiones/2026-11-28-pruebas-intermitentes/README.md). No es un problema de la API del chat: son 205 pedidos seguidos. Esta Tarea hace que la prueba cargue los 205 mensajes directo en el repositorio (ChatRepository.guardarMensaje, en memoria) y siga leyendo por HTTP, con sesión: baja de segundos a milisegundos y no depende de la carga. No se sube ningún tope ni se agregan reintentos. Escribir mensajes por HTTP ya lo prueban chat.e2e-spec y chat-validacion.e2e-spec.

**Condiciones de aprobación**

1. Dada la prueba chat-hilo.e2e-spec, cuando se corre con la máquina libre, entonces cada una de sus pruebas tarda menos de 1 s (hoy las dos de 205 mensajes tardan unos 2 s).
2. Dada la máquina ocupada, cuando se corre la suite completa de la API con docs/decisiones/2026-11-28-pruebas-intermitentes/estres-suite-api.sh, entonces chat-hilo.e2e-spec no falla por «Exceeded timeout» (hoy fallan las dos pruebas de 205 mensajes).
3. La prueba comprueba lo mismo que hoy: con más de 200 mensajes el hilo responde los 200 más nuevos y avisa en X-Hay-Anteriores que quedan anteriores, y con el id del más viejo trae los 5 anteriores y avisa que no quedan más; los mensajes se cargan con el repositorio y se leen por HTTP con la sesión de un usuario.
4. No se sube ningún tope (jest.setTimeout, testTimeout) ni se agregan reintentos, y no se quita ninguna prueba: las que escriben por HTTP siguen en chat.e2e-spec y chat-validacion.e2e-spec.

## RO-01: RO-01: Setup del proyecto y entorno de desarrollo verificable

### RF-01: RO-01: Setup del proyecto y entorno de desarrollo verificable (Funcional)

Inicializar el monorepo (web React+Vite PWA, API NestJS, PostgreSQL+PostGIS en Docker) con HTTPS local en https://localhost:8050 y CORS habilitado solo en desarrollo para el origen de Scrum Master AI (https://scrum.nuestrocamino.cloud).

**Condiciones de aprobación**

1. GET https://localhost:8050/api/health responde 200 con el estado de la API y de la base de datos.
2. Una petición con Origin: https://scrum.nuestrocamino.cloud recibe Access-Control-Allow-Origin con ese origen, y una con otro origen no lo recibe.
3. Con la configuración de producción, la API no devuelve encabezados CORS.
4. docker compose up levanta PostgreSQL con PostGIS, y /api/health informa la versión de PostGIS.
5. https://localhost:8050 carga la app web y registra el service worker.

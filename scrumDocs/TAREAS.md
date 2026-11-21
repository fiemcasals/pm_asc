# Tareas -- mant_asc

_Generado automaticamente el 2026-11-21T19:01:44.247Z -- no editar a mano, se sobreescribe en cada publicacion._

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

**Condiciones de aprobación**

- 1. Dado un RT que cierra el informe de una visita a un edificio con terna, cuando el informe queda guardado, entonces cada máquina del informe aparece en el Portal Firmante del Firmante de la terna como «Recorrida», con la visita, las fotos obligatorias y la firma del encargado.
- 2. Dado un informe cerrado «Sin firma», cuando se abre el Portal Firmante, entonces la visita figura para revisión y no se puede autorizar hasta que tenga la firma del encargado o se resuelva.
- 3. Dado un equipo del informe que quedó fuera de servicio o con visita fallida, cuando se abre el Portal Firmante, entonces la máquina figura con el estado que corresponde («Advertencia» o «Pendiente de Visita») y no como recorrida.
- 4. Dado el mismo informe reenviado por el celular (mismo clientReportId), cuando llega de nuevo, entonces no se duplica la visita ni se pisa una firma ya autorizada.
- 5. Dada una visita creada desde un informe, cuando se reinicia la API, entonces sigue en el Portal Firmante con su firma o su rechazo (usa lo guardado de HU-08 RF-05).
- 6. Las pruebas existentes de informes y del Portal Firmante siguen en verde, y una prueba de integración con la base real cierra un informe y comprueba los criterios 1 y 5.

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

### RF-05: Enviar los avisos a la ECA solo después de la revisión de la Secretaría (Funcional)

El cliente pidió que ningún aviso salga automático: WhatsApp y PDF a la ECA se envían recién cuando la Secretaría revisa la falla y aprueba el envío (P4 y cuestionario 06/11). Hoy el disparo es automático e inmediato (< 5 s, POST /api/whatsapp/trigger-alerta-critica). Hay que reemplazarlo por una bandeja "Pendiente de revisión" en la Secretaría con la acción "Aprobar y enviar". El aviso va a la ECA y también al RT Firmante del edificio.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

**Condiciones de aprobación**

1. Al registrarse una Falla Crítica no se envía ningún WhatsApp ni email: el aviso queda en estado "Pendiente de revisión" y aparece en la bandeja de la Secretaría.
2. Cuando la Secretaría aprueba el aviso, se envían el WhatsApp a la ECA y al RT Firmante del edificio y el PDF legal por email a la ECA, y el aviso pasa a "Enviado".
3. El endpoint de disparo automático ya no envía nada sin aprobación: un pedido de envío de un aviso no aprobado responde 409 con el motivo.
4. El historial de envíos registra quién aprobó cada aviso y la fecha y hora de la aprobación.

### RF-06: Link del aviso de WhatsApp sin contraseña y válido por 7 días (Funcional)

El cliente aceptó que el link del WhatsApp abra el informe sin pedir contraseña, con vencimiento de 7 días (cuestionario 06/11). El link tiene que ser imposible de adivinar y mostrar solo el informe de ese aviso.
Fuente: respuestas de MAICON en DEFINICIONES-CLIENTE (12/11/2026) y cuestionario MAICON del 06/11/2026.

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

### RF-08: Enviar el aviso de falla crítica con una plantilla de WhatsApp aprobada (Funcional)

Hoy el conector manda el aviso como texto libre (type "text" en Meta, Body en Twilio). Meta solo permite texto libre dentro de las 24 horas posteriores a un mensaje del destinatario, y Twilio tiene la misma restricción fuera del sandbox: una alerta que inicia el sistema tiene que salir como mensaje de plantilla, aprobada de antemano por el proveedor, con parámetros. Se cambia el envío para que use la plantilla y se deja escrito el texto que hay que registrar en el panel del proveedor. No cambia quién recibe el aviso ni cuándo sale (eso sigue siendo después de que la Secretaría lo aprueba).

**Condiciones de aprobación**

1. Con WHATSAPP_PROVIDER=meta, el envío manda type "template" con template.name tomado de WHATSAPP_META_TEMPLATE_NAME, language.code de WHATSAPP_META_TEMPLATE_LANG (por defecto es_AR) y los parámetros del cuerpo en este orden: edificio, equipo, estado, detalle y enlace del informe; el receptor HTTP de prueba recibe ese cuerpo exacto y ningún campo de texto libre.
2. Con WHATSAPP_PROVIDER=twilio, el envío manda ContentSid tomado de WHATSAPP_TWILIO_CONTENT_SID y ContentVariables con esos mismos 5 valores, y no manda Body de texto libre.
3. Si falta el nombre de la plantilla (Meta) o el ContentSid (Twilio), no sale ningún mensaje: el envío queda no_realizado con estadoEntrega no_configurado y el motivo dice que falta la plantilla; no cae a texto libre.
4. Los valores de los parámetros se limpian de saltos de línea, tabulaciones y de más de 4 espacios seguidos, y se recortan a 1024 caracteres, porque Meta rechaza los parámetros con esos caracteres; una prueba automática lo verifica con un detalle de falla de varias líneas.
5. El texto de la plantilla, con sus 5 variables y un ejemplo de cada una, queda en un documento bajo docs/pruebas/hu-11-hu-11-notificaciones-automatic/ listo para copiar al panel del proveedor.
6. Las pruebas automáticas de apps/api/test/whatsapp-proveedor.e2e-spec.ts cubren los casos 1 a 4, y npm run verify y npm run test:int siguen en verde.

### RF-09: Confirmar la entrega real de cada WhatsApp con las notificaciones del proveedor (Funcional)

Hoy un envío figura "entregado" apenas el proveedor acepta el pedido (respuesta 2xx): eso no prueba que el mensaje haya llegado al celular. Meta y Twilio avisan a una URL del sistema cuando el mensaje se envía, se entrega, se lee o falla. Se agregan esas dos entradas públicas, con validación de la firma del proveedor para que nadie pueda inventar estados, y el historial pasa a distinguir "aceptado por el proveedor" de "entregado". Es la regla de HU-11 RF-03 (no informar como entregado lo que no se entregó) llevada hasta el final.

**Condiciones de aprobación**

1. GET /api/whatsapp/webhook/meta devuelve el valor de hub.challenge solo cuando hub.verify_token coincide con WHATSAPP_META_VERIFY_TOKEN; con cualquier otro valor responde 403.
2. POST /api/whatsapp/webhook/meta valida la cabecera X-Hub-Signature-256 (HMAC-SHA256 del cuerpo sin modificar con WHATSAPP_META_APP_SECRET); sin firma o con firma inválida responde 401 y no cambia ningún registro.
3. POST /api/whatsapp/webhook/twilio valida X-Twilio-Signature con WHATSAPP_TWILIO_AUTH_TOKEN y la URL pública configurada; con firma inválida responde 401 y no cambia ningún registro.
4. Cada evento válido actualiza el registro del historial que tiene ese id de mensaje (wamid o SM): sent pasa a enviado, delivered a entregado, read a leido y failed a fallido con el código y el mensaje de error del proveedor.
5. El estado nunca retrocede y los eventos repetidos son inofensivos: un delivered que llega después de un read, o el mismo evento dos veces, no cambia el registro ni crea filas nuevas.
6. Un evento de un mensaje que el sistema no conoce responde 200 sin crear nada, para que el proveedor no lo reintente.
7. El historial distingue aceptado (el proveedor recibió el pedido) de entregado (el proveedor confirmó la entrega): un envío cuya respuesta fue 2xx figura aceptado y solo pasa a entregado con el evento correspondiente.
8. Los secretos de firma salen solo de variables de entorno y GET /api/whatsapp/estado no los expone; las pruebas de HU-11 RF-03 y RF-04 siguen en verde con la nueva distinción.

### RF-10: Mostrar en la bandeja de avisos si WhatsApp está activo y el estado real de cada envío (Funcional)

El API ya informa si hay un proveedor de WhatsApp activo (GET /api/whatsapp/estado), pero la pantalla de Secretaría no lo muestra: si no hay proveedor, la Secretaría aprueba un aviso y recién después ve «Falló el envío», sin saber por qué. La bandeja tiene que avisar de entrada si WhatsApp está activo y mostrar, por cada aviso, el estado real que confirma el proveedor (RF de confirmación de entrega).

**Condiciones de aprobación**

1. La bandeja de avisos muestra un cartel con el estado de WhatsApp tomado de GET /api/whatsapp/estado: «WhatsApp activo: Meta», «WhatsApp activo: Twilio» o «WhatsApp no configurado: los avisos aprobados no salen por WhatsApp»; no muestra credenciales ni números de teléfono.
2. Con WhatsApp no configurado, el botón «Aprobar y enviar» sigue funcionando y el aviso queda «Falló el envío» como hoy, pero el cartel ya lo explicaba antes de apretarlo.
3. Cada aviso muestra el estado de su envío con lo que confirmó el proveedor: Enviado, Entregado, Leído o Falló con el motivo que informó.
4. Si GET /api/whatsapp/estado no responde, el cartel dice que no se pudo consultar el estado y la bandeja sigue usable.
5. Las pruebas de la web cubren los tres estados del cartel (no configurado, Meta y Twilio) y el caso en que no se puede consultar, y la guía visual tiene capturas sacadas con Playwright de la bandeja con y sin WhatsApp activo.

### RF-11: Guardar en PostgreSQL los avisos de falla con su revisión y sus enlaces para que sobrevivan a un reinicio (Funcional)

Los avisos de falla crítica (pendientes de revisión, aprobados, con sus envíos) y los enlaces sin contraseña válidos 7 días están en memoria de AvisosService. Un reinicio borra los avisos que la Secretaría todavía no revisó y deja sin efecto los enlaces que ya llegaron por WhatsApp. Esta Tarea los guarda en la base.

**Condiciones de aprobación**

- 1. Dado un aviso «Pendiente de revisión», cuando se reinicia la API, entonces sigue pendiente en la bandeja de la Secretaría y se puede aprobar.
- 2. Dado un enlace de aviso enviado por WhatsApp, cuando se reinicia la API, entonces el enlace sigue abriendo el informe y vence a los 7 días de creado, no del reinicio.
- 3. Dado un aviso ya aprobado y enviado, cuando se reinicia la API, entonces no se vuelve a enviar y conserva el estado de cada envío.
- 4. Las pruebas existentes de avisos y del enlace siguen en verde, y una prueba de integración con la base real reinicia el servicio y comprueba los criterios 1 a 3.

### RF-12: Guardar en PostgreSQL el historial de envíos de WhatsApp para que sobreviva a un reinicio (Funcional)

El historial de envíos de WhatsApp y su estado real (aceptado, enviado, entregado, leído, fallido) vive en memoria de WhatsAppConnectorService. Con un reinicio se pierde, y los avisos del proveedor (webhook) que llegan después no encuentran el envío al que corresponden. Esta Tarea lo guarda en la base.

**Condiciones de aprobación**

- 1. Dado un envío con su estado, cuando se reinicia la API, entonces la bandeja de avisos sigue mostrando el envío y su estado real.
- 2. Dado un envío «Aceptado» antes del reinicio, cuando el proveedor avisa después que fue entregado o leído, entonces el estado se actualiza en el envío correcto.
- 3. Un aviso viejo del proveedor no hace retroceder el estado de un envío (aceptado → enviado → entregado → leído; fallido se mantiene), antes y después del reinicio.
- 4. Las pruebas existentes de WhatsApp siguen en verde, y una prueba de integración con la base real reinicia el servicio y comprueba los criterios 1 y 2.

### RF-13: Pedir sesión de la Secretaría para ver el historial de envíos de WhatsApp (Funcional)

GET /api/whatsapp/historial es público y devuelve los teléfonos de los destinatarios. Solo la Secretaría y el Administrador lo necesitan (la bandeja de avisos).

**Condiciones de aprobación**

- 1. Dado un pedido sin sesión, cuando se consulta el historial de WhatsApp, entonces responde 401.
- 2. Dado un usuario RT de Calle, Firmante o ECA, cuando consulta el historial, entonces responde 403.
- 3. Dada la Secretaría o el Administrador, cuando consultan el historial, entonces responde 200 y la bandeja de avisos sigue mostrando los envíos.

### RF-14: Que el estado general de un aviso refleje un envío de WhatsApp que falla después (Funcional)

Un aviso que ya figura «Enviado» sigue diciéndolo aunque WhatsApp informe después que alguno de sus envíos falló; el motivo solo se ve en la lista de envíos. La Secretaría debería enterarse sin abrir cada aviso.

**Condiciones de aprobación**

- 1. Dado un aviso «Enviado» con un envío que el proveedor informa luego como fallido, cuando la Secretaría abre la bandeja, entonces el aviso muestra que falló un envío y ofrece «Reintentar envío».
- 2. Dado ese aviso, cuando el reintento sale bien, entonces el aviso vuelve a figurar «Enviado» y el historial conserva el fallo anterior.
- 3. Un aviso con todos sus envíos entregados o leídos sigue figurando «Enviado», y las pruebas existentes de la bandeja siguen en verde.

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

### RF-03: FIX: Mostrar las horas en formato de 24 horas en toda la app (Funcional)

La web formatea fechas y horas con toLocaleString('es-AR') sin indicar el ciclo horario. En Chrome eso escribe las 15:15 como «21/11/2026, 03:15:00», sin a. m. ni p. m., así que una alerta de la tarde parece de la madrugada. Hay 23 usos en 9 archivos: avisos/BandejaAvisos.tsx (4), consorcios/FichaConsorcio.tsx (7), eca/AlertasCriticas.tsx (3), checklist/InspeccionCampoView.tsx (2), fallas/AlertaFallaCritica.tsx (2), firmante/ModalAuditoria.tsx (2), informe/cola.ts (1), mapa/descarga.ts (1) y visitasFallidas/ConstanciaVisitaFallida.tsx (1). backoffice/monitoreo.ts ya lo hace bien con hourCycle 'h23' y la zona America/Argentina/Buenos_Aires. Se encontró en QA de HU-11 RF-10 sobre testing (4413966).

**Condiciones de aprobación**

- 1. Dada una fecha con hora de la tarde (por ejemplo 15:15 de Buenos Aires), cuando se muestra en cualquier pantalla de la app, entonces se lee «15:15» y nunca «03:15» sin a. m./p. m.
- 2. Todas las fechas con hora de la web salen de una única función de formato compartida, con hourCycle 'h23' y la zona America/Argentina/Buenos_Aires; en apps/web/src no queda ningún toLocaleString o toLocaleTimeString con hora que no la use.
- 3. Las fechas sin hora no cambian.
- 4. Una prueba de la función de formato cubre la mañana, la tarde, la medianoche (00:xx) y un navegador en otra zona horaria; npm run verify sigue en verde.
- 5. Una captura con Playwright de la bandeja de avisos y de la ficha del edificio muestra una hora de la tarde en formato de 24 horas.

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

## RO-01: RO-01: Setup del proyecto y entorno de desarrollo verificable

### RF-01: RO-01: Setup del proyecto y entorno de desarrollo verificable (Funcional)

Inicializar el monorepo (web React+Vite PWA, API NestJS, PostgreSQL+PostGIS en Docker) con HTTPS local en https://localhost:8050 y CORS habilitado solo en desarrollo para el origen de Scrum Master AI (https://scrum.nuestrocamino.cloud).

**Condiciones de aprobación**

1. GET https://localhost:8050/api/health responde 200 con el estado de la API y de la base de datos.
2. Una petición con Origin: https://scrum.nuestrocamino.cloud recibe Access-Control-Allow-Origin con ese origen, y una con otro origen no lo recibe.
3. Con la configuración de producción, la API no devuelve encabezados CORS.
4. docker compose up levanta PostgreSQL con PostGIS, y /api/health informa la versión de PostGIS.
5. https://localhost:8050 carga la app web y registra el service worker.

## RO-02: Probar el envío real de WhatsApp con el celular de German

### RF-01: Probar el envío real de WhatsApp con el celular de German (Funcional)

Hasta ahora el conector con Meta y Twilio solo se probó contra un receptor falso local; nunca salió un mensaje real. Con una cuenta de prueba (el sandbox de Twilio o el número de prueba de Meta Cloud API, que no piden verificar una empresa) se manda un aviso real al celular de German para ver cómo llega, cuánto tarda y qué muestra el enlace. Sirve para decidir con datos antes de desarrollar las tareas de plantilla y confirmación. Las credenciales se cargan solo en el .env local o en la terminal.

**Condiciones de aprobación**

1. Hay un entorno de prueba de WhatsApp activo (el sandbox de Twilio o el número de prueba de Meta Cloud API) con el celular de German autorizado como destinatario.
2. Las credenciales del proveedor están solo en el .env local, que git ignora, y en ningún archivo del repositorio: buscar el token con git grep no encuentra nada.
3. GET /api/whatsapp/estado responde configurado true y el proveedor elegido, y no incluye ninguna credencial.
4. Al apretar «Aprobar y enviar» sobre un aviso de falla crítica de prueba en la bandeja de Secretaría, el WhatsApp llega al celular de German en menos de 5 segundos, con el edificio, el equipo, el estado y el enlace al informe.
5. El enlace del mensaje abre el informe en el celular sin pedir contraseña.
6. El envío figura en la bandeja de Secretaría y en GET /api/whatsapp/historial con el id de mensaje que devolvió el proveedor.
7. Queda anotado en un documento bajo docs/ lo que se observó en el celular (qué llegó, cuánto tardó, qué mostró el enlace) y lo que no funcionó.

## RO-03: Dar de alta WhatsApp Business a nombre de MAICON y aprobar la plantilla del aviso

### RF-01: Dar de alta WhatsApp Business a nombre de MAICON y aprobar la plantilla del aviso (Funcional)

Para que los avisos salgan en producción hace falta un número de WhatsApp Business de MAICON, con la empresa verificada por el proveedor y la plantilla del aviso aprobada. Es un trámite con el cliente y con el proveedor que puede llevar días, por eso conviene empezarlo cuanto antes. Depende de que la tarea de plantilla deje escrito el texto final.

**Condiciones de aprobación**

1. MAICON confirmó por escrito qué número de WhatsApp se usa como remitente y quién es la persona de guardia que recibe las alertas; los números no se guardan en el repositorio.
2. En el panel del proveedor existe una cuenta de WhatsApp Business a nombre de MAICON con la verificación de empresa completa.
3. La plantilla del aviso, con el texto que dejó la tarea de plantilla, figura como Aprobada en el panel del proveedor.
4. Un envío de prueba desde ese número llega al celular de la persona de guardia de MAICON.
5. Las credenciales de producción se cargan solo en las variables de entorno del servidor: ninguna en el repositorio.
6. Queda un documento breve bajo docs/ con los pasos que se hicieron y a nombre de quién está la cuenta, sin credenciales ni números.

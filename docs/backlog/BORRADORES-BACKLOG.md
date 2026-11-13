# Borradores de backlog — mant_asc

**Fecha:** 05/11/2026
**Estado:** histórico. Era el borrador del 05/11/2026; **ya se cargó en Scrum** (con cambios, tras las respuestas del cliente del 12/11/2026). La fuente de verdad es el tablero de Scrum, no este archivo.
**Base:** "Desarrollo lógico de app para Representante Técnico" (cliente), `DEFINICIONES-CLIENTE.md` y el backlog del 05/11/2026.

Los valores que dependen del cliente usan el **valor propuesto** de `DEFINICIONES-CLIENTE.md` (P1 a P13). Si responde otra cosa, se ajusta la tarea afectada.

Las estimaciones son tentativas: las confirma el Scrum Master al agendar. Las dependencias se escriben por nombre porque las tareas todavía no existen; al cargar se reemplazan por su ID.

## Orden de carga sugerido

| # | Qué | Quién lo carga |
|---|---|---|
| 1 | Decidir el contenedor de las Definiciones (Parte 1) | Vos |
| 2 | 5 tareas de Definiciones | PM |
| 3 | Ajustes a Historias existentes (Parte 2) | PM |
| 4 | HU Acceso y aislamiento (Parte 3, A y B) | PO; tareas: PM |
| 5 | HU del recorrido del RT (Parte 3, C a F) | PO; tareas: PM |

Se carga de a una pieza y validando cada una, como pide el procedimiento.

---

# Parte 1 — Tareas de "Definiciones del Cliente"

## Decisión previa: ¿Historia u operacional?

La **HU-12** ya existe, pero al mirar el procedimiento completo aparece un problema: una tarea dentro de una Historia genera 2 Tests por condición y, para llegar a "Hecho", necesita rama, commits, Pull Request y Tests aprobados. Estas tareas no tienen código, así que quedarían trabadas en `to_do`.

| Opción | A favor | En contra |
|---|---|---|
| **Operacional (recomendada)** | No exige condiciones de aprobación ni genera Tests. Es el tipo previsto para "reunión con el cliente" o "validación" | Hay que borrar la HU-12 (lo hace el PM o el PO, con tu confirmación) |
| Mantener la HU-12 | Es lo que pediste originalmente | Cada tarea arrastra Tests y circuito de código que no aplican |

**Quién escribe las respuestas:** `observations` solo lo puede editar el PM o el developer asignado, y el cliente no tiene cuenta. Propuesta: el cliente responde por mail o en una reunión, y el PM vuelca la respuesta en Observaciones.

El texto de abajo sirve para las dos opciones.

## D1. Definiciones: Recorrido en calle y validación de presencia

**Descripción:**
Responder en Observaciones con "P#: Acepto" o "P#: Cambio — …". Plazo: 12/11/2026; sin respuesta se adopta el valor propuesto.

- **P1. Geocerca.** Los botones aparecen a 30 m del edificio, pero el GPS puede errar 20–40 m. Propuesto: se respetan los 30 m; si el GPS no tiene precisión suficiente, el botón "Sin buena señal GPS" obliga a sacar una foto del frente y la inspección queda marcada para revisión de la Secretaría.
- **P2. Equipo de los RT.** Propuesto: tablet Android de la empresa con datos móviles. Indicar: ¿tablet o celular? ¿Android o iPhone? ¿Del RT o de la empresa? ¿Tiene plan de datos?

**Condiciones de aprobación:**
1. Observaciones contiene la respuesta a P1.
2. Observaciones contiene la respuesta a P2, con tipo de equipo, sistema operativo y datos móviles.
3. Si venció el plazo, Observaciones deja constancia de que se adoptaron los valores propuestos.

## D2. Definiciones: Fallas críticas y estado del ascensor

**Descripción:** mismo formato y plazo.

- **P3. Ítems que son Falla Crítica.** Propuesto: la lista completa de `DEFINICIONES-CLIENTE.md` (Tema 2). Indicar qué agregar o sacar.
- **P4. Estado del ascensor ante una Falla Crítica.** Propuesto: alerta a la Secretaría y PDF a la ECA; el estado "Fuera de servicio" o "No apto" lo cambia la Secretaría a mano.
- **P5. Fotos ante una falla.** Propuesto: obligatoria en Falla Crítica y en ascensor fuera de servicio; opcional en el resto.
- **P6. Hidráulicos y montavehículos.** Propuesto: no se muestran Poleas, Cables ni Extensión de Cables de Tracción; "Pérdida de Aceite" se usa para émbolo y empaquetadura.

**Condiciones de aprobación:**
1. Observaciones contiene la respuesta a P3, con los ítems agregados o quitados si los hay.
2. Observaciones contiene la respuesta a P4.
3. Observaciones contiene la respuesta a P5.
4. Observaciones contiene la respuesta a P6.
5. Si venció el plazo, Observaciones deja constancia de que se adoptaron los valores propuestos.

## D3. Definiciones: Firma del informe

**Descripción:** mismo formato y plazo.

- **P7. Datos de quien firma.** Propuesto: nombre, apellido y carácter (Encargado / Administrador / Propietario) obligatorios; DNI opcional.
- **P8. Sin nadie para firmar.** Propuesto: el RT puede cerrar "Sin firma" con motivo y foto; el informe se envía marcado para la Secretaría.

**Condiciones de aprobación:**
1. Observaciones contiene la respuesta a P7.
2. Observaciones contiene la respuesta a P8.
3. Si venció el plazo, Observaciones deja constancia de que se adoptaron los valores propuestos.

## D4. Definiciones: Visitas fallidas y recargo

**Descripción:** mismo formato y plazo.

- **P9. Conteo de advertencias.** Propuesto: consecutivas por edificio; una visita exitosa vuelve el contador a cero; la 3.ª suma el 45 % automáticamente; un Administrador puede anularlo con motivo.
- **P10. Remitente de los emails.** Propuesto: dirección genérica del sistema hasta recibir una de MAICON. Indicar la dirección a usar.

**Condiciones de aprobación:**
1. Observaciones contiene la respuesta a P9.
2. Observaciones contiene la respuesta a P10, con la dirección si la hay.
3. Si venció el plazo, Observaciones deja constancia de que se adoptaron los valores propuestos.

## D5. Definiciones: Datos para la carga inicial

**Descripción:** mismo formato y plazo.

- **P11. Listado de edificios y equipos.** Propuesto: enviamos una planilla Excel modelo; mientras tanto se trabaja con datos de prueba. Indicar si ya existe el listado, en qué formato, y si hay algún sistema de la AGC del que se pueda descargar.
- **P12. Formato de horarios.** Propuesto: hasta 2 franjas por día, variables por día de la semana; feriados cerrado; sin horario fijo, "A coordinar".
- **P13. Documento general de MAICON.** Propuesto: si no llega, la foto de cables se pide solo cuando se marcan DESGASTADOS. Pedirle el documento.

**Condiciones de aprobación:**
1. Observaciones contiene la respuesta a P11.
2. Observaciones contiene la respuesta a P12.
3. Observaciones indica si se recibió el documento de P13.
4. Si venció el plazo, Observaciones deja constancia de que se adoptaron los valores propuestos.

---

# Parte 2 — Ajustes a lo que ya existe

| Dónde | Cambio propuesto | Motivo |
|---|---|---|
| **HU-03** | Reemplazar el rastreo GPS en vivo por "ver en el mapa el semáforo de edificios ya controlados". Quitar "Servicio de Telemetría GPS" (4 h) y reescribir "UI Mapa de Flota" sin pines de técnicos: el mapa se sigue necesitando | La nota del cliente dice que el rastreo "no es necesario". También evita seguir empleados en vivo (Ley 25.326). **Antes confirmar:** el criterio del despacho de emergencia también depende del GPS en vivo |
| **HU-04** | Si se quita la telemetría, "UI Mapa de Flota" y "Motor de Control Semafórico" pasan a depender de "API de Asignación Tripartita de Roles por Edificio" (REQ-1791910395002) | Hoy las dos cuelgan de la telemetría, y por ellas pasa toda la cadena de HU-04 y HU-05 |
| **HU-06** | "Recepción de Falla Crítica" pasa a depender de la tarea "Motor del checklist" (Historia E) | No hay falla crítica sin un checklist donde cargarla |
| **HU-07** | Agregar la tarea "Pantalla de constancia de visita fallida" (abajo) | La Historia describe el reporte del RT, pero nadie construye esa pantalla |
| **HU-07** | Aclarar en "Bloqueo por Advertencia 3" qué significa bloquear el edificio | El documento del cliente dice que el RT **puede volver a ir** con recargo. La HU dice "bloquea". Confirmar que es solo un cartel en el tablero |

### Tarea nueva en HU-07: Pantalla de constancia de visita fallida

- **Tipo:** funcional · **Estimación:** 4 h
- **Depende de:** Tarjeta de contacto del edificio (Historia D).
- **Descripción:** Al tocar `No se pudo realizar la inspección`, registrar GPS y hora sin que se puedan editar, pedir la causa y exigir una foto del ingreso.
- **Condiciones de aprobación:**
  1. La pantalla ofrece las 3 causas del documento del cliente y exige elegir una.
  2. `Guardar Advertencia de Visita` queda deshabilitado hasta tener causa y foto.
  3. El registro guarda coordenadas, precisión del GPS, hora del dispositivo y hora del servidor, y ninguna se puede editar.
  4. Al guardar, el contador de advertencias del edificio suma 1 y el pin desaparece del mapa del RT por ese día.
  5. Se registra como máximo una advertencia por edificio por día.

---

# Parte 3 — Historias nuevas

Los códigos los asigna la app al cargarlas.

## Historia A — Acceso por rol

**Descripción:** Como usuario del sistema (RT, Secretaria, Firmante, ECA o Administrador) quiero ingresar con mis credenciales para ver solo lo que corresponde a mi rol.

**Criterios de aceptación:**
1. Dado un usuario activo, cuando ingresa usuario y contraseña correctos, entonces entra a la pantalla inicial de su rol.
2. Dadas credenciales incorrectas, cuando intenta ingresar, entonces ve un error y no entra.
3. Dado un usuario de un rol, cuando pide un recurso de otro rol, entonces el sistema responde 403.
4. Dado un dispositivo perdido, cuando un Administrador revoca la sesión, entonces ese dispositivo no puede volver a sincronizar ni a pedir datos.

### Tareas

**A1. API de autenticación y roles** · funcional · 6 h · Depende de: RO-01
1. `POST /api/auth/login` responde 200 con credenciales válidas y 401 con inválidas, con el mismo mensaje exista o no el usuario.
2. La contraseña se guarda con bcrypt, costo 12 o superior.
3. El token de acceso vence a los 15 minutos y se renueva con un token de refresco guardado en cookie httpOnly.
4. Una ruta con rol requerido responde 401 sin sesión y 403 con otro rol.
5. Tras 5 intentos fallidos seguidos, el login responde 429 durante 15 minutos.
6. Revocar una sesión hace que su token de refresco responda 401.

**A2. Pantalla de ingreso** · funcional · 3 h · Depende de: A1
1. La pantalla muestra el logo de MAICON S.R.L., `Usuario / Email`, `Contraseña` con opción de ver u ocultar, e `Ingresar al Sistema`.
2. Con credenciales válidas redirige a la pantalla inicial del rol; el RT entra a su mapa.
3. Con credenciales inválidas muestra el error y no navega.
4. Una sesión iniciada sigue disponible sin señal hasta que el RT cierre sesión.

## Historia B — Aislamiento de datos entre ECA

**Descripción:** Como Empresa Conservadora quiero que mis datos queden aislados de los de otras ECA para mantener la confidencialidad de mis clientes.

**Criterios de aceptación:**
1. Dado un usuario de la ECA A, cuando consulta listados, entonces solo ve datos de la ECA A.
2. Dado un usuario de la ECA A, cuando pide por URL un recurso de la ECA B, entonces recibe 404.
3. Dado un RT o Firmante, cuando consulta máquinas, entonces ve solo las asignadas, aunque sean de varias ECA.

### Tareas

**B1. Row Level Security por ECA** · no_funcional · 6 h · Depende de: A1 y "API y Modelo de Datos de Consorcios y Máquinas" (REQ-1791909582859)
1. Toda tabla con datos de una ECA tiene RLS activo con política por `eca_id`.
2. La API se conecta con un usuario de base sin permiso `BYPASSRLS` y que no es dueño de las tablas.
3. Una consulta sin contexto de ECA devuelve 0 filas.
4. Un test automático crea datos de 2 ECA y falla si una puede leer filas de la otra.

**B2. Acceso de RT y Firmante a varias ECA** · no_funcional · 4 h · Depende de: B1 y "API de Asignación Tripartita de Roles por Edificio" (REQ-1791910395002)
1. Un RT ve solo los edificios asignados a él, sin importar la ECA.
2. Un Firmante ve solo las máquinas bajo su matrícula.
3. Al quitar una asignación, ese usuario deja de ver el edificio en la siguiente consulta.

> **Pregunta abierta:** ¿un mismo edificio puede tener ascensores de distintas ECA? Hoy HU-02 asigna una sola ECA por edificio. Si eso es correcto, el `eca_id` va en el edificio. Si no, va en el equipo. Conviene definirlo **antes** de la tarea de modelo de datos de HU-01.

## Historia C — Horarios, contacto y tipo de equipo

**Descripción:** Como Secretaria quiero cargar horarios, contacto, pisos, administración y tipo de cada equipo para que el RT tenga en la calle todo lo que necesita.

**Criterios de aceptación:**
1. Dado un edificio, cuando se cargan sus horarios o se marca "A coordinar", entonces quedan disponibles para calcular el color del pin.
2. Dado un equipo, cuando se le asigna tipo y sala de máquinas, entonces el checklist muestra los ítems que corresponden.

### Tareas

**C1. Datos operativos del edificio y del equipo** · funcional · 4 h · Depende de: "UI de Secretaría: Carga y Ficha de Edificios y Máquinas" (REQ-1791910394885)
1. Un edificio admite hasta 2 franjas por día de la semana, o la opción "A coordinar".
2. Un edificio guarda encargado, teléfono, email de administración y lista de pisos.
3. Un equipo guarda tipo (tracción, hidráulico o montavehículos) y sala de máquinas.
4. Dos o más equipos pueden compartir la misma sala de máquinas.

## Historia D — Mapa de disponibilidad del RT

**Descripción:** Como RT quiero ver mis edificios en un mapa según si están abiertos ahora, con sus datos de contacto, para no ir en vano.

**Criterios de aceptación:**
1. Dado un RT logueado, cuando entra, entonces ve su zona, la hora actual y solo sus edificios pendientes.
2. Dado un edificio, cuando se evalúa su horario, entonces el pin es verde si está abierto, rojo si está cerrado y amarillo si es "A coordinar".
3. Dado un pin, cuando el RT lo toca, entonces ve la tarjeta con dirección, estado, encargado y horarios, y puede llamar o abrir la ruta.
4. Dado un RT a 30 m o menos, cuando mira la tarjeta, entonces aparecen `Iniciar Inspección` y `No se pudo realizar la inspección`.

### Tareas

**D1. Mapa con pines por horario** · funcional · 5 h · Depende de: A2, B2, C1
1. El encabezado muestra saludo, zona y hora actual, como en `Hola Ing. Aliado 1 | Zona Norte | 11:30 hs`.
2. Una función de cálculo devuelve verde, rojo o amarillo, con tests para dentro de franja, fuera de franja, feriado y "A coordinar".
3. Los pines cambian de color al cruzar una franja horaria sin recargar la pantalla.
4. El mapa no muestra edificios de otro RT ni los ya resueltos en el día.

**D2. Tarjeta de contacto del edificio** · funcional · 4 h · Depende de: D1
1. Al tocar un pin se muestran dirección, barrio, estado, encargado y horarios.
2. El botón de llamada abre el marcador con el teléfono del encargado.
3. `Cómo llegar` abre Google Maps con destino en el edificio.
4. A 30 m o menos aparecen `Iniciar Inspección` y `No se pudo realizar la inspección`.
5. Si el GPS no alcanza la precisión requerida, aparece `Sin buena señal GPS`, que exige una foto y marca la visita para revisión.

## Historia E — Inspección técnica por solapas

**Descripción:** Como RT quiero relevar cada equipo por solapas, moviéndome por el edificio, para registrar el estado de todas las máquinas en una sola visita.

**Criterios de aceptación:**
1. Dado un edificio con varios equipos, cuando el RT inicia la visita, entonces puede cambiar de M1 a M2 o M3 dentro de la misma solapa.
2. Dado un ítem marcado con falla, cuando corresponde foto, entonces aparece el botón `Adjuntar Foto de Anomalía`.
3. Dada una sala compartida, cuando se cargan los datos del entorno en un equipo, entonces se aplican a los demás de esa sala.
4. Dado un equipo fuera de servicio, cuando se guarda el reporte, entonces la oficina recibe la alerta y ese equipo queda resuelto sin afectar a los demás.
5. Dado que no hay señal, cuando el RT trabaja, entonces no pierde lo cargado.

### Tareas

**E1. Motor del checklist** · funcional · 5 h · Depende de: RO-01
1. Las 5 solapas, subgrupos, ítems y opciones se definen en un archivo de configuración versionado, no en pantallas programadas una por una.
2. Cada opción indica si es falla, si pide foto y si es Falla Crítica.
3. Cada ítem indica a qué tipos de equipo aplica.
4. Un test verifica que la configuración incluye todos los ítems del documento del cliente.
5. Cada inspección guarda qué versión del checklist se usó.

**E2. Selección de equipo y filtro de estado** · funcional · 3 h · Depende de: D2, E1
1. Muestra los equipos del edificio con sus referencias AGC.
2. `SÍ, EN USO` habilita las solapas y `NO, FUERA DE SERVICIO` abre la pantalla de detención.
3. No se puede avanzar sin responder la pregunta.

**E3. Reporte de parada** · funcional · 3 h · Depende de: E2
1. Exige causa y foto para habilitar `Guardar Reporte de Parada`.
2. Al guardar, la oficina recibe la alerta roja.
3. El pin desaparece recién cuando todos los equipos del edificio están resueltos.

**E4. Pantalla de solapa generada desde el motor** · funcional · 5 h · Depende de: E1, E2
1. Una sola pantalla dibuja las 5 solapas a partir de la configuración.
2. Cada solapa tiene `Observaciones` de texto libre.
3. Una solapa queda con tilde solo cuando todos sus ítems que aplican están respondidos.
4. En equipos hidráulicos no aparecen los ítems excluidos.

**E5. Fotos por anomalía** · funcional · 4 h · Depende de: E4
1. Marcar una falla muestra `Adjuntar Foto de Anomalía` con el nombre del ítem; una opción correcta no lo muestra.
2. Una Falla Crítica sin foto impide completar la solapa.
3. Las fotos se comprimen a 500 KB o menos antes de guardarse.

**E6. Fallas por piso en Accesos** · funcional · 3 h · Depende de: E4, E5
1. `+ Agregar Falla en un Piso` permite elegir piso y componente.
2. Los componentes son los del documento: Mecánica de Puerta, Seguridad Crítica y Llamadores.
3. Se pueden cargar varias fallas por piso y eliminar una antes de cerrar.

**E7. Navegación por estaciones y sala compartida** · funcional · 4 h · Depende de: E4
1. Cada solapa muestra selectores `M1`, `M2`, `M3` y cambiar de equipo conserva lo cargado.
2. Se puede marcar la sala como compartida y elegir con qué equipos.
3. Los datos de entorno cargados en una sala aparecen en los demás equipos sin volver a cargarlos.
4. `Ir a Accesos/Cabinas` lleva a la estación siguiente.

**E8. Visita en curso sin señal** · no_funcional · 5 h · Depende de: E4, E5
1. Respuestas y fotos se guardan en IndexedDB al cargarlas, nunca en LocalStorage.
2. Cerrar y reabrir la app sin señal recupera la visita en el mismo punto.
3. La app abre sin señal si ya se cargó una vez con señal.
4. Una visita de 3 equipos con 20 fotos completa el recorrido sin conexión en el equipo real.

## Historia F — Cierre y firma del informe

**Descripción:** Como RT quiero consolidar todos los equipos en un informe y que el encargado firme una sola vez para cerrar la visita.

**Criterios de aceptación:**
1. Dadas todas las solapas completas, cuando el RT termina, entonces se habilita `Consolidar Informe y Proceder a Firma`.
2. Dado el informe consolidado, cuando el encargado firma, entonces se genera un informe por equipo con esa firma.
3. Dado un informe firmado, cuando alguien intenta modificarlo, entonces el sistema lo rechaza.
4. Dado que no hay señal al firmar, cuando vuelve la conexión con la app abierta, entonces el informe se envía sin duplicarse.

### Tareas

**F1. Consolidación y firma en pantalla** · funcional · 4 h · Depende de: E7
1. El botón se habilita solo con todas las solapas de todos los equipos completas.
2. La firma se captura con el dedo y no se acepta vacía.
3. Exige nombre, apellido y carácter de quien firma; el DNI es opcional.
4. `Sin firma` exige motivo y foto, y deja el informe marcado.

**F2. Sellado del informe** · no_funcional · 4 h · Depende de: F1
1. Al cerrar se calcula un hash SHA-256 del contenido, la firma y las fotos.
2. Se guardan la hora del dispositivo y la del servidor.
3. Un intento de modificar un informe cerrado responde 409 y queda registrado.
4. Una función verifica que el hash coincide y lo informa en la auditoría.

**F3. Cola de sincronización** · no_funcional · 5 h · Depende de: F1, E8
1. Lo pendiente queda en cola y la app muestra `N inspecciones sin subir`.
2. Al volver la señal con la app abierta, la cola se envía sola; en iPhone no depende de Background Sync.
3. Reenviar el mismo informe no lo duplica, gracias al UUID generado en el dispositivo.
4. Un envío interrumpido se reintenta sin perder fotos.
5. Si la sesión venció, lo pendiente se conserva y se envía después de volver a ingresar.

---

# Lo que falta decidir

| Pregunta | Quién | Bloquea |
|---|---|---|
| ¿Operacional o HU-12 para las Definiciones? | Vos | La carga de las 5 tareas |
| ¿Un edificio puede tener ascensores de distintas ECA? | Cliente | Modelo de datos de HU-01 |
| ¿Sacamos el despacho de emergencia junto con el GPS en vivo (HU-03)? | Cliente | Reescribir HU-03 |
| ¿La tarjeta de edificio y el login van en Entrega 1 o en una nueva? | PM | Ubicar las Historias nuevas en las Entregas |

La pregunta sobre si un edificio puede tener varias ECA no está en `DEFINICIONES-CLIENTE.md`: conviene sumarla, porque es la más cara de cambiar después.

**Volumen:** 18 tareas nuevas en Historias más 1 en HU-07, unas 81 h estimadas, que se suman a las 87 h del backlog actual.

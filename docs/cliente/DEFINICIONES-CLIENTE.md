# Definiciones del Cliente — Sistema de Inspecciones MAICON S.R.L.

**Fecha:** 05/11/2026
**Fecha límite sugerida para responder:** 12/11/2026

## Cómo funciona este documento

Para no frenar el desarrollo, **cada pregunta ya trae un valor propuesto** por el equipo.

- Si el valor propuesto le sirve, alcanza con escribir **"P1: Acepto"**.
- Si quiere otra cosa, escriba **"P1: Cambio — …"** y explique lo que necesita.
- Si a la fecha límite una pregunta no tiene respuesta, **avanzamos con el valor propuesto**. Se puede cambiar después, pero cuanto más tarde, más trabajo implica.

Cada tema es una **tarea en el tablero de Scrum**. Las respuestas se escriben en el campo **Observaciones** de esa tarea.

---

## Tema 1 — Recorrido en calle y validación de presencia

**P1. Distancia para iniciar la inspección (geocerca)**
Su documento indica que los botones "Iniciar Inspección" y "No se pudo realizar" aparecen recién a 30 metros del edificio. En calles con edificios altos, el GPS a veces se equivoca entre 20 y 40 metros, y un RT que está en la puerta podría no poder empezar.
> **Valor propuesto:** se respetan los 30 m. Si el GPS no logra precisión suficiente, aparece un botón **"Sin buena señal GPS"** que obliga a sacar una foto del frente del edificio. La inspección se puede hacer, pero queda **marcada para revisión** por la Secretaría.

**P2. Equipo que usarán los RT**
Necesitamos saberlo para probar la app en el equipo real y asegurar el funcionamiento sin señal.
> **Valor propuesto:** tablet **Android** provista por la empresa, con datos móviles.
> Indique: ¿tablet o celular? ¿Android o iPhone? ¿Del RT o de la empresa? ¿Tiene plan de datos?

---

## Tema 2 — Fallas críticas y estado del ascensor

**P3. ¿Qué ítems del checklist son "Falla Crítica"?**
Cuando el RT carga una Falla Crítica, la Secretaría recibe una alerta inmediata (visual y sonora) y se genera el PDF para la ECA. Su documento marca algunos ítems como "Alerta Crítica", "Peligro" o "PROHIBIDO", pero no define la lista completa.
> **Valor propuesto:** se consideran Falla Crítica:
> - Sala de Máquinas: Pérdida de aceite **CRÍTICA**; Cables de tracción **DESGASTADOS**; Limitador de velocidad **DEFICIENTE**; Corte de fuerza motriz **NO ACTÚA**; Tablero principal **FUERA DE NORMA**.
> - Cabina: Puerta tipo **Tijera (PROHIBIDA)**; Botón de PARE **Falla**; Alarma **Falla**; Piso **Madera / No ignífugo (PROHIBIDO)**; Baranda de techo **NO / REQUIERE INSTALACIÓN**; Paracaídas **Anomalía**.
> - Accesos: Destrabe manual **TRABADO / INEXISTENTE**; en un piso, **Cerradura no traba** o **Contacto eléctrico puenteado/falla**.
> - Caja: Instalaciones ajenas **SÍ**; Espacios **CON ABERTURAS**; Límites superiores o inferiores **FALLAN / ANULADOS**.
> - Fosa: Stop de fosa **DEFICIENTE / INEXISTENTE**; Extensión de cables **MUY PEGADO**.
>
> Indique qué ítems agregar o sacar.

**P4. ¿Qué pasa con el ascensor cuando hay una Falla Crítica?**
> **Valor propuesto:** se dispara la alerta a la Secretaría y se genera el PDF para la ECA. El estado del ascensor (por ejemplo "Fuera de servicio" o "No apto") **lo cambia la Secretaría a mano**, no el sistema en forma automática.

**P5. Fotos ante una falla**
Su documento indica que, al marcar una falla, "se despliega el botón de foto", pero no dice si sacarla es obligatorio.
> **Valor propuesto:** la foto es **obligatoria** en Falla Crítica y en ascensor fuera de servicio. En el resto de las fallas es **opcional**.

**P6. Equipos hidráulicos y montavehículos**
Algunos ítems del checklist son exclusivos de equipos de tracción.
> **Valor propuesto:** en equipos hidráulicos **no se muestran** Poleas de Tracción, Cables de Tracción ni Extensión de Cables de Tracción. "Pérdida de Aceite" se usa para el émbolo y la empaquetadura. Todo lo demás se muestra igual.
> Indique si hay otros ítems que no correspondan, o ítems propios de los hidráulicos que falten.

---

## Tema 3 — Firma del informe

**P7. Datos de quien firma**
Una firma sin aclaración es difícil de defender si después alguien la desconoce.
> **Valor propuesto:** son **obligatorios** el nombre y apellido y el carácter de quien firma (Encargado / Administrador / Propietario). El **DNI es opcional**.

**P8. ¿Qué pasa si al terminar no hay nadie para firmar?**
Por ejemplo, el encargado se fue mientras el RT estaba en la fosa.
> **Valor propuesto:** el RT puede cerrar el informe **"Sin firma"**, indicando el motivo y sacando una foto. El informe se envía igual, pero queda **marcado** para que la Secretaría lo vea.

---

## Tema 4 — Visitas fallidas y recargo del 45 %

**P9. Cómo se cuentan las advertencias**
> **Valor propuesto:** se cuentan las advertencias **consecutivas por edificio**. Una visita exitosa vuelve el contador a cero. Con la **3.ª advertencia** se suma el recargo del 45 % en forma automática, tal como pidió. Un Administrador puede **anularlo indicando el motivo**, en caso de error.

**P10. Dirección desde la que salen los emails**
Para los avisos a las administraciones de los consorcios.
> **Valor propuesto:** mientras no tengamos una dirección de MAICON, usamos una dirección genérica del sistema.
> Indique qué dirección quiere usar como remitente (por ejemplo, notificaciones@sudominio.com.ar).

---

## Tema 5 — Datos para la carga inicial

**P11. Listado de edificios y equipos**
Para cargar el sistema necesitamos, por edificio: dirección, ECA, matrículas AGC de cada equipo (M1, M2…), tipo de equipo, cantidad de pisos, encargado y teléfono, horarios de atención y email de la administración.
> **Valor propuesto:** le enviamos una **planilla Excel modelo** para completar. Mientras tanto trabajamos con datos de prueba.
> Indique: ¿ya tiene este listado? ¿En qué formato? ¿Existe algún sistema de la AGC del que se puedan descargar los datos, o se cargan a mano?

**P12. Formato de los horarios de atención**
> **Valor propuesto:** hasta **2 franjas por día**, que pueden variar según el día de la semana (por ejemplo, lunes a viernes de 08:00 a 12:00 y de 16:00 a 20:00, y sábados de 08:00 a 12:00). Los feriados cuentan como **cerrado**. Si el edificio no tiene horario fijo, se marca **"A coordinar"** (pin amarillo).

**P13. Documento general de MAICON**
Su documento menciona un "documento general de MAICON" (por ejemplo, la foto obligatoria de los cables de tracción).
> **Valor propuesto:** si no lo recibimos, la foto de cables se pide solo cuando se marcan como DESGASTADOS.
> Le pedimos que nos envíe ese documento.

---

## Lo que ya resolvimos (no hace falta responder)

Esto no cambia lo que usted pidió: completa casos que el documento no contemplaba o mejora cómo se construye por dentro.

- **Ascensor fuera de servicio en un edificio con varias máquinas:** el pin desaparece del mapa recién cuando **todos** los equipos del edificio están resueltos. Si M1 está parado, igual hay que inspeccionar M2.
- **Fecha, hora y GPS:** se guardan la hora del dispositivo y la hora del servidor, y el registro queda **sellado**: no se puede modificar después.
- **Sala de máquinas compartida:** los datos del entorno se cargan una sola vez y se aplican a todos los equipos de esa sala, como usted describió.
- **Dictado por voz:** se usa el micrófono del teclado de la tablet, que funciona en cualquier campo de texto.
- **Una advertencia por día:** se registra como máximo una advertencia por edificio por día.
- **Colores de los mapas:** en el mapa del RT, el color indica si el edificio está **abierto o cerrado ahora**. En el mapa de la Secretaría, indica el **semáforo del mes** (días 1-10, 11-20, 21-30). Cada mapa lleva su leyenda visible.
- **Rastreo GPS en vivo de los técnicos:** según su nota en "Mapa Interactivo de Flota", no se construye. La Secretaría verá el semáforo de los edificios ya controlados.
- **Títulos del checklist:** corregimos títulos repetidos (Subgrupo A y B de Sala de Máquinas) sin cambiar los ítems.

---

## Carga en el tablero de Scrum

**Historia de Usuario: "Definiciones del Cliente"**
- **Descripción:** Como cliente (MAICON S.R.L.) quiero definir los parámetros operativos y de negocio pendientes para que el sistema se construya según mi forma de trabajo.
- **Criterios de aceptación:**
  - Cada tarea de esta Historia tiene en Observaciones la respuesta del cliente a cada una de sus preguntas, o "Acepto" el valor propuesto.
  - Las preguntas sin respuesta al 12/11/2026 se dan por aceptadas con el valor propuesto, y eso queda anotado en la tarea.
  - Cada respuesta que cambia un valor propuesto queda trasladada a la Historia de Usuario que afecta.

**Tareas (una por tema, sin dependencias, para que no bloqueen el resto del tablero):**

| Tarea | Preguntas | Afecta a |
|---|---|---|
| Definiciones: Recorrido en calle y validación de presencia | P1–P2 | Inicio de inspección / pruebas en el dispositivo |
| Definiciones: Fallas críticas y estado del ascensor | P3–P6 | HU-06 y checklist |
| Definiciones: Firma del informe | P7–P8 | Cierre y firma del informe |
| Definiciones: Visitas fallidas y recargo | P9–P10 | HU-07 |
| Definiciones: Datos para la carga inicial | P11–P13 | HU-01, HU-02 |

Criterio de aceptación de cada tarea: *"Observaciones contiene la respuesta a cada pregunta del tema (o 'Acepto'), o la constancia de que se adoptó el valor propuesto por vencimiento del plazo."*

# Pruebas intermitentes de la API: HU-01 RNF-03 y chat-hilo (28/11/2026)

- **Qué se pidió:** (1) HU-01 RNF-03, `informes.e2e-spec` intermitente: sin reintentos; si aparece una salida de corrida fallida, buscar la causa raíz; si no, dejarla bloqueada. (2) Extra: `chat-hilo.e2e-spec` falló 1 de 20 por un tope de 5 s (escribe 205 mensajes): evaluar subir el tope o bajar el volumen.
- **Resultado:** **HU-01 RNF-03 no se reproduce: sigue bloqueada.** **`chat-hilo` sí se reproduce, y se sabe por qué.**
- **No se cambió ningún código ni ninguna prueba.** Este documento y el script `estres-suite-api.sh` son todo lo que se agrega.

## 1. HU-01 RNF-03 — `informes.e2e-spec`: sin reproducir

### Lo que se probó el 28/11/2026 (en `dev`, PC de desarrollo de 8 núcleos)

| Prueba | Resultado |
|---|---|
| `informes.e2e-spec` sola, con un tope de **1 s** por prueba y gancho (5 veces menos que el normal) | 38 de 38 |
| `informes.e2e-spec` sola, con la máquina cargada (8 procesos usando CPU a pleno) | 38 de 38; cada prueba tarda entre 10 y 100 ms |
| **La suite completa de la API** (105 suites) con 8 workers de Jest **y** 8 procesos usando CPU a pleno (441 s) | `informes.e2e-spec` **pasó**, aunque tardó 90 s en vez de unos 30 |

Sumado a las 20 corridas verdes que hizo German y a las 15 y 10 del 21/11, **no hay ninguna falla de esta prueba para analizar.**

### Por qué no parece un tope de tiempo
`informes.e2e-spec` ya declara `jest.setTimeout(30_000)`: no usa el tope de 5 s. Para que un tope de tiempo la rompa, una sola prueba o gancho tendría que pasar de 30 s cuando hoy tardan menos de 100 ms. Ni siquiera bajo carga se acerca.

### Otras causas que se revisaron y por qué no encajan
- **La comparación con la hora** (`Math.abs(horaServidor - Date.now()) < 10_000`): necesitaría que el servidor se detenga más de 10 s entre cerrar el informe y mirarlo, en el mismo proceso.
- **Dos envíos simultáneos con el mismo `clientReportId`** (`Promise.all`): el repositorio en memoria guarda de forma atómica (compara y agrega en el mismo paso) y la prueba acepta cualquier orden (`[200, 201]` ordenado). En producción lo garantiza una restricción única de la base.
- **Estado compartido entre pruebas:** el repositorio se reinicia en cada `beforeEach` y Jest corre las pruebas de un archivo de a una.

### Decisión: queda bloqueada
No se agregan reintentos (la tarea lo prohíbe) ni se inventa una causa. **Lo que desbloquea la tarea** es la salida completa de la corrida que falle, que dice qué prueba y qué mensaje. Para tenerla a mano, corré la suite completa guardando todo:

```bash
npm test -w apps/api 2>&1 | tee salida-jest.log          # una corrida normal
bash docs/decisiones/2026-11-28-pruebas-intermitentes/estres-suite-api.sh    # una corrida con la máquina ocupada, que provoca los topes de tiempo
```

El script deja la salida completa en un archivo y un resumen de qué falló y cuáles por «Exceeded timeout».

## 2. `chat-hilo.e2e-spec`: reproducido, con causa

### Qué hace la prueba
Dos de sus pruebas («con más de 200 mensajes…» y «con el id del más viejo que se ve…») escriben **205 mensajes uno por uno por HTTP** (`POST /api/chat/mensajes`, con sesión) para pasar el límite de 200 del hilo, y después leen. No declara `jest.setTimeout`, así que usa el tope de **5 s**.

### Medido
| Condición | «con más de 200 mensajes…» | «con el id del más viejo…» |
|---|---|---|
| Máquina libre | **2.141 ms** | **1.831 ms** |
| 8 procesos usando CPU a pleno | **4.903 ms** (97 % del tope) | **4.067 ms** (81 %) |
| Suite completa con 8 workers y 8 procesos extra | **falló: «Exceeded timeout of 5000 ms»** | **falló: «Exceeded timeout of 5000 ms»** |

La causa es de la propia prueba: el tiempo crece con la carga de la máquina, y ya con la máquina libre consume el 40 % del tope. La suite entera bajo carga las pasa de 5 s las dos veces. **No es un problema de la API del chat**: cada pedido tarda unos 10 ms; son 205 seguidos.

### Opciones
| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| **A. Subir el tope** | `jest.setTimeout(30_000)` en el archivo, como hacen otras 26 de las 61 pruebas e2e | Una línea | La prueba sigue siendo lenta (2 s libre, 5 s o más ocupada) y el margen vuelve a achicarse con cada mensaje que se agregue |
| **B. Cargar los mensajes directo en el repositorio** | La prueba escribe los 205 con `ChatRepository.guardarMensaje` (en memoria, microsegundos) y sigue leyendo por HTTP | Baja la prueba a milisegundos y no depende de la carga. Sigue probando lo que importa: el pedido de lectura, el límite de 200 y el encabezado `X-Hay-Anteriores` | Escribir por HTTP ya lo prueban `chat.e2e-spec` y `chat-validacion.e2e-spec`; no se pierde cobertura |
| **C. Bajar el volumen** | Menos de 205 mensajes | — | **No se puede sin cambiar el límite de 200**: la prueba existe justamente para pasarlo |

### Recomendación: B
Es la que resuelve la causa (la prueba escribe de más, por un camino lento) y no esconde nada. Es un arreglo de una hora: una tarea `[FIX]` de HU-19, una rama, la prueba reescrita y su script de entrega. **Está en el tablero como HU-19 RF-11 (`REQ-1795876195557`), de 2 h.**

Si se prefiere lo más rápido, A alcanza para hoy.

## 3. Lo que esto dice del resto de la suite
- **35 de las 61 pruebas e2e no declaran su propio tope** y dependen de los 5 s de Jest. `chat-hilo` es la primera que cae bajo carga; no hay motivo para pensar que sea la única que se acerque.
- Las suites más lentas bajo carga fueron `auth.e2e-spec` (202 s), `auth-eca-usuario.e2e-spec` (187 s), `whatsapp-sesion.e2e-spec` (126 s), `chat-validacion.e2e-spec` (123 s) y `eca.e2e-spec` (115 s). Pasaron, pero tienen mucho más recorrido que en una corrida normal.
- **No se recomienda subir el tope global de Jest** (`testTimeout`) para tapar todo junto: esconde las pruebas que se están volviendo lentas. Conviene arreglar las que se acerquen, una por una.

## 4. Cómo se midió
```bash
# Con la máquina libre, el detalle de cada prueba
cd apps/api && npx jest chat-hilo.e2e --verbose
# Con la máquina ocupada: 8 procesos que usan CPU a pleno durante 90 s
for i in 1 2 3 4 5 6 7 8; do (node -e "const t=Date.now();while(Date.now()-t<90000){}" &); done
cd apps/api && npx jest chat-hilo.e2e --verbose
# La suite completa bajo carga (la que reprodujo la falla)
bash docs/decisiones/2026-11-28-pruebas-intermitentes/estres-suite-api.sh
```

**Límites de esta medición:** una sola corrida completa bajo carga, en una PC. Los números exactos cambian de una máquina a otra y de una corrida a otra; lo que importa es el orden de magnitud y que el tiempo de `chat-hilo` crece con la carga. En la misma corrida cayó también `paradas.spec.ts`, la falla conocida de HU-10 RF-08, que arregla el PR #130 (HU-17 RF-12).

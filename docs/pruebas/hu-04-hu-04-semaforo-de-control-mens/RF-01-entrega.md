# HU-04 · RF-01 · Entrega — Motor de control semafórico por antigüedad de visita

- **Tarea:** HU-04 / RF-01 — `REQ-1791910395389`
- **Rama:** `feature/hu-04-hu-04-semaforo-de-control-mens/req-1791910395389-motor-de-control-semaforico-por-antigued`
- **Depende de:** HU-02 RF-01 (API de roles por edificio, de donde sale el RT de Calle), ya integrada y certificada
- **Fuente de las reglas:** definiciones del cliente, P2.c (cuestionario del 06/11/2026) y la tarjeta: «un edificio pendiente toma el color del tramo del mes y pasa a verde en cuanto se inspecciona; el día 31 un pendiente es rojo. No hay seguimiento GPS de técnicos»
- **Script del flujo integrado:** [RF-01-entrega.sh](RF-01-entrega.sh)
- **Guía visual:** no corresponde. Es sólo API: el mapa que muestra estos colores es RF-02 de esta Historia.

## 1. Qué quedó implementado

`GET /api/semaforo` calcula, para cada edificio, su color del mes. Código en `apps/api/src/semaforo/`:

| Archivo | Qué hace |
|---|---|
| `semaforo.logic.ts` | Reglas puras, sin base ni reloj: tramos, estado del edificio, orden, fechas en hora de Buenos Aires |
| `pg-semaforo.repository.ts` | **Una sola consulta SQL** (sin N+1) que devuelve por edificio sus máquinas, cuántas inspeccionó en el mes, la fecha de la última y el RT de Calle |
| `semaforo.service.ts` / `semaforo.controller.ts` | Resuelve la fecha (hoy, o `?fecha=`), arma la respuesta y valida |

**Las reglas** (condiciones 1 a 3):

- **Inspeccionado:** el edificio tiene máquinas y **todas** tienen al menos una inspección en el mes → **verde, cualquiera sea el día**.
- **Pendiente:** le falta alguna → toma el color del tramo del día: **1-10 verde, 11-20 amarillo, 21 al último día del mes rojo** (en un mes de 28, 29, 30 o 31 días).
- **El 1.º de cada mes todos vuelven a pendiente.** No hay ningún proceso programado: el mes se cuenta desde el día 1 a las 00:00, así que las inspecciones del mes anterior quedan fuera de la ventana por sí solas.

**La respuesta** (condición 4):

```json
{
  "fecha": "2026-11-12", "mes": "2026-11", "tramoDelDia": "amarillo",
  "totales": { "verde": 1, "amarillo": 1, "rojo": 0 },
  "edificios": [
    { "id": "…", "nombre": "Consorcio Av. Rivadavia 1234", "direccion": "Av. Rivadavia 1234, CABA",
      "color": "amarillo", "estado": "pendiente",
      "maquinas": 2, "maquinasInspeccionadas": 1, "diaUltimaInspeccion": 8,
      "rtCalle": { "nombre": "Ana Pérez", "telefono": "11 5555-0000", "email": null } }
  ]
}
```

`diaUltimaInspeccion` y `rtCalle` son `null` si todavía no hay inspección del mes o si el edificio no tiene terna asignada. Los edificios vienen **ordenados por urgencia**: rojos, amarillos y verdes, y dentro de cada color por nombre.

**Dos decisiones técnicas que importan:**

- **El día se cuenta en hora de Buenos Aires, no en UTC.** Una inspección a las 22:30 del 31 de octubre es del 31 aunque en UTC ya sea el 1 de noviembre (01:30 UTC). Se probó en los dos bordes de la medianoche.
- **`?fecha=AAAA-MM-DD` calcula el semáforo «a ese día»** (sólo cuentan las inspecciones del mes hasta el final de esa fecha). Sin el parámetro se usa hoy. Existe para poder verificar cada tramo sin esperar al calendario; con una fecha inexistente (`2026-02-30`), mal escrita o repetida responde `400` con `{ message: "Datos inválidos", errores }`.

## 2. Cómo se levanta y se prueba

Igual que las tarjetas anteriores (`npm install`, `npm run db:up`, `npm run dev`). **Novedad del `dev` actual:** la API se conecta con un rol sin privilegios (RLS por ECA) y necesita, en el `.env` o en el entorno, `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET`. Para correr las pruebas de integración sin `.env`:

```bash
export DATABASE_URL=postgres://ascensores:ascensores_dev@localhost:5433/ascensores
export DATABASE_APP_PASSWORD=ascensores_app_dev
export AUTH_JWT_SECRET=<cualquier texto de 32 o más caracteres>
npm run test:int
```

Prueba a mano: `curl -s "http://127.0.0.1:3050/api/semaforo?fecha=2026-11-21"`.

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run verify` | Tipos OK. API: **310 tests, 310 en verde** (Jest; 64 nuevos: `semaforo.logic.spec` 40, `semaforo.e2e-spec` 24). Web: sin cambios |
| `npm run test:int` (con la base levantada y las variables de arriba) | **50 tests, 50 en verde** contra PostGIS real: los 37 anteriores y 13 nuevos (`semaforo.int-spec`) |
| `BASE_URL=http://127.0.0.1:3050 bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-01-entrega.sh` | 17 verificaciones, 17 OK. No deja datos |
| `… RF-01-entrega.sh --carga 200` | Siembra 30 edificios (2 máquinas y 1 inspección cada uno) y hace 200 consultas: 0 fallidas · promedio 11 ms · p95 12 ms · la más lenta 36 ms (13/11/2026, máquina de desarrollo con Windows 11, API compilada con `node dist/main.js`) |

Las pruebas de `desarrollo` son **aisladas** (lógica pura y una base en memoria que se le carga a la API); las de integración usan la base real, con inspecciones creadas por la API y fechadas en la base.

**Comprobado que las pruebas miden lo que dicen** (mutaciones: se rompió el código a propósito y se corrieron las pruebas):

| Mutación | unit + e2e | integración |
|---|---|---|
| El tramo verde llega hasta el 9 en vez del 10 | 3 fallan | 1 falla |
| Una sola máquina inspeccionada ya cuenta como edificio inspeccionado | 4 fallan | 1 falla |
| La ventana termina al empezar la fecha (excluye las inspecciones del mismo día) | pasan | **3 fallan** |
| Los límites del mes se calculan en UTC en vez de Buenos Aires | pasan | **1 falla** |
| Se acepta la inspección de una máquina que no es del edificio | pasan | **1 falla** (ver nota) |
| El semáforo no pasa por el middleware de contexto de ECA | pasan | **10 fallan** |

Las dos filas en las que sólo fallan las de integración son las que dependen del SQL: por eso esa capa es la que cuenta. **La mutación de la inspección ajena sobrevivió la primera vez** (13 de 13 en verde con el código roto): la prueba sólo miraba el edificio equivocado, y el efecto aparecía en el otro (la «última inspección» de F pasaba del día 1 al 4). Se reforzó la prueba para mirar ahí y ahora la detecta.

## 3. Qué datos hacen falta

Ninguno previo. El script crea 3 edificios (`RF01-entrega-<pid> S1..S3`), un RT de Calle y 3 inspecciones, y los borra al terminar (también si algo falla); `semaforo.int-spec` hace lo mismo con los suyos (`SEM-int …`). La API registra cada inspección con la hora de «ahora»: para fechar las de prueba, el script y la integración las mueven en la tabla `inspecciones_checklist` (el script lo hace con `docker exec`).

## 4. Endpoints y pantallas

Un endpoint nuevo: `GET /api/semaforo`. Ninguna pantalla. Pasa por el mismo contexto de RLS que `/api/consorcios`. (Versión original de esta entrega: *cada ECA ve sólo sus edificios*, probado con el encabezado `x-eca-actual`; con HU-15 RNF-03 ese encabezado se ignora y el semáforo es de la Secretaría y el Administrador.)

## 4.5. Cómo se corre integrado

Con `npm run db:up` y `npm run dev` (o sólo la API) levantados y docker disponible:

```bash
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-01-entrega.sh              # las 4 condiciones, 17 verificaciones
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-01-entrega.sh --carga 200  # 30 edificios sembrados y 200 consultas, con tiempos
```

Con la web levantada la URL por defecto es `https://localhost:8050`; sin ella, `BASE_URL=http://127.0.0.1:3050`. Hace falta docker sólo para fechar las inspecciones de prueba.

## 5. Qué quedó afuera y qué se asumió

- **«Inspeccionado con éxito» se asumió como: todas las máquinas del edificio con al menos una inspección registrada en el mes** (tabla `inspecciones_checklist`, de HU-17). Es lo único que el sistema guarda hoy: todavía **no existe el concepto de inspección cumplida, firmada o aprobada** (lo cierra HU-18, «Cierre, firma y envío del informe»). Cuando exista, hay que cambiar la fuente en `pg-semaforo.repository.ts`; la lógica de colores no se toca. Las **visitas fallidas** no cuentan como inspección. Si el cliente prefiere que alcance con **una** máquina inspeccionada por edificio, es un cambio de una línea en `estadoDelEdificio`, pero cambiaría los colores: conviene confirmarlo.
- **Un edificio sin máquinas queda pendiente**, y por lo tanto se pone rojo a partir del 21: no hay nada que inspeccionar, pero tampoco puede «cumplirse». Es la forma de que la Secretaría vea que le falta cargar las máquinas. Si el cliente prefiere ocultarlos, se filtra en la consulta.
- **El 1.º de cada mes el color de todos es verde** (el tramo 1-10), pero su `estado` es `pendiente`, que es lo que pide la condición 3. El campo `estado` existe para que la pantalla pueda distinguirlos de los inspeccionados.
- **Actualización (HU-15 RNF-03):** `GET /api/semaforo` ahora **pide sesión de Secretaría o Administrador** (sin sesión 401, otro rol 403): con el RLS estricto una petición sin sesión no vería ningún edificio. Lo que dice esta entrega sobre una ruta pública y sobre el contexto de ECA por encabezado quedó superado; ver el detalle en [RF-02-entrega.md](RF-02-entrega.md) §6.
- **No hay paginación**: devuelve todos los edificios de la ECA. Con 30 edificios el p95 fue de 12 ms; **no se midió con cientos**. La consulta filtra por `created_at`, que `inspecciones_checklist` no tiene indexado (sólo `consorcio_id, maquina_id`): con muchas inspecciones puede hacer falta un índice.
- **El parámetro `fecha` acepta cualquier fecha**, incluso futuras: calcula como si fuera ese día.
- **No incluye** el mapa, «Enviar recordatorio de ruteo» ni «Reasignar» (criterios 2 y 3 de la Historia): son de HU-04 RF-02.
- **Regresión:** esta tarjeta no pertenece a ningún módulo (`moduleId` vacío). Se corrió la batería completa: 310 de API en verde y 50 de integración en verde, incluidas las de RLS, roles, consorcios y checklist, que comparten tablas con esta consulta.

# HU-01 · RF-04 — Horarios de atención por edificio

**Qué hace.** Cada edificio tiene su horario de atención: hasta **2 franjas por día**, que pueden variar según el día de la semana. Un edificio nuevo arranca de lunes a viernes de **08:00 a 12:00** y de **17:00 a 20:00**. La Secretaría los edita por edificio o lo marca **«A coordinar»** (pin amarillo). La API dice si el edificio está **abierto en un momento dado**; los feriados cuentan como cerrado.

## La pantalla (Secretaría › Edificios y Máquinas › ficha del edificio › «Horarios de atención»)

| Elemento | Comportamiento |
|---|---|
| Lectura | Una línea por día: «Lunes: 08:00–12:00 · 17:00–20:00», «Sábado: Cerrado». Avisa si es el horario por defecto. Si está «A coordinar» lo dice en lugar de las franjas. |
| **Editar horarios** | Dos filas «desde – hasta» por día (una fila vacía = sin esa franja; el día vacío = cerrado) y la casilla **«A coordinar (reemplaza las franjas)»**. |
| Validación | Antes de mandar marca fin anterior o igual al inicio, hora incompleta y franjas que se pisan, diciendo el día. La API vuelve a validar. |

Captura: `imagenes/RF-04-horarios-del-edificio.png`.

## API

| Acción | Endpoint | Quién |
|---|---|---|
| Ver los horarios (los por defecto si nadie los editó) | `GET /api/consorcios/:id/horarios` | Secretaría, Administrador, RT de Calle y Firmante del edificio |
| Editar: `{ "franjas": { "lunes": [{"desde":"08:00","hasta":"12:00"}, …], … } }` o `{ "aCoordinar": true }` | `PUT /api/consorcios/:id/horarios` | Secretaría, Administrador |
| ¿Abierto ahora (o en `?en=2026-11-17T10:00:00-03:00`)? | `GET /api/consorcios/:id/horarios/abierto` | Secretaría, Administrador, RT, Firmante |
| Feriados considerados | `GET /api/feriados` | cualquier usuario con sesión |

**Reglas de las franjas** (400 con el motivo y el día si no se cumplen): hasta 2 por día; horas «HH:MM» de 00:00 a 23:59; el fin tiene que ser **posterior** al inicio; las dos franjas de un día **no se superponen ni se tocan** (la segunda tiene que empezar después de que termina la primera). Un día sin franjas queda cerrado. «A coordinar» **reemplaza** las franjas (quedan vacías).

**¿Está abierto?** Se evalúa en **hora de Buenos Aires** y responde `abierto` y `motivo`:
`dentro_de_franja` (con la franja vigente) · `fuera_de_franja` · `dia_cerrado` (el día no tiene franjas) · `feriado` · `a_coordinar`. El inicio de la franja cuenta como abierto y el fin no (12:00 ya está cerrado). Un **feriado cierra** aunque ese día de la semana tenga franjas. **«A coordinar» no está abierto** (hay que coordinar la visita), tampoco en un horario donde habría franja.

**Datos:** migración `024_horarios_edificio` (tabla `horarios_edificio`: franjas en JSON, `a_coordinar`, quién y cuándo editó). Sin fila rige el horario por defecto, así que los edificios que ya existían también arrancan con él. RLS: sólo la Secretaría y el Administrador escriben; el RT y el Firmante leen los de sus edificios.

## Feriados (provisorio)

La lista de `src/horarios/feriados.ts` es el calendario nacional de 2026 tal como lo conocemos y **el cliente tiene que confirmarla**. Se reemplaza sin tocar código con la variable `FERIADOS` (fechas AAAA-MM-DD separadas por comas); una fecha mal escrita frena el arranque con un mensaje claro.

```
FERIADOS="2026-12-24,2026-12-31"
```

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-04-entrega.sh
```

El script crea un edificio y un RT temporales y los borra. Pruebas automáticas: `horarios.spec.ts` (validación, bordes de las franjas, zona horaria, feriados), `horarios.e2e-spec.ts` (roles reales), `horarios.int-spec.ts` (PostgreSQL real: RLS y restricción) y `apps/web/src/horarios/horarios.test.ts`. Se verificaron con 19 mutaciones (3 franjas por día, fin igual al inicio, franjas que se tocan, sin ordenar, el fin que cuenta como abierto, el inicio que no, feriados que no cierran, «A coordinar» ignorado, UTC en vez de Buenos Aires, medianoche como 24:00, el RT que edita, horario por defecto compartido, etc.): todas hacen fallar algún test. La pantalla se recorrió en el navegador.

## Limitaciones y para confirmar

- No hay feriados provinciales ni de la Ciudad ni días no laborables: sólo la lista nacional configurable.
- Los horarios no se tienen en cuenta todavía en el mapa del RT (pines por horario es HU-16 RF-01): esta tarjeta deja `GET …/horarios/abierto` listo para usarse ahí.
- El horario con el que arranca un edificio nuevo no se guarda en la base hasta que alguien lo edita (se calcula): si el cliente cambia el horario por defecto, lo toman todos los edificios sin editar.
- Para confirmar con el cliente: si las franjas pueden cruzar la medianoche (hoy no) y si los feriados deben poder cargarse desde una pantalla.

# HU-07 / RF-05 — Edificio bloqueado fuera del recorrido y mínimo 1 día entre visitas fallidas

Qué cambia, según las definiciones del cliente: un edificio con 3 advertencias queda **bloqueado y sale del recorrido del RT** hasta que la Secretaría lo **desbloquea** (con motivo, y queda registrado); entre dos visitas fallidas del mismo edificio tiene que pasar **al menos 1 día**; y el contador de advertencias **sólo vuelve a cero con una visita exitosa**.

## Supuestos que tomé (a confirmar con MAICON)

La tarjeta no define estos puntos y no existían en el sistema, así que elegí lo más simple y lo dejo por escrito:

| Punto | Lo que implementé |
| --- | --- |
| Qué es una «visita exitosa» | Una **inspección registrada** en el edificio (`POST /api/checklist/inspecciones`). Las advertencias vigentes son las visitas fallidas posteriores a la última inspección. |
| La «lista de edificios a visitar del RT» | No existía: la creé como `GET /api/recorrido`. El RT ve sólo sus edificios (los decide el RLS) sin los bloqueados; la Secretaría y el Administrador ven todos, con `bloqueado: true/false`. Cuando se construya el mapa del RT (HU-16) tiene que usar este endpoint. |
| Qué es «1 día entre visitas» | Que la nueva visita fallida sea de **otro día de calendario** en hora de Buenos Aires (no 24 horas corridas). |
| Qué pasa si falla de nuevo tras desbloquearlo | Desbloquear **no** reinicia el contador. Si el edificio vuelve a fallar, se bloquea otra vez (la advertencia no pasa de 3) y se puede desbloquear de nuevo. |
| «Consorcio cerrado» o «administración que cancela» | No suman advertencia todavía: la propia tarjeta lo deja pendiente con MAICON. |
| El recargo del 45 % | Se sigue generando con la 3.ª advertencia aunque se desbloquee (RF-04). |

## Qué se agregó

| Qué | Cómo |
| --- | --- |
| Un día entre visitas | Una segunda visita fallida el mismo día responde **409** y no suma advertencia (se controla dentro del bloqueo del registro, así dos pedidos simultáneos tampoco lo burlan). Se configura con `VISITAS_FALLIDAS_MIN_DIAS` (por defecto 1; 0 lo desactiva: lo usan las pruebas que registran visitas seguidas). |
| Advertencias vigentes | El contador, el bloqueo y la numeración (Advertencia 1, 2, 3) cuentan sólo las visitas fallidas posteriores a la última inspección del edificio. |
| Recorrido | `GET /api/recorrido` (RT de Calle, Secretaría y Administrador; otro rol 403, sin sesión 401). |
| Desbloqueo | `POST /api/visitas-fallidas/consorcio/:id/desbloquear` con `{ "motivo" }`: sólo Secretaría y Administrador (otro rol 403), motivo obligatorio (400), un edificio que no está bloqueado o ya desbloqueado da 409. Queda en `desbloqueos_edificio` (migración `020`) con el usuario de la sesión, la fecha del servidor y el motivo; la aplicación sólo puede leer y agregar. |

## Cómo probarlo

1. `npm run db:up` y `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas en la terminal) y los datos demo (`RF-02-datos-demo.sh` de HU-04).
2. `bash docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-05-entrega.sh` (15 verificaciones). Usa «DEMO Corrientes 100» y le pone a `rt.beto` una clave temporal para ver su recorrido; al terminar borra todo y se la saca.

Los scripts de entrega de RF-03 y RF-04 se ajustaron para cargar las visitas anteriores con fecha pasada (el de RF-04 corre completo; el de RF-03 ya fallaba antes por falta de sesión, tarea pendiente de actualizar los scripts viejos).

## Pruebas automáticas

`bloqueo.logic.spec.ts` (10 casos de la lógica pura, con la frontera horaria de Buenos Aires), `recorrido-desbloqueo.spec.ts` (22 casos del servicio con varios días simulados), `recorrido-desbloqueo.e2e-spec.ts` (13 casos por HTTP con roles reales) y `recorrido-desbloqueo.int-spec.ts` (7 casos contra PostgreSQL real con el mínimo de 1 día: el RT ve su recorrido por el RLS, el desbloqueo, el reinicio por inspección y las políticas de la tabla). Se rompió el código a propósito de doce maneras (no controlar el día, exigir más de 1, que la inspección no reinicie, que el desbloqueo no levante el bloqueo, que el RT vea los bloqueados, abrir el desbloqueo a cualquier rol, aceptar motivo vacío, contar días en UTC, numerar sin reiniciar, cubrir la visita equivocada, bloquear con 4 y borrar el recargo al desbloquear) y todas hicieron fallar al menos una suite. Las pruebas viejas de visitas fallidas registran varias visitas seguidas: se les puso `VISITAS_FALLIDAS_MIN_DIAS=0` (el mínimo lo prueba su propio archivo).

# HU-02 / RF-05 — Contacto del RT de Calle en su usuario y en la reasignación

Qué cambia: el teléfono y el email del RT de Calle se guardan en su usuario (los carga el Administrador). Cuando la Secretaría reasigna un edificio en rojo, la terna queda con el contacto del RT nuevo. Antes la terna quedaba sin contacto.

## Cómo probarlo

1. `npm run db:up` y `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas en la terminal).
2. `bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh` crea los datos demo: `demo.admin` y `demo.secretaria` (clave `Demo-Clave-2026`), cuatro RT con contacto y cinco edificios.
3. `bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-05-entrega.sh` hace todas las comprobaciones de abajo y deja los datos como estaban.

## Qué se comprueba

| Paso | Resultado esperado |
| --- | --- |
| Como Administrador, `PUT /api/usuarios/<id>/contacto` con `{"telefono":"…","email":"…"}` | 200 y el usuario con su contacto. `GET /api/usuarios/<id>` lo devuelve. Vacío o `null` borra el dato |
| Email inválido, cuerpo sin campos o textos muy largos | 400 y no cambia lo guardado |
| Contacto a un usuario que no es `rt_calle` | 409 |
| Un usuario que no es Administrador | 403 (sin sesión, 401) |
| Reasignar un edificio en rojo a un RT con contacto | 201 y la terna queda con el teléfono y el email del RT nuevo |
| Reasignar a un RT sin teléfono ni email | 409 con el nombre del RT; no cambia el RT, ni la terna ni el registro |

El contacto no viaja en la sesión del usuario (`/api/auth/me`): sólo lo ve el Administrador.

## Pruebas automáticas

`apps/api/test/usuarios-contacto.int-spec.ts` (10 pruebas contra PostgreSQL real) y un caso nuevo en `semaforo-reasignacion.e2e-spec.ts`. Se rompió el código a propósito de cuatro maneras (terna vacía, sin chequear el contacto, sin chequear el rol, contacto del RT anterior) y cada una hizo fallar al menos una prueba.

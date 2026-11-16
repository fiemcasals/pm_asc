# HU-02 / RF-03 — Un guardado no pisa una asignación más nueva

Qué cambia: `PUT /api/consorcios/:id/roles` recibe además `actualizadoEn`, la versión de la terna que se leyó con el `GET`. Si la terna cambió desde entonces (otra persona guardó, o una reasignación del semáforo), responde 409, no modifica nada y devuelve la versión vigente. Si el campo no viene, guarda como siempre; si viene `null`, significa «leí que no había terna».

## Cómo probarlo

1. `npm run db:up` y `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas en la terminal).
2. `bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh` crea los datos demo. Después, `bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-03-entrega.sh` prueba la API (6 verificaciones).

La parte de pantalla, a mano:

3. Entrá a https://localhost:8050 como `demo.secretaria` / `Demo-Clave-2026`, abrí «Secretaría» › «Asignación de Roles de Trabajo» y elegí «DEMO Cabildo 1540» (RT actual: `rt.beto`). No guardes todavía.
4. Simulá a la otra persona: en otra terminal, con el token de la Secretaría, mandá `PUT /api/consorcios/<id>/roles` con otra terna (por ejemplo RT `rt.carla`) y `actualizadoEn` igual al del `GET` de ese edificio. Responde 200.
5. Volvé a la pantalla, cambiá el teléfono del RT y tocá «Guardar».
6. Resultado esperado: aparece el aviso «La terna de este edificio cambió desde que la abriste: se muestra la versión vigente. Revisala y volvé a guardar.» y el formulario pasa a mostrar la versión vigente (RT `rt.carla`). No se guardó tu cambio. Si cambiás el teléfono de nuevo y guardás, ahora sí se guarda y aparece «Responsables guardados».

## Pruebas automáticas

`consorcios-roles.e2e-spec.ts` (4 casos nuevos) y `consorcios-roles.int-spec.ts` (4 casos nuevos contra PostgreSQL real: versión vieja, reasignación del semáforo como cambio, «leí sin terna» y dos guardados simultáneos, de los que uno gana y el otro recibe 409), más 3 pruebas de la capa web. Se rompió el código a propósito de seis maneras (no controlar la versión, comparar siempre igual, no controlar el `null`, no devolver la vigente, no pasar la versión, y el repositorio en memoria sin control) y todas hicieron fallar al menos una prueba.

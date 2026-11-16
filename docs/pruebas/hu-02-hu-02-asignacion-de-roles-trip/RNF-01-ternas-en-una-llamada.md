# HU-02 / RNF-01 — Las ternas de todos los edificios en una sola llamada

Qué cambia: la pestaña «Asignación de Roles de Trabajo» pedía la terna de cada edificio con un `GET` por edificio (todos a la vez), cada uno con su transacción sobre un pool de 5 conexiones con 2 s de espera. Ahora pide `GET /api/consorcios/roles`, que devuelve la terna de todos los edificios en una sola lectura (los que no tienen terna vienen con los roles en `null`, igual que el `GET` individual).

## Cómo probarlo

1. `npm run db:up` y `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas en la terminal) y los datos demo (`RF-02-datos-demo.sh` de HU-04).
2. `bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RNF-01-medicion.sh` siembra 500 edificios con terna, mide la forma vieja y la nueva, y borra todo.
3. A mano: entrá como `demo.secretaria` y abrí «Secretaría» › «Asignación de Roles de Trabajo». En las herramientas del navegador (pestaña Red) hay una llamada a `/api/consorcios/roles` y ninguna a `/api/consorcios/<id>/roles`. En desarrollo la llamada se ve dos veces porque React ejecuta el efecto dos veces; es normal.

## Resultado medido (16/11/2026, PostgreSQL 16 local en Docker, 505 edificios)

| | Antes (505 lecturas) | Ahora (1 llamada) |
| --- | --- | --- |
| Tiempo de abrir la pestaña | 633 ms | p50 19 ms · p95 32 ms · máximo 40 ms |
| Errores de lectura | 0 | 0 |

- En esta máquina la forma vieja no llegó a dar errores: el servidor y el cliente locales no saturan el pool de 5 conexiones. El riesgo que describe la tarjeta (lecturas que fallan por la espera de 2 s) depende de la carga del servidor real, y no lo pude reproducir acá. Lo medido es el tiempo: unas 20 veces menos.
- La nueva ruta usa una sola consulta con `LEFT JOIN`, así que no depende del tamaño del pool.

## Pruebas automáticas

`consorcios-roles.e2e-spec.ts` (3 casos nuevos), `consorcios-roles.int-spec.ts` (2 casos nuevos contra PostgreSQL real) y 2 pruebas de la capa web. Se rompió el código a propósito (unión interna que pierde los edificios sin terna, edificios duplicados, y la ruta declarada después de `:id`, que la tomaría por un id) y las tres mutaciones hicieron fallar pruebas.

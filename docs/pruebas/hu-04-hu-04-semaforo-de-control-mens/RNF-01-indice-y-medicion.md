# HU-04 / RNF-01 — Índice por fecha para el semáforo y medición con volumen

Qué se prueba: la consulta del semáforo filtra `inspecciones_checklist` por rango de `created_at`, que no tenía índice. La migración `015_indice_inspecciones_por_fecha` agrega uno y el script `RNF-01-medicion.sh` mide el semáforo con 500 edificios y 20.000 inspecciones, sin y con el índice.

## Cómo probarlo

1. `npm run db:up` y `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas en la terminal). Al arrancar, la API aplica la migración 015.
2. `bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh` (el script de medición consulta como `demo.secretaria`).
3. `bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RNF-01-medicion.sh`. Siembra 500 edificios «VOL …» con 1.000 máquinas y 20.000 inspecciones de los últimos 24 meses, mide y borra todo al terminar.

## Resultado medido (13/11/2026, PostgreSQL 16 local en Docker)

| | Sin el índice | Con el índice |
| --- | --- | --- |
| Plan de la lectura de inspecciones | `Seq Scan on inspecciones_checklist` | `Index Only Scan using inspecciones_checklist_created_at_idx` |
| Tiempo de la consulta en la base | 12,3 ms | 11,0 ms |
| `GET /api/semaforo` p95 en 100 consultas | 69,7 ms | 77,0 ms |

- El criterio de p95 menor a 500 ms se cumple con holgura: los dos valores están alrededor de 70–77 ms.
- Con este volumen el índice casi no cambia el tiempo: la base tarda ~12 ms y el resto de la respuesta (sesión, RLS, armar y serializar 505 edificios) domina. La diferencia entre 69,7 y 77,0 ms es ruido de medición, no un empeoramiento.
- El índice sirve cuando crece la historia: sin él, la consulta recorre todas las inspecciones de todos los meses; con él, sólo las del mes consultado.

## Pruebas automáticas

`apps/api/test/semaforo.int-spec.ts` verifica que el índice existe con la definición `(created_at) INCLUDE (consorcio_id, maquina_id)` y que el plan de la consulta puede usarlo. Si se borra el índice, esa prueba falla. El resto de las pruebas del semáforo sigue igual: el resultado no cambió.

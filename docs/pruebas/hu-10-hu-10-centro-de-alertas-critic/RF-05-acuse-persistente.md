# HU-10 / RF-05 — El acuse guardado se vuelve a leer al reiniciar la API y no se duplica

Qué cambia: el acuse de recibo legal se guardaba en `acuses_recibo_legal` pero la lista de alertas lo informaba desde la memoria, así que al reiniciar la API la alerta volvía a figurar sin acuse. Además cada POST insertaba una fila nueva. Ahora:

- `GET /api/eca/alertas` lee los acuses guardados en la base (por alerta y por ECA), así que sobreviven al reinicio.
- Un segundo POST de la misma alerta no inserta otra fila: devuelve el acuse original (`yaRegistrado: true`), con su usuario y su fecha. El remito repetido tampoco duplica ni cambia el usuario.
- La migración `017` agrega la restricción `UNIQUE (alerta_id)`: la base lo impide sola. Si ya había repetidos, la migración conserva el primero de cada alerta y borra los posteriores.
- Si la base está caída, la lista de alertas igual se muestra (con lo que haya en memoria) y deja un aviso en el log; registrar un acuse sí falla, porque no puede perderse.

## Cómo probarlo

1. `npm run db:up` y `npm run dev`.
2. `bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-05-entrega.sh` registra el acuse de `ALT-MAICON-001`, repite el POST, verifica que hay una sola fila y que un INSERT directo falla.
3. Reiniciá la API (Ctrl+C y de nuevo `npm run dev`).
4. `bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-05-entrega.sh --despues-de-reiniciar` comprueba que la alerta sigue mostrando su acuse (usuario y fecha) y deja la base limpia.

## Qué se comprueba

| Paso | Resultado esperado |
| --- | --- |
| Primer POST a `/api/eca/alertas/ALT-MAICON-001/acuse` | 201 y `yaRegistrado: false` |
| Segundo POST con otro usuario | 201, `yaRegistrado: true`, y el usuario y la fecha del primero; 1 sola fila en la base |
| INSERT directo de otra fila de la misma alerta | La base lo rechaza (`acuses_recibo_alerta_unica`) |
| `GET /api/eca/alertas?eca=maicon` tras reiniciar | La alerta figura con el usuario y la fecha guardados |
| Acuse de otra alerta o grabado con otra ECA | No aparece en la alerta consultada |

## Pruebas automáticas

`apps/api/test/acuse-unico.int-spec.ts` (7 pruebas contra PostgreSQL real, incluida una instancia nueva de la API que hace de reinicio y dos POST simultáneos) y 4 casos nuevos en `acuse-persistencia.e2e-spec.ts`. Se rompió el código a propósito (sin `ON CONFLICT`, sin releer, informando el usuario del segundo POST, mezclando acuses entre alertas) y las pruebas lo detectaron. Una variante, quitar el filtro por ECA al releer, no hace fallar nada: lo cubre el RLS y la búsqueda por alerta.

# HU-07 / RF-04 — Recargo del 45 % una sola vez por máquina no inspeccionada

Qué cambia: antes la liquidación sumaba el 45 % cada vez que se liquidaba, mientras el edificio tuviera 3 advertencias. Ahora el recargo se suma **una sola vez**, en la liquidación del mes de la 3.ª advertencia, **por cada máquina no inspeccionada** ese mes, y un Administrador puede **anularlo** dejando el motivo.

## Cómo se decide si una máquina lleva recargo en una liquidación

| Condición | Resultado | `recargoNoAplicadoPor` |
| --- | --- | --- |
| El edificio no llegó a 3 advertencias | Sin recargo | `null` |
| El período liquidado no es el mes de la 3.ª advertencia (hora de Buenos Aires) | Sin recargo, aunque siga bloqueado | `otro_periodo` |
| La máquina tiene una inspección en ese mes | Sin recargo | `maquina_inspeccionada` |
| Un Administrador anuló el recargo de esa máquina | Sin recargo; la liquidación muestra quién, cuándo y por qué | `anulado` |
| Ninguna de las anteriores | Suma el 45 % | `null` |

Liquidar dos veces el mismo mes da el mismo resultado: la liquidación no «consume» el recargo.

**Interpretación a confirmar con el cliente:** entendí «en la liquidación siguiente» como la liquidación del mes en que ocurre la 3.ª advertencia (la que se emite después de ella). Si MAICON quiere que sea la del mes siguiente, hay que cambiar una línea del servicio.

## Anulación

`POST /api/visitas-fallidas/recargos/anular` con `{ "consorcioId", "maquinaId", "motivo" }`:

- Sólo el Administrador (otro rol: 403; sin sesión: 401).
- El motivo es obligatorio (sin motivo: 400). El usuario sale de la sesión, no del cuerpo, y la fecha la pone el servidor.
- Queda en la tabla `recargos_anulados` (migración `018`), que la aplicación sólo puede leer y agregar: no puede modificar ni borrar una anulación.
- Anular dos veces la misma máquina da 409; un edificio sin 3 advertencias da 409; una máquina que no es del edificio da 404.

## Cómo probarlo

1. `npm run db:up` y `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas en la terminal) y los datos demo (`RF-02-datos-demo.sh` de HU-04, que crea `demo.admin` y `demo.secretaria`).
2. `bash docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-04-entrega.sh` (12 verificaciones). Usa «DEMO Corrientes 100» y le borra las visitas y anulaciones al terminar.

## Pruebas automáticas

`recargo-unico.spec.ts` (10 casos del servicio, con reloj simulado y el cambio de mes en hora de Buenos Aires), `recargo-anulacion.e2e-spec.ts` (9 casos con roles reales: Administrador 201, Secretaría, RT, Firmante y ECA 403, sin sesión 401) y `recargo-unico.int-spec.ts` (8 casos contra PostgreSQL real, incluidas las inspecciones en el borde del mes y la inmutabilidad del registro). Se rompió el código a propósito de ocho maneras (repetir el recargo, ignorar inspecciones, ignorar anulaciones, abrir la anulación a cualquier rol, tomar el usuario del cuerpo, aceptar motivo vacío, mes en UTC de las inspecciones y de la 3.ª advertencia) y todas hicieron fallar al menos una suite.

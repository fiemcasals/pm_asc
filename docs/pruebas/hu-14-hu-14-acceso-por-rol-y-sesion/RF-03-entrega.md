# HU-14 · RF-03 · Entrega — Un Firmante y un usuario de ECA con sesión en los datos de demo

- **Tarea:** HU-14 / RF-03 — `REQ-1795263644283`
- **Script:** [RF-03-entrega.sh](RF-03-entrega.sh)
- **Archivo cambiado:** [`docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh`](../hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh)

## 1. Qué quedó implementado

El script de datos de demo ahora crea también un Firmante (`demo.firmante`) y un usuario de ECA (`demo.eca`), con la clave de siempre (`Demo-Clave-2026`). Con ellos se puede entrar al Portal Firmante y al Portal ECA sin crear cuentas a mano.

Para que se note que cada uno ve sólo lo suyo, las ternas de demo quedaron repartidas así:

| Edificios | Firmante en la terna | ECA en la terna |
|---|---|---|
| DEMO Rivadavia 1234, DEMO Cabildo 1540, DEMO Corrientes 100 | `demo.firmante` | ECA Demo |
| DEMO Santa Fe 3200, DEMO Sin ubicacion | `firmante.otro` (sin cuenta) | ECA Otra |

Además:

- **Correrlo dos veces ya no falla.** Antes, la segunda corrida terminaba con «Ya hay datos DEMO» y código 1. Ahora completa las cuentas que falten y no crea nada más.
- **`--limpiar` borra los edificios a través de la API** cuando está levantada. Antes los borraba sólo en la base, y la vista de firma, que vive en la API, seguía mostrando sus máquinas hasta reiniciarla. También borra sus visitas de firma guardadas (`firma_visitas`).

## 2. Cómo se levanta y se prueba

```bash
npm run db:up && npm run dev
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh --limpiar
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-03-entrega.sh
```

`RF-03-entrega.sh` empieza con `--limpiar`: borra los edificios DEMO y las cuentas `demo.*` y `rt.*`, y los vuelve a crear.

## 3. Qué datos hacen falta

Ninguno: el script los crea. Cuentas, todas con clave `Demo-Clave-2026`:

| Usuario | Rol | Qué ve |
|---|---|---|
| `demo.firmante` | Firmante | Portal Firmante: las 6 máquinas de los 3 primeros edificios |
| `demo.eca` | ECA (ECA Demo) | Portal ECA: las 6 máquinas de ECA Demo |

## 4. Qué endpoints o pantallas toca

Ninguno cambia. El script usa `POST /api/auth/login`, `POST /api/consorcios`, `PUT /api/consorcios/:id/roles` y `DELETE /api/consorcios/:id`.

## 5. Cómo se corre integrado

Resultado del 21/11/2026, contra una API recién iniciada (`API_PORT=3051`) y PostgreSQL 16 con PostGIS 3.4.3:

| Condición | Resultado |
|---|---|
| 1. Un Firmante y un usuario de ECA ingresan con la clave de demo | 4/4 |
| 2. El Firmante ve sólo las máquinas de su terna | 2/2: los 3 edificios y 6 máquinas esperados |
| 3. La ECA ve sólo los edificios de su ECA | 2/2: 6 máquinas de ECA Demo; pidiendo «ECA Otra» no ve nada de esa ECA |
| 4. Correrlo dos veces no duplica ni falla | 2/2: código 0, y 8 cuentas y 5 edificios antes y después |

Corrido dos veces seguidas: 10 bien, 0 mal en las dos.

**Regresión:** corrí los 36 scripts de entrega que usan estos datos de demo. 11 tienen fallas, pero **las mismas 11 fallan igual con el script de datos de antes** (HU-05 RF-01 y RF-02, HU-06 RF-03 y RF-04, HU-07 RF-05, HU-08 RF-03 y RF-04, HU-10 RF-04, HU-11 RF-07, HU-15 RF-02 y HU-17 RF-03). Este cambio no las provoca, y quedan fuera de esta Tarea. Los otros 25 dan lo mismo que antes.

## 6. Qué quedó afuera y qué se asumió

- **El Firmante se reconoce por su usuario.** La vista de firma compara el usuario de la sesión con el nombre o el email que figuran en la terna, no con el email de la cuenta. Por eso la terna nombra al Firmante `demo.firmante`, igual que ya nombraba a los RT por su usuario (`rt.ana`).
- **`firmante.otro` no tiene cuenta:** existe sólo para que haya edificios que `demo.firmante` no debe ver.
- **Cambió el reparto de las ternas de demo:** antes los 5 edificios tenían el mismo Firmante y la misma ECA. Los scripts que usan estos datos arman sus propias ternas o no dependen de ese reparto; la regresión de arriba lo confirma.
- **Vista de firma desactualizada después de borrar por SQL:** si alguien borra edificios sólo en la base, la API los sigue mostrando hasta reiniciarse. `--limpiar` lo evita borrando por la API, pero el problema de fondo, que la vista de firma no relee la base, queda fuera de esta Tarea.

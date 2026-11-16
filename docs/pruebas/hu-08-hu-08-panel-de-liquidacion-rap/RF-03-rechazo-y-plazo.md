# HU-08 / RF-03 — Rechazo del Firmante vuelve a la Secretaría y plazo de 5 días hábiles

Qué cambia: el Firmante puede **rechazar** un informe con motivo obligatorio y el informe **vuelve a la Secretaría** (no al RT de Calle). Además, un informe que lleva **más de 5 días hábiles** sin autorizarse ni rechazarse genera un **aviso a la Secretaría**, una sola vez.

> **Aviso importante:** el módulo del Firmante todavía trabaja con informes de ejemplo **en memoria** (y la identidad del Firmante llega por el encabezado `x-user-name`, igual que `autorizar`). Esta tarjeta sigue ese mismo modelo: los rechazos y los avisos se pierden al reiniciar la API. Cuando los informes pasen a la base, hay que mover estos datos con ellos.

## Qué se agregó

| Qué | Cómo |
| --- | --- |
| Rechazar un informe | `POST /api/firmante/rechazar` con `{ "maquinaId" o "visitaId", "motivo" }`. Sin motivo (vacío, en blanco o sin el campo): **400**. Un informe ya autorizado o ya rechazado: **409**. Un informe que no está recorrido: 400. |
| Un informe rechazado no se autoriza | `POST /api/firmante/autorizar` responde **409**, aunque además le falten fotos o firma. |
| Bandeja de la Secretaría | `GET /api/firmante/bandeja-secretaria` (sólo Secretaría y Administrador; el RT de Calle, el Firmante y la ECA reciben **403**, sin sesión **401**). Trae `rechazados` (con edificio, máquina, motivo, quién y cuándo) y `avisosPlazo`. |
| Plazo de 5 días hábiles | Los días hábiles son lunes a viernes, en hora de Buenos Aires; el día del informe no cuenta. Con 5 no hay aviso; con 6 o más sí. Los feriados **no** se descuentan: el sistema no tiene calendario de feriados. |

El aviso se genera **al abrir la bandeja** (no hay un reloj que lo dispare solo) y es idempotente: abrirla varias veces, o un mes después, no lo repite. Un informe autorizado o rechazado dentro del plazo no genera aviso.

## Cómo probarlo

1. `npm run db:up` y `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas en la terminal) y los datos demo (`RF-02-datos-demo.sh` de HU-04, que crea `demo.secretaria`).
2. `bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-03-entrega.sh` (11 verificaciones). Como los informes son datos en memoria, el rechazo queda hasta que reinicies la API: corré el script una sola vez por arranque.

## Pruebas automáticas

`firmante-rechazo.spec.ts` (28 casos: días hábiles incluida la frontera de Buenos Aires, rechazo, bandeja y plazo con fechas explícitas) y `firmante-rechazo.e2e-spec.ts` (10 casos por HTTP con roles reales y la fecha simulada). Se rompió el código a propósito de diez maneras (aceptar rechazo sin motivo, avisar con exactamente 5 días, contar fines de semana, repetir el aviso, avisar un informe autorizado o rechazado, abrir la bandeja a cualquier rol, autorizar un rechazado, ocultar el motivo, contar días en UTC) y todas hicieron fallar al menos una prueba. Una primera versión de la prueba de la frontera horaria no detectaba el uso de UTC: se reforzó. El script de entrega encontró además que autorizar un informe rechazado incompleto daba 400 en vez de 409; se corrigió el orden de las validaciones.

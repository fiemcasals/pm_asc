# HU-10 / RF-04 — Recordatorio a la ECA a las 24 h y aviso a la Secretaría a las 48 h sin acuse

Qué cambia: si la ECA no acusa recibo de una alerta crítica, a las **24 horas** de detectada se le manda un **recordatorio** (queda en el historial de la alerta) y a las **48 horas** se genera un **aviso a la Secretaría** con el edificio y la ECA. Cada uno se registra **una sola vez** por alerta, y si la ECA acusa recibo **antes** de que venza el plazo, no se manda.

## Qué se agregó

| Qué | Cómo |
| --- | --- |
| Historial de la alerta | `GET /api/eca/alertas` trae, en cada alerta, `historial` con los recordatorios y avisos (tipo, fecha, ECA, edificio y mensaje). |
| Aviso a la Secretaría | `GET /api/eca/avisos-secretaria` (sólo Secretaría y Administrador; otro rol **403**, sin sesión **401**): los avisos de 48 h con la ECA y el edificio. |
| Registro | Tabla `alertas_avisos` (migración `019`), con `UNIQUE (alerta_id, tipo)`: la base misma impide repetirlos. La aplicación sólo puede leer y agregar, no modificar ni borrar. Cada ECA ve los de sus alertas; la Secretaría y el Administrador, todos. |

Regla del acuse: el recordatorio (o el aviso) **no** se manda si el acuse es anterior al momento en que vencía (24 h o 48 h desde la detección). Un acuse entre las 24 h y las 48 h deja el recordatorio ya enviado, pero evita el aviso a la Secretaría.

**Limitación a tener en cuenta:** no hay un reloj que dispare el proceso solo. Los recordatorios y avisos se generan **cuando alguien abre la lista de alertas del portal de la ECA o la bandeja de avisos de la Secretaría** (es idempotente: abrirla muchas veces no repite nada, ni siquiera tras reiniciar la API). Un envío real al correo o WhatsApp de la ECA depende de HU-11 (proveedor real de mensajería, todavía pendiente); por ahora «recordatorio» significa que queda registrado en el historial de la alerta.

El proceso actúa como sistema con la ECA de cada alerta, aunque lo abra la Secretaría: leer los acuses y registrar el aviso no depende de la sesión de quien abrió la pantalla. (Una primera versión usaba el contexto de la sesión: la Secretaría no veía los acuses y el RLS le rechazaba el registro; la prueba de integración lo detectó.)

## Cómo probarlo

1. `npm run db:up` y `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas en la terminal) y los datos demo (`RF-02-datos-demo.sh` de HU-04, que crea `demo.secretaria`).
2. `bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-04-entrega.sh` (9 verificaciones). Registra un acuse de `ALT-MAICON-002` a las 2 h de detectada para probar el caso «acuse antes», y al terminar borra los avisos y ese acuse.

## Pruebas automáticas

`alertas-avisos.spec.ts` (9 casos del servicio con la hora explícita: límites de 24 h y 48 h al segundo, acuse antes, entre y después de los plazos, una sola vez), `alertas-avisos.e2e-spec.ts` (7 casos por HTTP con roles reales) y `alertas-avisos.int-spec.ts` (7 casos contra PostgreSQL real: reinicio de la API, el proceso disparado desde la Secretaría y las políticas de RLS). Se rompió el código a propósito de nueve maneras (24 h → 25 h, 48 h → 47 h, ignorar el acuse, cortar con cualquier acuse, quitar `ON CONFLICT`, usar el contexto de la sesión, abrir el aviso a cualquier rol, sacar la ECA del mensaje y mostrar también los recordatorios) y todas hicieron fallar al menos una suite.

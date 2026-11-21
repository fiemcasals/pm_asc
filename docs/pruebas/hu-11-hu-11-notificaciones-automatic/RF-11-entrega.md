# HU-11 · RF-11 · Entrega — Los avisos de falla crítica se guardan en PostgreSQL

- **Tarea:** HU-11 / RF-11 — `REQ-1795263642081`
- **Script:** [RF-11-entrega.sh](RF-11-entrega.sh), con un reinicio real de la API en el medio
- **Archivos cambiados:** [`avisos.repository.ts`](../../../apps/api/src/avisos/avisos.repository.ts) (nuevo), [`avisos.service.ts`](../../../apps/api/src/avisos/avisos.service.ts), [`app.module.ts`](../../../apps/api/src/app.module.ts), la migración `035_avisos_falla` en [`migrations.ts`](../../../apps/api/src/database/migrations.ts), y las pruebas nuevas [`avisos-persistencia.e2e-spec.ts`](../../../apps/api/test/avisos-persistencia.e2e-spec.ts) y [`avisos-persistencia.int-spec.ts`](../../../apps/api/test/avisos-persistencia.int-spec.ts)
- **Depende de HU-11 RF-12 (PR #103):** esta rama la incluye. Las dos agregan una migración, así que van en orden (`034` y `035`).

## 1. Qué quedó implementado

Hasta ahora los avisos de la bandeja «Avisos a la ECA» vivían en la memoria de la API. Con cada reinicio se perdían:
- los pendientes de revisión;
- quién aprobó cada uno y el estado de cada envío;
- el enlace sin contraseña que viajó en el WhatsApp, que dejaba de abrir el informe.

**Ahora:**

- Cada aviso se guarda en la tabla **`avisos_falla`**, con todo lo de la bandeja y lo interno de su enlace: el informe que muestra, el token y cuándo se emitió. Se guarda al crearse, al aprobarlo o reintentarlo, y cuando el proveedor informa un fallo (RF-14).
- **Al arrancar**, la API carga los avisos guardados con sus enlaces.
- **El enlace vence a los 7 días de emitido**, porque se guarda cuándo se emitió. Un reinicio no le da 7 días más.
- **Un aviso ya enviado no se vuelve a enviar**: después del reinicio, aprobarlo de nuevo responde 409. «Aprobar» y «Reintentar» esperan a que el aviso quede guardado antes de responder. Así, un reinicio justo después no lo deja como si no se hubiera mandado.
- **RLS:** la tabla sólo tiene política para la Secretaría y el Administrador, como la bandeja. La aplicación **no puede borrar** avisos (`REVOKE DELETE`).
- Si la base no responde, el aviso queda en memoria, la bandeja sigue funcionando y el error queda en el registro de la API.

## 2. Cómo se levanta y se prueba

```bash
npm run db:up
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-11-entrega.sh            # o con --carga 30
```

El script compila la API, la levanta contra un proveedor falso y registra dos fallas: aprueba una y deja la otra pendiente. Después **apaga el proceso y lo vuelve a arrancar**, y comprueba todo. Crea un RT y una Secretaría temporales y los borra al terminar, junto con los avisos y envíos de prueba.

## 3. Qué datos hacen falta

Ninguno. La migración `035_avisos_falla` (y la `034` de RF-12) se aplica sola al arrancar la API.

## 4. Qué endpoints o pantallas toca

Ningún endpoint cambia de forma. `GET /api/avisos`, `POST /api/avisos/:id/aprobar` y el enlace `GET /api/informe-aviso/:token` siguen igual, pero ahora sobreviven a un reinicio. En pantalla: la bandeja «Avisos a la ECA».

## 5. Cómo se corre integrado

Resultado del 21/11/2026, con la API compilada y PostgreSQL 16 + PostGIS 3.4.3:

| Condición | Resultado |
|---|---|
| 1. Un aviso pendiente sigue pendiente después del reinicio y se puede aprobar | Sigue «Pendiente de revisión» y, al aprobarlo después del reinicio, queda «Enviado» |
| 2. El enlace sigue abriendo el informe y vence a los 7 días de creado, no del reinicio | Abre igual y conserva el mismo vencimiento; la prueba e2e adelanta el reloj y confirma que vence a los 7 días de emitido |
| 3. Un aviso ya enviado no se reenvía y conserva el estado de cada envío | Aprobarlo de nuevo da 409, el proveedor no recibe ningún mensaje nuevo y los envíos son los mismos |
| 4. Pruebas existentes en verde e integración con la base real | Pruebas de avisos 33/33 (incluye `avisos-persistencia.e2e-spec` 7/7) y `avisos-persistencia.int-spec` 2/2 |

- `RF-11-entrega.sh --carga 30`: los 32 avisos siguieron en la bandeja después del reinicio. Sin carga: 10 ok, 0 con error.
- `npm run verify`: API 1236/1236 y web 616/616. Integración: 195/195.

## Supuestos y límites

- **El informe de la falla en sí** (lo que registra el RT) sigue en memoria: es HU-06 RF-08. Lo que se guarda es el aviso, con una copia del informe que muestra el enlace. Por eso el enlace sigue funcionando.
- El token del enlace queda guardado tal cual en la base, como ya estaba en la respuesta de la bandeja. Lo protege el RLS, porque sólo la Secretaría y el Administrador leen la tabla.
- Las fotos del informe viajan dentro del aviso (`vista`). Si un informe trae muchas fotos grandes, la fila crece en proporción.

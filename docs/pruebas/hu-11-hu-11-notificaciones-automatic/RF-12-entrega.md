# HU-11 · RF-12 · Entrega — El historial de envíos de WhatsApp se guarda en PostgreSQL

- **Tarea:** HU-11 / RF-12 — `REQ-1795263642415`
- **Script:** [RF-12-entrega.sh](RF-12-entrega.sh), con un reinicio real de la API en el medio
- **Archivos cambiados:** [`historial-whatsapp.repository.ts`](../../../apps/api/src/whatsapp/historial-whatsapp.repository.ts) (nuevo), [`whatsapp-connector.service.ts`](../../../apps/api/src/whatsapp/whatsapp-connector.service.ts), [`app.module.ts`](../../../apps/api/src/app.module.ts), la migración `034_whatsapp_envios` en [`migrations.ts`](../../../apps/api/src/database/migrations.ts), y las pruebas nuevas [`whatsapp-historial-persistencia.e2e-spec.ts`](../../../apps/api/test/whatsapp-historial-persistencia.e2e-spec.ts) y [`whatsapp-historial.int-spec.ts`](../../../apps/api/test/whatsapp-historial.int-spec.ts)

## 1. Qué quedó implementado

Hasta ahora el historial de envíos de WhatsApp vivía en la memoria de la API. Cada reinicio lo borraba, y con él el estado real de cada envío que muestra la bandeja (RF-10). Además, un aviso del proveedor que llegaba después del reinicio («entregado», «leído») ya no encontraba su envío.

**Ahora:**

- Cada envío se guarda en la tabla **`whatsapp_envios`**: una fila por intento, con el registro completo y su id de mensaje (`wamid` o `SM`). Cuando el proveedor avisa un cambio de estado, la fila se actualiza.
- **Al arrancar**, la API carga el historial guardado. Un aviso del proveedor que llega después del reinicio actualiza el envío correcto.
- El estado **nunca retrocede**, antes y después del reinicio: aceptado → enviado → entregado → leído, y un fallido se mantiene. Es la misma regla de RF-09, aplicada sobre lo que se cargó.
- **Las escrituras van en orden y en segundo plano.** Un envío no espera a la base para salir. Si la base no responde, el envío sale igual, queda en memoria y el error queda en el registro de la API.
- **RLS:** la tabla sólo tiene política para la Secretaría y el Administrador, igual que el endpoint del historial (RF-13). La aplicación **no puede borrar** envíos (`REVOKE DELETE`), porque el historial es la constancia de lo que salió.

## 2. Cómo se levanta y se prueba

```bash
npm run db:up
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-12-entrega.sh            # o con --carga 50
```

El script compila la API y la levanta con Meta configurado, contra un proveedor falso. Manda tres avisos, recibe sus estados, **apaga el proceso de la API y lo vuelve a arrancar**, y comprueba todo. Crea una Secretaría temporal y la borra al terminar, junto con los envíos de prueba.

## 3. Qué datos hacen falta

Ninguno. La migración `034_whatsapp_envios` se aplica sola al arrancar la API.

## 4. Qué endpoints o pantallas toca

Ningún endpoint cambia de forma: `GET /api/whatsapp/historial` devuelve lo mismo, pero ahora sobrevive a un reinicio. Lo mismo vale para el estado de cada envío en la bandeja.

## 5. Cómo se corre integrado

Resultado del 21/11/2026, con la API compilada y PostgreSQL 16 + PostGIS 3.4.3:

| Condición | Resultado |
|---|---|
| 1. Después de reiniciar, el historial sigue mostrando cada envío y su estado real | Tres envíos (entregado, aceptado, fallido) siguen igual después de apagar y arrancar el proceso |
| 2. Un «aceptado» antes del reinicio se actualiza en el envío correcto cuando el proveedor avisa después | El «read» posterior deja ese envío en «leído» y no toca los demás; y lo actualizado sobrevive a otro reinicio |
| 3. Un aviso viejo no hace retroceder el estado, antes y después del reinicio; fallido se mantiene | Un «sent» sobre un entregado y un «delivered» sobre un fallido no cambian nada |
| 4. Las pruebas de WhatsApp siguen en verde, y una de integración con la base real reinicia y comprueba 1 y 2 | Pruebas de WhatsApp 54/54 (incluye `whatsapp-historial-persistencia.e2e-spec` 7/7) y `whatsapp-historial.int-spec` 2/2 |

- `RF-12-entrega.sh --carga 50`: 10 ok, 0 con error. Los 53 envíos siguieron en el historial después del reinicio.
- `npm run verify`: API 1229/1229 y web 616/616. Integración: 193/193.

## Supuestos y límites

- **Los avisos de la bandeja todavía no sobreviven a un reinicio.** Lo que se guarda es el historial de envíos. Los avisos («Pendiente de revisión», «Enviado») son de HU-11 RF-11. Hasta que esa Tarea esté, después de un reinicio la bandeja queda vacía, aunque el historial esté completo. Por eso esta entrega no tiene captura de la bandeja después del reinicio.
- El registro se guarda completo como JSON. Las columnas aparte (`id_mensaje`, `alerta_id`, `estado_entrega`) sirven para buscar.
- Si la API se corta en el mismo instante de un envío, la escritura que estaba en curso se puede perder. El envío ya salió, pero no queda en el historial guardado.
- Ojo con la base local: correr las pruebas de integración o este script aplica la migración `034_whatsapp_envios`. Una rama vieja que compare la lista de migraciones va a ver una de más, como pasó antes con la `033`.

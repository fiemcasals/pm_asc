# HU-11 · RF-09 · Entrega — Confirmar la entrega real de cada WhatsApp con los avisos del proveedor

- **Tarea:** HU-11 / RF-09 — `REQ-1795097860589`
- **Rama:** `feature/hu-11-hu-11-notificaciones-automatic/req-1795097860589-confirmar-la-entrega-real-de-cada-whatsa`
- **Depende de:** nada. Es la base de HU-11 / RF-10, que muestra estos estados en la bandeja.
- **Script del flujo integrado:** [RF-09-entrega.sh](RF-09-entrega.sh)
- **Guía visual:** no corresponde. La tarea no cambia ninguna pantalla: la evidencia son las pruebas automáticas y el script, que mandan avisos firmados de verdad. Los estados se ven en pantalla con HU-11 / RF-10.

## 1. Qué quedó implementado

Hasta ahora un envío figuraba «entregado» apenas el proveedor aceptaba el pedido (respuesta 2xx), y eso no prueba que el mensaje haya llegado al celular. Meta y Twilio avisan a una URL del sistema cuando el mensaje se envía, se entrega, se lee o falla. Se agregaron esas entradas y el historial pasó a distinguir cada paso.

| Método | Ruta | Para qué | Respuestas |
|---|---|---|---|
| `GET` | `/api/whatsapp/webhook/meta` | Verificación de la suscripción en el panel de Meta | `200` con el desafío · `403` |
| `POST` | `/api/whatsapp/webhook/meta` | Avisos de estado de Meta | `200` · `401` firma inválida |
| `POST` | `/api/whatsapp/webhook/twilio` | Avisos de estado de Twilio | `200` · `401` firma inválida |

Las tres son **públicas** (no llevan sesión, porque el proveedor no tiene una): lo único que garantiza que el aviso es del proveedor es la firma, y se valida antes de tocar nada.

- **Firma de Meta:** `X-Hub-Signature-256` es el HMAC-SHA256 del cuerpo **sin modificar** con `WHATSAPP_META_APP_SECRET`. Para eso la API guarda el cuerpo tal cual llegó, solo en esa ruta (`app.setup.ts`).
- **Firma de Twilio:** `X-Twilio-Signature` es el HMAC-SHA1 (base64) de la URL pública más cada parámetro ordenado, con `WHATSAPP_TWILIO_AUTH_TOKEN`. La URL sale de `WHATSAPP_TWILIO_WEBHOOK_URL`, o de `APP_URL` + `/api/whatsapp/webhook/twilio` si esa queda vacía.
- **Secretos solo por entorno,** y sin ellos se rechaza todo: sin secreto configurado una firma nunca es válida y el token de verificación vacío tampoco. `GET /api/whatsapp/estado` no los expone.
- **Estados del historial:** `aceptado` (el proveedor recibió el pedido) → `enviado` → `entregado` → `leido`, o `fallido`.
  - **Nunca retrocede:** un `delivered` después de un `read`, o el mismo aviso dos veces, no cambia el registro ni crea filas.
  - **`fallido`** guarda el código y el mensaje de error del proveedor, deja el registro como no realizado (`ok: false`) y escribe el motivo. Solo vale mientras el mensaje no se entregó: después de entregado o leído, un `failed` tardío se ignora; y un mensaje que ya falló no vuelve a otro estado.
  - **Mensaje desconocido:** responde `200` sin crear nada, para que el proveedor no reintente.
  - **Twilio:** `sent`, `delivered`, `read`, `failed` y `undelivered` cambian el registro; `queued`, `accepted` y `sending` no.

Archivos nuevos: `whatsapp-webhook.service.ts` (firmas y traducción de avisos), `whatsapp-webhook.controller.ts`. Cambian `config.ts`, `whatsapp.types.ts`, `whatsapp-connector.service.ts` (`registrarEventoProveedor`), `app.module.ts`, `app.setup.ts` y `.env.example`.

## 2. Cómo se levanta y se prueba

Requisitos: los de RO-01. No hacen falta credenciales reales: las pruebas firman los avisos con secretos de prueba.

```bash
npm install
npm run db:up
npm run verify                                                         # tipos + API + web
cd apps/api && npx jest test/whatsapp-webhook.e2e-spec.ts              # sólo esta tarea
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-09-entrega.sh
```

Variables nuevas (en `.env`, que git ignora):

```bash
WHATSAPP_META_VERIFY_TOKEN=     # el token que se escribe también en el panel de Meta
WHATSAPP_META_APP_SECRET=       # el secreto de la app de Meta
WHATSAPP_TWILIO_WEBHOOK_URL=    # la URL pública exacta registrada en Twilio
```

Para activarlo en producción hay que registrar en el panel de cada proveedor la URL pública: `https://<dominio>/api/whatsapp/webhook/meta` en Meta (con el token de verificación) y `https://<dominio>/api/whatsapp/webhook/twilio` como «Status Callback URL» en Twilio.

## 3. Qué datos hacen falta

Ninguno. Las pruebas y el script crean sus mensajes con un proveedor falso.

## 4. Qué endpoints o pantallas toca

Los tres de arriba. Cambia lo que informan `POST /api/whatsapp/enviar-alerta` (ahora `aceptado` y no `entregado` ante un 2xx) y `GET /api/whatsapp/historial` (nuevos estados, `estadoActualizadoEn` y `errorProveedor`). El tipo `EstadoEntregaWhatsApp` de la web (`eca.ts`) suma los estados nuevos; ninguna pantalla cambia.

## 5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-09-entrega.sh
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-09-entrega.sh --carga 100
```

Medido el 21/11/2026:

| Qué | Resultado |
|---|---|
| Script de entrega | 13 verificaciones OK, 0 fallidas |
| Carga de 100 avisos firmados | 0 fallos, promedio 203 ms, el más lento 254 ms (incluye arrancar `node` para firmar) |
| `whatsapp-webhook.e2e-spec.ts` | 31 de 31 |
| `npm run verify` | Tipos OK · API 1174/1174 (81 archivos) · web 538 en verde, 1 omitida que ya venía así |
| `npm run test:int` | 188/188 (26 archivos) |

| Condición de aprobación | ¿Cubierta? | Cómo se prueba |
|---|---|---|
| 1. `GET` de Meta devuelve el desafío solo con el token correcto; si no, 403 | Sí | `whatsapp-webhook.e2e-spec.ts` · script paso 1 |
| 2. `POST` de Meta valida `X-Hub-Signature-256`; sin firma o inválida, 401 y nada cambia | Sí | ídem · script paso 3 |
| 3. `POST` de Twilio valida `X-Twilio-Signature`; inválida, 401 y nada cambia | Sí | ídem · script paso 7 |
| 4. Cada evento válido actualiza el registro (enviado, entregado, leído, fallido con código y mensaje) | Sí | ídem · script pasos 4, 5 y 7 |
| 5. El estado nunca retrocede y los eventos repetidos son inofensivos | Sí | ídem · script paso 4 |
| 6. Un mensaje desconocido responde 200 sin crear nada | Sí | ídem · script paso 6 |
| 7. El historial distingue aceptado de entregado | Sí | ídem · script paso 2 |
| 8. Los secretos salen solo del entorno y `/estado` no los expone; las pruebas de RF-03 y RF-04 siguen en verde | Sí | ídem · script paso 8 · 97 pruebas de WhatsApp y avisos en verde |

## 6. Qué quedó afuera y qué se asumió

- **No se probó con Meta ni Twilio reales,** porque no hay cuentas cargadas. Las firmas se calcularon con el algoritmo documentado de cada proveedor, de forma independiente al código de la API. Lo comprueba RO-02.
- **Cambia el significado de un campo:** una respuesta 2xx ahora dice `aceptado` y no `entregado`. Los tests de RF-03 y RF-04 que esperaban `entregado` se actualizaron. Quien consuma `estadoEntrega` fuera de este repositorio tiene que revisarlo.
- **El historial sigue en memoria:** se vacía al reiniciar la API, y un aviso del proveedor que llegue después no encuentra su mensaje (responde `200`, `desconocido`). Persistirlo no es de esta tarea.
- **El aviso en la bandeja no se actualiza solo:** `avisos.service.ts` guarda su propia copia del estado al enviar. Mostrar el estado real por aviso es de HU-11 / RF-10, que lo lee del historial.
- **Se supuso que `failed` después de `delivered` se ignora** (no deshace la entrega), y que un mensaje fallido no se «recupera» con un aviso tardío. Si el proveedor reenvía el mismo mensaje, usa otro id.
- **No se guardó el JSON crudo de los avisos:** solo el estado, la hora y el error.
- **Los avisos de mensajes entrantes** (la respuesta de alguien) se aceptan con `200` y se ignoran: el sistema no responde mensajes.
- **Regresión:** la tarea no tiene módulo. Se corrió toda la API y la integración en verde.

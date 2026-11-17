# HU-11 · RF-06 — Enlace del aviso sin contraseña y válido por 7 días

**Qué hace.** El WhatsApp y el correo del aviso (RF-05) llevan un enlace que abre el informe de esa falla **sin iniciar sesión**. El enlace tiene un token aleatorio imposible de adivinar, **vence a los 7 días** del envío y muestra **sólo el informe de ese aviso**.

Captura: `imagenes/RF-06-informe-por-enlace.png`.

## Cómo funciona

- Al aprobar el aviso, la API genera un token de **256 bits** (32 bytes aleatorios, 43 caracteres base64url) y arma `…/api/informe-aviso/<token>`. Ese enlace va en el WhatsApp a la ECA y al Firmante y en el correo.
- `GET /api/informe-aviso/:token` es **público a propósito** (la seguridad es el token y el vencimiento):

| Caso | Respuesta |
|---|---|
| Token válido y vigente | **200**: el informe (equipo, edificio, ECA, fecha, fallas, observaciones y fotos). |
| Token inexistente, con otro formato o alterado | **404** «El enlace no es válido», sin ningún dato. El id de un informe o de una alerta tampoco abre nada. |
| Pasaron más de 7 días desde que se emitió | **410** «Este enlace venció», sin mostrar el informe. A los 7 días justos todavía sirve. |

- **Vencimiento:** se cuenta desde el envío (la aprobación). Si el envío falla y se reintenta, el mismo enlace se renueva por 7 días más; el token no cambia, así que el enlace que ya recibió alguien sigue valiendo. El aviso informa `enlaceVenceEn`.
- **Sólo ese informe:** cada token apunta a un único aviso; la página no tiene datos de otros edificios ni de otras fallas de la ECA.
- **Seguridad de la página:** todo lo escrito por personas (observaciones, nombres) se escapa; sólo se muestran fotos `http(s)` o data URL de imagen; respuestas con `Cache-Control: no-store`, `X-Robots-Tag: noindex` y `Referrer-Policy: no-referrer`.
- **Dónde se ve el enlace:** la Secretaría y el Administrador lo ven en la bandeja (`enlace`, para mandarlo a mano si el WhatsApp falla). **No** queda en `GET /api/whatsapp/historial`, que no pide sesión: ahí figura enmascarado (`…/informe-aviso/[token]`).

## Cómo probarlo

```bash
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-06-entrega.sh
```

El vencimiento a los 7 días no se puede esperar en una corrida: lo prueban los tests con reloj simulado (`avisos-enlace.spec.ts`: 7 días justos sirve, 1 ms después vence; `informe-aviso.e2e-spec.ts`). También hay `informe-publico.spec.ts` (escape de HTML y fotos). Se verificaron con 12 mutaciones (token de 64 bits, borde del vencimiento, enlace que nunca vence, 410/404 equivocados, sin escape, sin `no-store`, token que cambia al reintentar, fotos sin filtrar, vencimiento desde la creación, token filtrado en la bandeja o en el historial público): todas hacen fallar algún test. La página pública se recorrió en el navegador.

## Cambios que arrastra

- El mensaje de WhatsApp y el correo de RF-05 ahora llevan este enlace (antes apuntaban a `/api/eca/remito/:alertaId/informe`).
- El enlace **no registra el acuse de recibo legal** de la ECA (el enlace viejo sí lo registraba al abrirse): el acuse sigue haciéndose desde el portal de la ECA.

## Limitaciones y para confirmar

- Los tokens están en memoria, igual que los avisos: al reiniciar la API los enlaces ya mandados dejan de abrir.
- No hay límite de intentos por IP: con 256 bits no es adivinable, pero conviene sumar uno cuando haya un proxy delante.
- El PDF legal en el enlace llega con HU-11 RF-02.
- Para confirmar con el cliente: si 7 días corridos alcanzan (hoy no se descuentan fines de semana) y si un enlace vencido debe poder renovarlo la Secretaría.

## Hallazgos aparte (sin tocar)

- `/api/whatsapp/*` no pide sesión (ya informado en RF-05).
- `/api/eca/remito/:alertaId/informe` sigue siendo público, con un id fácil de adivinar (por ejemplo `ALT-MAICON-001`), registra un acuse al abrirse y arma el HTML sin escapar el contenido. Conviene reemplazarlo por este mecanismo o protegerlo.

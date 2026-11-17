# HU-11 · RF-05 — Avisos a la ECA sólo después de la revisión de la Secretaría

**Qué hace.** Ninguna falla crítica manda WhatsApp ni correo sola. El aviso queda **«Pendiente de revisión»** en una bandeja de la Secretaría; cuando la Secretaría toca **«Aprobar y enviar»** salen el WhatsApp a la ECA y al Firmante del edificio y el correo a la ECA, y el aviso pasa a **«Enviado»**.

## La pantalla (Secretaría › «Avisos a la ECA»)

| Elemento | Comportamiento |
|---|---|
| Lista | Primero los pendientes, después los que fallaron y al final los enviados (los más viejos primero). Cada aviso muestra equipo, edificio, falla, ECA, enlace al informe y el estado. |
| **Aprobar y enviar** | Disponible mientras está «Pendiente de revisión». Si el envío falló pasa a **Reintentar envío**. |
| Después de aprobar | Muestra «Aprobado por … el …» y el resultado de cada envío (WhatsApp a la ECA, WhatsApp al Firmante, correo a la ECA). |

Captura: `imagenes/RF-05-bandeja-de-avisos.png` (sin proveedor de WhatsApp ni SMTP en desarrollo, los envíos figuran «no salió» y el aviso «Falló el envío»: no se simula ninguna entrega).

## API

| Acción | Endpoint | Quién |
|---|---|---|
| Bandeja (`?estado=Pendiente de revisión` para sólo los pendientes) | `GET /api/avisos` | Secretaría, Administrador |
| Un aviso | `GET /api/avisos/:id` | Secretaría, Administrador |
| Aprobar y enviar (cuerpo opcional `telefonoEca`, `telefonoFirmante`, `emailEca`) | `POST /api/avisos/:id/aprobar` | Secretaría, Administrador |

- El aviso nace **solo** al registrarse una falla crítica (`POST /api/fallas-criticas/informes` con una falla crítica) y no envía nada.
- **Estados:** «Pendiente de revisión» → «Enviado» (ambos WhatsApp salieron) o «Falló el envío» (alguno no salió; la aprobación se conserva y se puede reintentar: sólo se vuelve a mandar lo que no salió). Un aviso ya enviado no se aprueba de nuevo (409).
- **El disparo automático ya no envía sin aprobación:** `POST /api/whatsapp/trigger-alerta-critica` responde **409** con el motivo («pendiente de revisión…») si el aviso no fue aprobado, tanto para el informe de una falla como para la alerta de una máquina que todavía no tenía aviso (se crea pendiente).
- **Quién aprobó:** el aviso guarda `aprobadoPor` y `aprobadoEn`, y cada registro de `GET /api/whatsapp/historial` los repite.
- El correo lleva el enlace al informe técnico. Sin SMTP queda registrado como «no_configurado» y no se da por enviado.

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-05-entrega.sh
```

El script crea un RT temporal para probar el 403 y lo borra al terminar. Pruebas automáticas: `apps/api/test/avisos.e2e-spec.ts` (roles reales y los 4 criterios), los tests de `whatsapp` actualizados (el disparo ahora exige aprobación) y `apps/web/src/avisos/avisos.test.ts`. Se verificaron con 12 mutaciones (no registrar quién aprobó, quedar «Enviado» aunque falle, disparo sin aprobar —por informe y por máquina—, aprobar dos veces, bandeja abierta a cualquier rol, reintento que reenvía lo que ya salió, no crear el aviso, historial sin aprobador, correo sin SMTP dado por enviado, y dos de la pantalla): todas hacen fallar algún test. La bandeja se recorrió en el navegador.

## Limitaciones

- Los avisos están en memoria (como los informes de fallas críticas de los que salen): se pierden al reiniciar la API.
- **Contactos provisorios:** todavía no hay agenda de teléfonos y correos por ECA ni por Firmante. Si no se indican al aprobar, se usan valores de prueba (`+5491144009988`, `+5491155000001`, `avisos-eca@maicon.com.ar`).
- El PDF legal no va adjunto: el correo lleva el enlace al informe. La generación del PDF y su envío son HU-11 RF-02; el proveedor real de WhatsApp es HU-11 RF-04.

## Para confirmar con el cliente

- De dónde salen el teléfono de la ECA, el del Firmante y el correo de la ECA (por edificio o por ECA).
- Si el aviso debe poder anularse o rechazarse en la revisión (hoy sólo se aprueba).

## Hallazgo aparte

Los endpoints `/api/whatsapp/*` (enviar-alerta, formatear, trigger-alerta-critica, historial) **no piden sesión**: cualquiera con acceso a la API puede mandar un WhatsApp o leer el historial. No se tocó en esta tarjeta; conviene protegerlos con `@Roles('secretaria', 'administrador')`.

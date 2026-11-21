# HU-11 · RF-08 · Entrega — Enviar el aviso de falla crítica con una plantilla de WhatsApp aprobada

- **Tarea:** HU-11 / RF-08 — `REQ-1795097860369`
- **Rama:** `feature/hu-11-hu-11-notificaciones-automatic/req-1795097860369-enviar-el-aviso-de-falla-critica-con-una`
- **Depende de:** nada. Es la base de RO-03 (alta de WhatsApp Business), que necesita este texto.
- **Script del flujo integrado:** [RF-08-entrega.sh](RF-08-entrega.sh)
- **Texto de la plantilla para el panel del proveedor:** [RF-08-plantilla-whatsapp.md](RF-08-plantilla-whatsapp.md)
- **Guía visual:** no corresponde. La tarea no cambia ninguna pantalla: la evidencia es el cuerpo exacto que recibe el proveedor, que verifican las pruebas automáticas y el script.

## 1. Qué quedó implementado

Una alerta de falla crítica ya no sale como texto libre: sale como **mensaje de plantilla**, que es lo que Meta y Twilio permiten cuando el sistema inicia la conversación.

- **Meta:** manda `type: "template"` con el nombre de `WHATSAPP_META_TEMPLATE_NAME`, el idioma de `WHATSAPP_META_TEMPLATE_LANG` (por defecto `es_AR`) y 5 parámetros en este orden: edificio, equipo, estado, detalle y enlace del informe. El cuerpo no tiene ningún campo de texto libre.
- **Twilio:** manda `ContentSid` (de `WHATSAPP_TWILIO_CONTENT_SID`) y `ContentVariables` con esos mismos 5 valores. No manda `Body`.
- **Sin plantilla configurada, no sale nada:** el envío queda `no_realizado` con `estadoEntrega: "no_configurado"` y un motivo que nombra la variable que falta. No cae a texto libre. Vale para el envío manual, para el disparo automático y para el botón «Aprobar y enviar» de la bandeja.
- **Parámetros limpios:** los saltos de línea y las tabulaciones pasan a un espacio, las tandas de más de 4 espacios se reducen a uno, y se recorta a 1024 caracteres.
- **Quién recibe el aviso y cuándo sale no cambia:** sigue saliendo después de que la Secretaría lo aprueba.

Archivos: `config.ts` (3 variables nuevas), `whatsapp-formatter.service.ts` (`parametrosPlantilla`, `limpiarParametroPlantilla`), `whatsapp-provider.transport.ts` (cuerpo de Meta y de Twilio), `whatsapp-connector.service.ts` (corte si falta la plantilla), `whatsapp.types.ts` y `.env.example`.

## 2. Cómo se levanta y se prueba

Requisitos: los de RO-01. No hace falta ninguna credencial: las pruebas usan un receptor HTTP local.

```bash
npm install
npm run db:up
npm run verify                                                        # tipos + API + web
cd apps/api && npx jest test/whatsapp-proveedor.e2e-spec.ts           # sólo esta tarea
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-08-entrega.sh
```

Variables nuevas (en `.env`, que git ignora; los valores de ejemplo no son reales):

```bash
WHATSAPP_META_TEMPLATE_NAME=alerta_falla_critica
WHATSAPP_META_TEMPLATE_LANG=es_AR
WHATSAPP_TWILIO_CONTENT_SID=HX...
```

## 3. Qué datos hacen falta

Ninguno. El script levanta su receptor y sus tres APIs temporales (Meta con plantilla, Twilio con plantilla y Meta sin plantilla), y las apaga al terminar.

## 4. Qué endpoints o pantallas toca

Ningún endpoint nuevo ni pantalla nueva. Cambia lo que sale por `POST /api/whatsapp/enviar-alerta`, `POST /api/whatsapp/trigger-alerta-critica` y la aprobación de un aviso en la bandeja de Secretaría.

## 5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-08-entrega.sh
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-08-entrega.sh --carga 200
```

Medido el 21/11/2026:

| Qué | Resultado |
|---|---|
| Script de entrega | 6 verificaciones OK, 0 fallidas |
| Carga de 200 envíos por plantilla | 0 fallos, promedio 121 ms, la más lenta 146 ms |
| `whatsapp-proveedor.e2e-spec.ts` | 16 de 16 (11 nuevas) |
| `npm run verify` | Tipos OK · API 1154/1154 (80 archivos) · web 29 archivos en verde |
| `npm run test:int` | 188/188 (26 archivos) |
| Script de RF-04 | 6 de 6, con la plantilla configurada |

| Condición de aprobación | ¿Cubierta? | Cómo se prueba |
|---|---|---|
| 1. Meta manda `template` con nombre, idioma y 5 parámetros, sin texto libre | Sí | `whatsapp-proveedor.e2e-spec.ts` (cuerpo exacto) · script paso 1 |
| 2. Twilio manda `ContentSid` y `ContentVariables`, sin `Body` | Sí | `whatsapp-proveedor.e2e-spec.ts` · script paso 2 |
| 3. Sin plantilla no sale nada: `no_configurado` con el motivo | Sí | `whatsapp-proveedor.e2e-spec.ts` (Meta, Twilio y aprobación en bandeja) · script paso 3 |
| 4. Los parámetros salen limpios y de hasta 1024 caracteres | Sí | `whatsapp-proveedor.e2e-spec.ts` (detalle de varias líneas) · script paso 4 |
| 5. El texto de la plantilla queda documentado | Sí | [RF-08-plantilla-whatsapp.md](RF-08-plantilla-whatsapp.md) |
| 6. Las pruebas cubren 1 a 4 y `verify` y `test:int` están en verde | Sí | Tabla de arriba |

## 6. Qué quedó afuera y qué se asumió

- **No se probó contra Meta ni Twilio reales.** Todo se verificó contra un receptor local que registra el cuerpo exacto. Que el proveedor acepte el texto de la plantilla y los parámetros lo prueba RO-02 y RO-03, con cuentas reales.
- **El texto de la plantilla es una propuesta,** armada con el mensaje formal que ya salía como texto libre. MAICON tiene que aprobarlo antes de pedírselo al proveedor.
- **Sin enlace, la variable 5 lleva un guion:** Meta no admite variables vacías. Hoy el aviso de una falla crítica siempre trae enlace.
- **Se supuso la categoría `UTILITY`:** el proveedor puede reclasificarla en la revisión, y eso cambia el costo por mensaje.
- **El estado del equipo sale como está cargado** (por ejemplo «Fuera de Servicio»), no en mayúsculas como en el texto formal.
- **`GET /api/whatsapp/estado` no cambia:** dice si hay proveedor, no si tiene plantilla. Con proveedor y sin plantilla, el estado dice «configurado» y el envío queda `no_configurado`. Mostrarlo en pantalla es de HU-11 / RF-10.
- **Pruebas existentes de HU-11 / RF-04 ajustadas:** las del proveedor ahora cargan la plantilla en su entorno, porque sin ella el sistema corta. Cambió también `RF-04-entrega.sh`, por lo mismo.
- **El historial sigue en memoria,** como antes: se vacía al reiniciar la API. Cambiarlo no es de esta tarea.
- **Regresión:** la tarea no tiene módulo. Se corrió toda la API (1154 pruebas) y la integración (188) en verde.

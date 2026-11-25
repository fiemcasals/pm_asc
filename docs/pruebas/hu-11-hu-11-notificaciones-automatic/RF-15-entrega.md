# HU-11 · RF-15 — WhatsApp y diagnóstico de seguridad con sesión: solo quien corresponde

**Historia de Usuario:** HU-11: Notificaciones Automáticas por WhatsApp a la ECA
**Requerimiento:** RF-15 (`REQ-1795608267360`)
**Tipo:** Seguridad (quinta tarjeta de la serie: Portal ECA, Portal del Firmante, RT con sesión, canal en tiempo real y ésta)

## El problema

Las rutas que mandan WhatsApp con el número de la empresa, y dos que informan cómo está armado el sistema, no llevaban `@Roles`; en esta API una ruta sin `@Roles` es pública. Contra el código anterior, **sin ninguna sesión**:

- `POST /api/whatsapp/enviar-alerta` mandaba un WhatsApp **a un teléfono que elige quien llama** (cada mensaje tiene costo en Meta, y es una vía de spam con el nombre de MAICON);
- `POST /api/whatsapp/trigger-alerta-critica` disparaba el aviso de una alerta;
- `POST /api/whatsapp/formatear` y `GET /api/whatsapp/estado` respondían (el segundo dice si hay proveedor configurado y cuál);
- `GET /api/seguridad/rls` mostraba el diagnóstico de la base: rol de la API, políticas de seguridad y tablas.

Cada intento además quedaba **en el historial de envíos guardado en la base**, así que cualquiera podía llenarlo de filas. El script de entrega, contra ese código, da **6 errores** (7 verificaciones OK y 6 en rojo).

## Qué cambia

| Ruta | Antes | Ahora |
|---|---|---|
| `POST /api/whatsapp/enviar-alerta` | pública | **Secretaría y Administrador** |
| `POST /api/whatsapp/trigger-alerta-critica` | pública | **Secretaría y Administrador** |
| `POST /api/whatsapp/formatear` | pública | **Secretaría y Administrador** |
| `GET /api/whatsapp/estado` | pública | **Secretaría y Administrador** (la bandeja de Avisos, que ya manda la sesión, lo sigue usando) |
| `GET /api/seguridad/rls` | pública | **solo el Administrador** |
| `GET /api/whatsapp/historial` | Secretaría y Administrador (HU-11 RF-13) | igual |
| `POST/GET /api/whatsapp/webhook/{meta,twilio}` | sin sesión, con firma del proveedor | **igual**: los llaman Meta y Twilio |

Sin sesión → **401**; RT, Firmante y ECA → **403**; y en ambos casos **no sale ningún mensaje ni queda nada en el historial**.

### Los webhooks siguen sin sesión, y por qué es correcto

Los llama el proveedor, que no tiene sesión. Ya rechazan todo lo que no viene firmado (HMAC-SHA256 de Meta con el secreto de la app, HMAC-SHA1 de Twilio con su token) y, sin ese secreto configurado, rechazan todo. Esta tarjeta **fija ese comportamiento con pruebas**, con la aplicación sin ningún usuario implícito: sin firma responden 401 *por la firma* (el mensaje es el de «Firma del proveedor inválida», no el de «Tenés que iniciar sesión»); con la firma correcta entran; y la verificación de Meta con un token equivocado da 403 y con el correcto devuelve el desafío.

### En la web

- `enviarAlertaWhatsApp` y `triggerAlertaWhatsAppInmediata` mandan con `fetchConSesion` (antes, `fetch` sin sesión). Un 401 dice «La sesión venció: ingresá de nuevo» y un 403, «Sólo la Secretaría y el Administrador despachan alertas por WhatsApp.».
- El botón **«Despachar Alerta WhatsApp»** del portal de la ECA solo se dibuja para la Secretaría y el Administrador (`puedeDespacharWhatsApp`). Una ECA ve las alertas y su remito, pero no el botón: el servidor le respondería 403.
- La bandeja de Avisos no cambia: ya pedía `estado` e `historial` con la sesión.

## Decisiones que se tomaron (para revisar)

- **`estado` pasa de público a Secretaría/Administrador.** El spec de HU-11 RF-13 (`whatsapp-historial-sesion.e2e-spec.ts`) fijaba lo contrario («sigue sin pedir sesión»); lo cambié a propósito: el dato (hay proveedor, y cuál) solo lo usa el cartel de la bandeja, que es de la Secretaría. Si se prefiere público, es volver a sacar una línea de `@Roles`.
- **Formatear también pide sesión**, aunque no manda nada: nadie en la web lo usa, y dejarlo público solo agrega superficie.
- **El Administrador y la Secretaría pueden despachar a mano; el RT no.** Es lo que se habló: el que se queda en la oficina.

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-15-entrega.sh
```

Crea usuarios temporales (un RT, un Firmante y una ECA), prueba las cinco rutas con cada rol y los tres webhooks sin sesión, corre las pruebas de la web y **al terminar borra** los usuarios y los intentos de envío que dejó en el historial. Da **13 verificaciones OK**; contra el código anterior, 6 errores.

**No manda ningún WhatsApp real.** Si la API tiene un proveedor configurado (`WHATSAPP_*`), solo comprueba los rechazos (que nunca llegan al proveedor) y omite los envíos con permiso; sin proveedor, lo que pasa el control queda como «no_configurado».

**La pantalla (criterio 4), a mano:** con la web levantada, en el portal de la ECA:

1. Ingresar como un usuario **ECA**: se ven las alertas y el botón para descargar el remito, y **no** hay botón de WhatsApp.
2. Ingresar como **Secretaría** (o Administrador) → «Portal ECA» → elegir una ECA: en cada alerta (Fuera de Servicio y Reparación Urgente) aparece «Despachar Alerta WhatsApp», y en lugar del remito, la nota de que lo descarga la ECA.

Se recorrió en un navegador real con las dos sesiones (ver «Supuestos»).

## Pruebas automáticas

- **API** — `whatsapp-sesion.e2e-spec.ts` (45 pruebas, con sesiones reales de cada rol y un proveedor simulado que cuenta lo que le llega: las cinco rutas sin sesión y con token inventado; cada rol sin permiso → 403 y cero envíos; los permitidos pasan el control; el Administrador ve el diagnóstico de RLS y nadie más; los tres webhooks). Se adaptaron `whatsapp-historial-sesion.e2e-spec.ts` (el de `estado`, 8 pruebas) y `avisos.e2e-spec.ts` (el disparo con la sesión de la Secretaría), y los de integración `rls-eca.int-spec.ts` (el diagnóstico con un Administrador) y `whatsapp-historial.int-spec.ts` (el envío con sesión): los dos pasan contra PostgreSQL real.
- **Web** — `whatsapp-sesion.test.ts` (18 pruebas): quién puede despachar, los mensajes de 401/403, que el cliente use la sesión y nunca `fetch` sin sesión, y el botón en la barra y en la lista (las dos tarjetas, con y sin permiso).
- **Suites completas:** API 1340 de unidad/e2e, web 664. Integración: **166 pasan y 37 fallan, las mismas 37 que fallan en `dev` sin esta tarjeta** (ver «Supuestos»).
- **29 mutaciones** (cada ruta sin `@Roles`, roles de más y de menos, el historial público, el diagnóstico de RLS, las reglas del botón, el cliente sin sesión, los mensajes de error, el permiso que no llega a cada tarjeta): 28 hacen fallar alguna prueba. La que sobrevive es que `PortalEca` no le pase el permiso a la lista de alertas: las pruebas dibujan el HTML inicial y `PortalEca` carga sus datos después, así que **se verificó en el navegador** (la ECA sin botón, la Secretaría con dos).

## Supuestos y limitaciones

- **Integración: 37 pruebas fallan en `dev`, antes de esta tarjeta.** Son 9 suites (`acuse-persistencia`, `acuse-unico`, `alertas-avisos`, `avisos-persistencia`, `backoffice`, `fallas-persistencia`, `firmante-persistencia`, `paradas-persistencia`, `portal-eca-sesion`) que dan 404 o no encuentran la alerta: dependen de las máquinas y alertas de ejemplo que retiró HU-08 RF-06 (la tarjeta hoy bloqueada). Se comprobó corriéndolas sobre `dev` sin cambios: mismas 9 y mismas 37. Se resuelve con HU-10 RF-08 (que crea la alerta desde las paradas) y HU-08 RF-06.
- **En esta versión no hay alertas reales para ninguna ECA** (por lo mismo), así que la verificación del botón en el navegador se hizo **con una respuesta de la API inyectada** (dos máquinas con alerta); el cableado y las sesiones eran reales.
- **El botón manual sigue mandando a un teléfono y a una dirección fijos** (`+5491144009988` y `https://localhost:8050/api/eca/remito/…`): es un resto del demo que esta tarjeta no toca. Conviene una tarjeta aparte para que despache al teléfono de la terna de la ECA (la ruta `trigger-alerta-critica` ya lo hace).
- **Scripts de entrega viejos que llaman estas rutas sin sesión y hoy darían 401:** HU-11 RF-03, RF-04, RF-05, RF-08, RF-09, RF-10 y RF-12, y HU-15 RNF-01 (el diagnóstico de RLS). Varios arrancan su propia API de prueba. Quedan para el barrido de scripts, que conviene coordinar con las tarjetas HU-10 RF-08 y HU-08 RF-06.
- **RO-02** (probar el WhatsApp real): su criterio 3 pide `GET /api/whatsapp/estado` y ahora hace falta ingresar como Secretaría o Administrador para pedirlo.

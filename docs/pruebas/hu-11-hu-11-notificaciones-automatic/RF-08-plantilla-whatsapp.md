# HU-11 / RF-08 · La plantilla del aviso de falla crítica, lista para copiar al panel del proveedor

Meta y Twilio solo dejan que el sistema inicie una conversación con un **mensaje de plantilla** que el proveedor aprobó de antemano. El texto libre solo se permite dentro de las 24 horas posteriores a un mensaje del destinatario, y una alerta la inicia el sistema. Este documento tiene el texto exacto para registrar en el panel. Se registra **una vez**, y la aprobación del proveedor puede llevar días (ver RO-03).

- **Tarea:** HU-11 / RF-08 — `REQ-1795097860369` · **Entrega:** [RF-08-entrega.md](RF-08-entrega.md)
- **Qué hay que copiar:** el nombre, la categoría, el idioma, el cuerpo y los ejemplos de cada variable.
- **Lo que no se guarda acá:** credenciales ni números de teléfono. Van solo en las variables de entorno del servidor.

## Las 5 variables

El sistema manda siempre las 5 variables, **en este orden**. Meta las llama `{{1}}` a `{{5}}`, y Twilio también.

| # | Qué lleva | Ejemplo para el panel |
|---|---|---|
| `{{1}}` | Edificio | `Av. Corrientes 1234` |
| `{{2}}` | Equipo | `M1 - Principal` |
| `{{3}}` | Estado del equipo | `Fuera de Servicio` |
| `{{4}}` | Detalle de la falla | `Cabina trabada en piso 3` |
| `{{5}}` | Enlace al informe firmado y las fotos | `https://app.maicon.example/informe/abc123` |

El sistema limpia cada valor antes de mandarlo: sin saltos de línea, sin tabulaciones, sin tandas de más de 4 espacios, y con un máximo de 1024 caracteres. Si el aviso no tiene enlace, la variable `{{5}}` lleva un guion (`-`), porque Meta no admite variables vacías.

## Meta (WhatsApp Cloud API)

En **WhatsApp Manager › Plantillas de mensajes › Crear plantilla**:

| Campo | Valor |
|---|---|
| Categoría | Utilidad (`UTILITY`) |
| Nombre | `alerta_falla_critica` |
| Idioma | Español (Argentina) — `es_AR` |
| Encabezado, pie y botones | Ninguno |

**Cuerpo** (copiar tal cual):

```
Alerta crítica de MAICON S.R.L.: en {{1}} el equipo {{2}} figura en estado {{3}}.

Detalle: {{4}}

Informe firmado y fotos: {{5}}

Aviso legal automático generado conforme a la ordenanza AGC.
```

Los ejemplos de variables van en el mismo orden que la tabla de arriba. El texto termina con una frase y no con una variable, que es lo que Meta exige.

Después, en las variables de entorno del servidor:

```bash
WHATSAPP_PROVIDER=meta
WHATSAPP_META_TEMPLATE_NAME=alerta_falla_critica
WHATSAPP_META_TEMPLATE_LANG=es_AR
```

## Twilio (Content Template Builder)

En **Messaging › Content Template Builder › Create new**:

| Campo | Valor |
|---|---|
| Nombre | `alerta_falla_critica` |
| Idioma | Español (Argentina) |
| Tipo de contenido | `Text` |
| Canal | WhatsApp, categoría `UTILITY` |

**Cuerpo**: el mismo de Meta. Las variables llevan los mismos ejemplos de la tabla de arriba.

Cuando Twilio aprueba la plantilla, muestra su **Content SID**, que empieza con `HX`. Va en las variables de entorno del servidor:

```bash
WHATSAPP_PROVIDER=twilio
WHATSAPP_TWILIO_CONTENT_SID=HX...
```

## Si el texto cambia

El texto de la plantilla y el código tienen que coincidir en la cantidad y el orden de las variables. Si se agrega, se saca o se reordena una variable, hay que cambiar también `VARIABLES_PLANTILLA_AVISO` en `apps/api/src/whatsapp/whatsapp.types.ts` y `parametrosPlantilla` en `whatsapp-formatter.service.ts`. Un cambio solo del texto en el panel obliga a pedir una aprobación nueva.

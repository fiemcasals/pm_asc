# HU-02 · RF-02 · Guía de prueba — Pestaña de Asignación de Roles de Trabajo

Recorrido de la pantalla con la que Secretaría asigna la terna de cada edificio.

**Antes de empezar:** tiene que haber al menos dos edificios en `Edificios Empadronados`. Si no hay, crealos con `+ Alta de Nuevo Consorcio` en la pestaña `Edificios y Máquinas`.

```mermaid
flowchart LR
  A[Secretaría] --> B[Asignación de Roles de Trabajo]
  B --> C[Elegir edificio]
  C --> D[Completar la terna]
  D --> E[Guardar]
  E --> F{¿Datos válidos?}
  F -- Sí --> G[Confirmación y lista actualizada]
  F -- No --> H[Lista de errores]
  H --> D
  G --> I[Otro edificio: elegir persona en el selector]
```

## Paso 1. Entrar a Secretaría

Abrí `https://localhost:8050` y apretá `Secretaría (Edificios y Máquinas)`.

![Paso 1](imagenes/RF-02-paso-1.png)

## Paso 2. Abrir la pestaña

Apretá `Asignación de Roles de Trabajo`.

![Paso 2](imagenes/RF-02-paso-2.png)

## Paso 3. Elegir el edificio

En `Edificios Empadronados`, apretá el edificio. Un edificio sin terna muestra el indicador `Sin asignar`.

![Paso 3](imagenes/RF-02-paso-3.png)

## Paso 4. Completar la terna

Los bloques son `RT Calle (60%)`, `Firmante AGC (25%)` y `ECA Responsable`. Cada uno tiene el selector `Responsable`, con la opción `+ Persona nueva` y las personas que ya ocupan ese rol en otro edificio.

Con `+ Persona nueva` elegido, cargá:

| Bloque | `Nombre *` | `Teléfono` | `Email` |
|---|---|---|---|
| `RT Calle (60%)` | Laura Gómez | 11 4000-1000 | |
| `Firmante AGC (25%)` | Ing. Pablo Ruiz | | pablo@maicon.test |
| `ECA Responsable` | Conservación Porteña S.R.L. | | contacto@portena.test |

![Paso 4](imagenes/RF-02-paso-4.png)

## Paso 5. Guardar

Apretá `Guardar`.

![Paso 5](imagenes/RF-02-paso-5.png)

## Paso 6. Comprobar la confirmación

Aparece `✓ Responsables guardados para <nombre del edificio>.` Sin recargar la página, la fila del edificio pasa a `Asignado` y muestra los tres nombres.

![Paso 6](imagenes/RF-02-paso-6.png)

## Paso 7. Reutilizar a una persona en otro edificio

Apretá otro edificio. En `RT Calle (60%)`, abrí el selector `Responsable` y elegí `Laura Gómez`: `Nombre *` y `Teléfono` se completan solos. Repetí con los otros dos roles y apretá `Guardar`.

![Paso 7](imagenes/RF-02-paso-7.png)

## Comprobaciones adicionales

1. **Modificar:** en un edificio asignado, cambiá el `Nombre *` de `ECA Responsable`, apretá `Guardar` y recargá la página. El nombre nuevo sigue en la fila del edificio.
2. **Error:** dejá un responsable sin `Teléfono` ni `Email` y apretá `Guardar`. Aparece `Por favor corrija los siguientes errores:` y la terna anterior no cambia.
3. **Cambios sin guardar:** cambiá un dato sin apretar `Guardar` y apretá otro edificio. Aparece `Hay cambios sin guardar. ¿Salir y descartarlos?`. Con `Cancelar` seguís en el mismo edificio y conservás lo escrito.

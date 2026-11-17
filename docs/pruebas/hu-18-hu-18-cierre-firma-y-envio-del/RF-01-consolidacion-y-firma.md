# HU-18 · RF-01 — Consolidación y firma en pantalla

**Qué hace.** Al terminar la visita, el RT consolida el informe del edificio y hace firmar **una sola vez** al encargado (o a quien corresponda) con el dedo. Si no firma nadie, cierra **«Sin firma»** con motivo y foto, y el informe queda marcado para la Secretaría y el Firmante.

Captura (celular, 360 px): `imagenes/RF-01-firma-en-pantalla.png`.

## La pantalla (RT › Inspección Técnica › al final, «Cierre de la visita»)

Aparece cuando el RT llegó a la inspección **desde el mapa** (HU-16 RF-02), que es lo que identifica el edificio.

| Paso | Comportamiento |
|---|---|
| **Consolidar Informe y Proceder a Firma** | Deshabilitado hasta que **todos los equipos** estén completos —todas las solapas de su tipo con sus ítems respondidos y las fotos obligatorias— o **resueltos como fuera de servicio**. Debajo dice qué falta («M2: falta indicar si está en uso», «M1: faltan completar: Fosa»). |
| Firma del encargado | Un recuadro para **firmar con el dedo** (con «Borrar firma»). Un toque suelto o una raya mínima no cuentan: «La firma está vacía». |
| Datos de quien firma | **Nombre, apellido y carácter** (Encargado, Administrador o Propietario) obligatorios; **DNI opcional** (si se escribe, 7 u 8 dígitos). |
| **Sin firma** | Pestaña aparte: **motivo** (al menos 10 caracteres) y **foto** obligatorios; avisa que el informe queda marcado para la Secretaría y el Firmante. |
| Cerrar | «Firmar y cerrar el informe» / «Cerrar “Sin firma”». Los errores se muestran todos juntos. Al cerrar: «Informe cerrado». |

La firma se guarda como **imagen PNG** y como **trazos** (los puntos del dedo): los trazos permiten comprobar que no está vacía y respaldan la imagen. Es una sola firma para todo el edificio, aunque tenga varios equipos.

## API

| Acción | Endpoint | Quién |
|---|---|---|
| Cerrar el informe (con `firma` **o** `sinFirma`) | `POST /api/informes-visita` | RT de Calle del edificio |
| Listar (`?sinFirma=true` = los que hay que revisar) y ver el detalle | `GET /api/informes-visita`, `GET /api/informes-visita/:id` | Secretaría, Administrador, Firmante del edificio |

La API **vuelve a validar todo** (no se confía en la pantalla): al menos un equipo; hay firma **o** «Sin firma», nunca las dos ni ninguna; la firma con nombre y apellido (2 a 60 caracteres), carácter de la lista, DNI normalizado a dígitos si se manda, imagen PNG de hasta 400 KB y trazos con al menos 8 puntos y 15 px de tamaño; «Sin firma» con motivo de 10 a 500 caracteres y foto (imagen en data URL). Errores: **400** con la lista de motivos; **404** si el edificio no es del RT (RLS). El usuario sale de la sesión.

- **Datos:** tabla `informes_visita` (migración `029_informes_visita`): contenido de los equipos (respuestas, observaciones y fotos), firma o sin firma, `requiere_revision`, hora del dispositivo y del servidor. La base exige firma **xor** sin firma y que la marca de revisión sea coherente; con RLS (el RT inserta y ve los suyos, el Firmante los de sus edificios, la Secretaría y el Administrador todos) y **sin permisos de modificar ni borrar** desde la aplicación.
- **Límite del cuerpo:** el informe lleva fotos y firma, así que el límite de JSON de la API se subió de 100 KB a **25 MB**.

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RF-01-entrega.sh
```

Pruebas automáticas: `informes.spec.ts` (validación de la firma, el DNI y «Sin firma»), `informes.e2e-spec.ts` (roles reales y un cuerpo de más de 100 KB), `informes.int-spec.ts` (PostgreSQL real: RLS, CHECK, sin edición) y `apps/web/src/informe/consolidacion.test.ts` (cuándo se puede consolidar, la firma, los datos, el cuerpo). Se verificaron con 20 mutaciones (firma con 7 puntos o con 16 px de borde, DNI obligatorio, cualquier carácter, firma y sin firma juntas, sin foto, motivo corto, sin marca de revisión, usuario del cuerpo, rol abierto, límite de 100 KB, informe sin equipos, fuera de servicio sin resolver, solapa incompleta tolerada, etc.): todas hacen fallar algún test. La pantalla se recorrió en el navegador a 360 px: el botón bloqueado con un equipo sin resolver y habilitado con los dos fuera de servicio, los errores de firma vacía, un toque suelto rechazado, una firma dibujada aceptada y el informe guardado en la base.

## Supuestos y limitaciones

- «Resuelto como fuera de servicio» = el RT marcó el equipo «NO, FUERA DE SERVICIO» en la pregunta de uso; no se exige además el reporte de parada (HU-17 RF-03).
- **El Firmante «decide»** el cierre sin firma (P8 del cliente): por ahora lo **ve** (lista y detalle por API, con su foto y motivo); la pantalla del Firmante para resolverlo y registrar su decisión no está en esta tarjeta.
- El cierre sólo aparece si la inspección se inició desde el mapa del RT. La pantalla de demostración sin edificio no lo muestra.
- El informe se envía en el momento: si no hay señal, se pierde el intento hasta que se haga la cola de sincronización (**HU-18 RNF-02**). El sellado con hash y la inmodificabilidad con auditoría son **HU-18 RNF-01** (hoy la aplicación ya no puede modificar ni borrar un informe, pero todavía no hay hash ni registro de intentos).
- Las firmas no tienen validez legal por sí solas hasta el sellado (RNF-01) y la definición de la firma electrónica (Ley 25.506) con el cliente.

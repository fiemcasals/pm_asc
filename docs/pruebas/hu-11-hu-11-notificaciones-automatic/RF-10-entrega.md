# HU-11 · RF-10 · Entrega — Mostrar en la bandeja de avisos si WhatsApp está activo y el estado real de cada envío

- **Tarea:** HU-11 / RF-10 — `REQ-1795097860686`
- **Rama:** `feature/hu-11-hu-11-notificaciones-automatic/req-1795097860686-mostrar-en-la-bandeja-de-avisos-si-whats`
- **Depende de:** HU-11 / RF-09 (`REQ-1795097860589`), que es lo que hace cambiar los estados del historial. Con RF-09 sin mergear, la pantalla funciona pero todos los envíos aceptados figuran «Aceptado por WhatsApp: todavía sin confirmación de entrega».
- **Script del flujo integrado:** [RF-10-entrega.sh](RF-10-entrega.sh)
- **Guía visual con capturas:** [RF-10-guia-visual.md](RF-10-guia-visual.md)

## 1. Qué quedó implementado

La bandeja «Avisos a la ECA» de la Secretaría ya no deja que la Secretaría descubra recién después de aprobar que WhatsApp no estaba configurado.

- **Cartel de WhatsApp,** arriba de la lista, tomado de `GET /api/whatsapp/estado`:
  - verde: «WhatsApp activo: Meta» o «WhatsApp activo: Twilio»;
  - amarillo: «WhatsApp no configurado: los avisos aprobados no salen por WhatsApp»;
  - amarillo si no responde: «No se pudo consultar el estado de WhatsApp. Podés aprobar los avisos igual: el resultado de cada envío figura abajo.»
  - No muestra credenciales ni teléfonos.
- **Estado real de cada envío de WhatsApp,** tomado de `GET /api/whatsapp/historial` y cruzado con cada aviso por alerta y teléfono (el registro más reciente): «Aceptado por WhatsApp: todavía sin confirmación de entrega», «Enviado», «Entregado», «Leído» o «Falló: <motivo del proveedor> (código N)». Si el envío no llegó a salir, «No salió: <motivo>».
- **El botón «Aprobar y enviar» no cambia:** con WhatsApp sin configurar sigue funcionando y el aviso queda «Falló el envío», como antes.
- **Botón nuevo «Actualizar estados»,** porque los estados cambian cuando el proveedor avisa y la pantalla no se actualiza sola.
- **Sin historial para un envío** (por ejemplo, después de reiniciar la API) se muestra lo que guardó el aviso al enviar, como antes.
- **El correo no cambia.**

Archivos: `apps/web/src/avisos/avisos.ts` (lógica: `cartelWhatsApp`, `cargarEstadoWhatsApp`, `cargarHistorialWhatsApp`, `estadoRealDeEnvio`), `BandejaAvisos.tsx` (pantalla) y `avisos.test.ts`. No cambia código de la API.

## 2. Cómo se levanta y se prueba

```bash
npm install
npm run db:up
npm run verify                                                            # tipos + API + web
cd apps/web && npx vitest run src/avisos                                  # sólo esta tarea
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-10-entrega.sh
```

Para verla: `npm run dev`, entrar con `demo.secretaria` / `Demo-Clave-2026` (datos de demo: `RF-02-datos-demo.sh` de HU-04) y abrir Secretaría › Avisos a la ECA. La guía visual explica cómo se ve cada caso.

## 3. Qué datos hacen falta

Los datos de demo y, para ver un aviso, intentar el disparo de la alerta `ALT-MAICON-001` (`POST /api/whatsapp/trigger-alerta-critica`), que lo deja pendiente de revisión. Para ver estados confirmados hace falta un proveedor de WhatsApp (o uno falso) y HU-11 / RF-09.

## 4. Qué endpoints o pantallas toca

Lee `GET /api/whatsapp/estado` y `GET /api/whatsapp/historial`, que ya existían. La pantalla es la solapa «Avisos a la ECA» de Secretaría.

## 5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-10-entrega.sh
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-10-entrega.sh --carga 100
```

Medido el 21/11/2026:

| Qué | Resultado |
|---|---|
| Script con RF-10 sola | 5 verificaciones OK; omite el recorrido de estados y lo dice, porque necesita RF-09 |
| Script con RF-10 + RF-09 combinadas (en una rama temporal local) | 7 verificaciones OK, 0 omitidas; el historial pasa de aceptado a entregado y a leído |
| Carga de 100 aperturas de la bandeja (estado + historial) | 0 fallos, promedio 169 ms, la más lenta 194 ms (incluye arrancar `node`) |
| `avisos.test.ts` | 26 de 26 (18 nuevas) |
| `npm run verify` | Tipos OK · API 1143/1143 · web 555 en verde, 1 omitida que ya venía así |
| `npm run test:int` | 188/188 |
| Capturas de la guía | 9, con Playwright, en 1280 × 800 |

| Condición de aprobación | ¿Cubierta? | Cómo se prueba |
|---|---|---|
| 1. Cartel con «WhatsApp activo: Meta», «…: Twilio» o «WhatsApp no configurado…», sin credenciales ni teléfonos | Sí | `avisos.test.ts` (`cartelWhatsApp`, `cargarEstadoWhatsApp`) · guía pasos 1 y 4 |
| 2. Sin WhatsApp, «Aprobar y enviar» sigue funcionando y queda «Falló el envío», explicado antes | Sí | Guía pasos 1 a 3 (la pantalla real) |
| 3. Cada aviso muestra Enviado, Entregado, Leído o Falló con el motivo | Sí | `avisos.test.ts` (`estadoRealDeEnvio`) · guía pasos 6 a 8 · script paso 4 |
| 4. Si el estado no responde, el cartel lo dice y la bandeja sigue usable | Sí | `avisos.test.ts` · guía paso 9 |
| 5. Las pruebas de la web cubren los tres estados y el caso sin respuesta, y la guía tiene capturas con Playwright | Sí | `avisos.test.ts` · [RF-10-guia-visual.md](RF-10-guia-visual.md) |

## 6. Qué quedó afuera y qué se asumió

- **La pantalla se probó a mano con Playwright, no con una prueba automática del componente:** el repositorio no tiene Testing Library, y la lógica de los estados está en funciones puras con pruebas. Las capturas son la evidencia de la pantalla.
- **El estado general del aviso no cambia:** una vez enviado queda «Enviado» aunque el proveedor avise después que un mensaje falló. En la captura 8 el aviso figura «Enviado» y el WhatsApp al Firmante «Falló». Reintentar un envío fallido por WhatsApp desde la bandeja no es de esta tarea.
- **Se pidió el historial completo,** que hoy incluye los teléfonos de todos los envíos y es de lectura pública. Cruzar por alerta se hace en la pantalla. Proteger ese endpoint o filtrarlo por alerta en el servidor no es de esta tarea.
- **Se agregó «Actualizar estados»,** que la tarea no pedía, porque sin él el estado no se ve cambiar sin recargar la pantalla.
- **Un teléfono vacío se ve como «()»,** como antes, cuando la ECA no tiene teléfono cargado.
- **«Proveedor propio»** es el texto que se muestra si la API informa un proveedor distinto de Meta y Twilio (solo ocurre en pruebas).
- **Con RF-09 sin mergear,** los avisos del proveedor no entran y los envíos siguen «aceptados».
- **Regresión:** la tarea no tiene módulo. Se corrió toda la API, la web y la integración en verde.

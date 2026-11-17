# HU-18 · RNF-02 — Cola de sincronización del celular

**Qué hace.** Cuando el RT cierra el informe, el celular lo **guarda primero en su propia memoria** (con las fotos y la firma) y recién después intenta subirlo. Si no hay señal, si el envío se corta o si la sesión venció, el informe **no se pierde**: queda en una cola, la pantalla muestra **«N inspecciones sin subir»** y se envía solo en cuanto se pueda. Cada informe lleva un **identificador generado en el celular**, así que reenviarlo —cuantas veces haga falta— **no lo duplica**.

## Qué ve el RT

| Situación | Qué pasa |
|---|---|
| Cierra el informe **con señal** | Se sube y aparece «Informe cerrado» con el sello, igual que antes. |
| Lo cierra **sin señal** (o el envío se corta, o el servidor falla) | «Informe guardado en el celular. Todavía no se subió: se envía solo en cuanto haya señal. No hace falta volver a cerrarlo.» Arriba de la pantalla: **«1 inspección sin subir · Se envían solas cuando vuelva la señal»**. |
| **Vuelve la señal** con la app abierta | La cola se envía sola (evento «online» del celular, y además cada 30 segundos mientras haya algo pendiente). Si la pantalla del cierre sigue abierta, pasa sola a «Informe cerrado» con el sello. El aviso desaparece. |
| **Sesión vencida** (no se pudo renovar) | El informe queda guardado. El aviso dice «Último intento: La sesión venció: ingresá de nuevo y se envía solo.» Al volver a ingresar, se envía sin que el RT haga nada. |
| El servidor **rechaza** el informe de forma definitiva (por ejemplo, el edificio ya no está asignado al RT) | No se reintenta (no se arregla reintentando). El aviso muestra el motivo y un botón **Descartar** (pide confirmación; el informe se pierde). |
| **«Reintentar ahora»** | Fuerza un envío sin esperar. Está deshabilitado si no hay señal. |

El contador cuenta todo lo que todavía no está en el servidor: los pendientes **y** los rechazados.

## Cómo funciona

1. **Se guarda antes de enviar.** Al tocar «Firmar y cerrar» el informe completo se guarda en IndexedDB (almacén `cola_informes`) y *después* se manda. Si se cierra la app en medio del envío, el informe ya está a salvo.
2. **El identificador.** Se genera en el celular al cerrar (`crypto.randomUUID()`, con alternativas si la página no tiene https) y se reusa en cada reintento del mismo cierre. Viaja en el cuerpo como `clientReportId` (8 a 100 caracteres: letras, números, `-` y `_`).
3. **La API no duplica.** `POST /api/informes-visita` con un `clientReportId` que ya existe **devuelve el informe original con 200** (no 201) y no crea otro. Eso cubre el caso peor: la API guardó el informe pero la respuesta nunca llegó al celular. La unicidad la garantiza la base (índice único), así que dos envíos simultáneos tampoco duplican (uno recibe 201 y el resto 200).
4. **Qué se reintenta y qué no.**

| Respuesta | Qué hace la cola |
|---|---|
| 200 / 201 | Enviado: sale de la cola. |
| Sin conexión, corte a mitad de camino, respuesta cortada | Reintentable: queda en la cola con todo. Se frena el envío (si no hay señal para uno, no la hay para los demás). |
| 401 (sesión vencida) o sesión revocada por un Administrador | Reintentable: queda en la cola hasta volver a ingresar. Se frena el envío. |
| 5xx, 408, 425, 429 | Reintentable: queda en la cola; un error del servidor con un informe **no frena** a los que siguen. |
| Otro 4xx (400, 403, 404, 409, 413…) | Rechazo definitivo: se marca «rechazado» con el motivo del servidor y se conserva hasta que el RT lo descarte. |

5. **Un envío a la vez.** Los disparos juntos (señal que vuelve, reloj, un cierre nuevo) se juntan en una sola pasada que nunca corre en paralelo con otra, y los informes salen **en el orden en que se cerraron**.
6. **Cada RT, lo suyo.** Cada informe guarda quién lo cerró; sólo esa persona lo envía (la API le pone al informe el usuario de la sesión que lo manda). Si otro RT usa el mismo celular, no manda los informes ajenos, y si en medio de un envío cambia el usuario con sesión, el envío se frena.

## Datos

- **API:** migración `031_informes_idempotentes`: columna `client_report_id` (única, con CHECK del formato) en `informes_visita`. El identificador **no forma parte del sello** (el SHA-256 de RNF-01 se calcula igual con o sin él) y los informes anteriores quedan con `null` (sin deduplicar).
- **Celular:** la base IndexedDB `mant_asc_inspeccion_db` pasa a la **versión 2** y agrega el almacén `cola_informes`. Quien ya tenía la versión 1 conserva su visita en curso y su cola de fallas críticas (se comprobó en un navegador real).
- **Qué se guarda en el celular:** el cuerpo del informe (incluidas fotos y firma). **No se guarda el token** de la sesión: el envío usa la sesión vigente.

## Cómo probarlo

**Contra la API (identificador, reenvío, simultáneos, sesión vencida):**

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RNF-02-entrega.sh
```

**En la pantalla (cola del celular):** con la app levantada (`npm run dev`) y un RT con un edificio asignado:

1. Ingresar como RT, abrir el mapa, tocar el edificio → «Verificar» → «Iniciar Inspección».
2. En las herramientas del navegador (F12 → Network) pasar a **Offline**.
3. Resolver los equipos (por ejemplo, «No» en uso → fuera de servicio), «Consolidar Informe…», elegir «Sin firma» (motivo + foto) y cerrar. Ver «Informe guardado en el celular» y arriba «1 inspección sin subir».
4. Volver a **Online**: el aviso desaparece solo y la pantalla pasa a «Informe cerrado» con el sello. En la base hay un solo informe, con el identificador del celular.
5. Para el corte a mitad de camino: cerrar con la red cortada justo después de enviar (o simular que la respuesta no llega) y comprobar que, al reintentar, no aparece un segundo informe.
6. Para la sesión vencida: cerrar el informe, salir («Cerrar sesión») con algo pendiente y volver a ingresar: se envía solo.

Esto mismo se recorrió con un navegador real (Playwright): cierre sin señal → cola → vuelve la señal → envío automático y sello; respuesta perdida tras guardar la API → reintento sin duplicar (la base quedó con los informes esperados y el sello mostrado fue el del original); sesión vencida → salir y volver a ingresar → envío; informe rechazado (edificio inexistente) → motivo en pantalla y descarte con confirmación; y la actualización de la base v1 → v2.

## Pruebas automáticas

- **API:** `informes-idempotencia.spec.ts` (validación del identificador, reenvío, simultáneos, otro usuario, el identificador fuera del sello), `informes.e2e-spec.ts` (HTTP con roles reales: 201 vs 200, simultáneos, 400, 409, 403) e `informes.int-spec.ts` (PostgreSQL real: diez envíos simultáneos → una fila, CHECK y UNIQUE). Se verificaron con 9 mutaciones (no mirar si ya existe, repositorio sin detectar el repetido, siempre 201, reenvío que dice «creado», devolver el informe de otro usuario, el identificador dentro del sello, cualquier identificador válido, perder la carrera, base sin `ON CONFLICT`): todas hacen fallar algún test.
- **Celular:** `cola.test.ts` (clasificación de respuestas, guardar antes de enviar, orden, un solo envío a la vez, otro usuario, sesión vencida/revocada, rechazados, envío automático con reloj simulado) y `checklist.test.ts` (IndexedDB: versión 2, almacenes que conviven, fotos intactas, de punta a punta). Se verificaron con 34 mutaciones (401 o 5xx tomados como rechazo, no guardar antes de enviar, enviar sin señal, no frenar o frenar de más, orden, otro usuario, no sacar lo enviado, pasadas en paralelo o sin juntar, rechazados que se reenvían o se borran, descartar pendientes, plural y fecha, envío automático sin señal / sin pendientes / sin detener, informe sin identificador, identificador repetido, base sin subir de versión o sin el almacén nuevo): todas hacen fallar algún test.

## Supuestos y limitaciones

- **Sólo con la app abierta.** El envío automático corre mientras la app está abierta (al abrirla, al volver la señal y cada 30 segundos). Con la app cerrada no se envía: no hay sincronización en segundo plano del sistema (haría falta el service worker). Al abrirla de nuevo, se envía.
- **La cola vive en el celular.** Si el RT borra los datos del navegador o desinstala la aplicación con informes sin subir, se pierden. Si el almacenamiento del celular está lleno, la pantalla lo avisa («no se pudo guardar») y el informe sigue en pantalla para reintentar.
- **Un informe rechazado se pierde si se descarta.** No hay un canal para mandarlo a soporte; conviene definir con el cliente qué hacer con ellos.
- **Dos cierres son dos informes.** El identificador se genera por cierre: cerrar dos veces la misma visita desde la pantalla crea dos informes (la visita en curso sigue guardada después de cerrar; es anterior a esta tarjeta). Lo que se evita es duplicar **el reenvío del mismo cierre**.
- **Las horas.** La *hora del dispositivo* es la del cierre; la *hora del servidor* (que forma parte del sello) es la del envío real, que puede ser mucho después.
- **Mismo identificador, distinto contenido.** Si llegara el mismo `clientReportId` con otro contenido, la API devuelve el original e ignora lo nuevo (el informe sellado no cambia).
- **Un identificador ya usado por otro usuario** da 409; en la práctica, la seguridad de filas de la base ya le oculta al otro RT los informes ajenos.
- Los informes cerrados antes de esta tarjeta no tienen identificador y no se deduplican.

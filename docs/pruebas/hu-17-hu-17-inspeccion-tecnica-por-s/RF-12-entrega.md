# HU-17 · RF-12 · Entrega — [FIX] La lista de paradas vuelve a no traer las imágenes

- **Tarea:** HU-17 / RF-12 — `REQ-1795872287313`
- **Script:** [RF-12-entrega.sh](RF-12-entrega.sh) · **Prueba en el navegador:** [RF-12-navegador.cjs](RF-12-navegador.cjs)
- **Guía visual:** [RF-12-foto-de-la-parada.md](RF-12-foto-de-la-parada.md) — 2 capturas con Playwright, con el elemento de cada paso resaltado.
- **Archivos cambiados (API):** [`paradas.service.ts`](../../../apps/api/src/paradas/paradas.service.ts), [`paradas.controller.ts`](../../../apps/api/src/paradas/paradas.controller.ts), [`paradas.types.ts`](../../../apps/api/src/paradas/paradas.types.ts) y [`firmante.types.ts`](../../../apps/api/src/firmante/firmante.types.ts).
- **Archivos nuevos (web):** [`memoriaDeFotos.ts`](../../../apps/web/src/eca/memoriaDeFotos.ts), [`FotoDeAlerta.tsx`](../../../apps/web/src/eca/FotoDeAlerta.tsx) y su prueba [`memoriaDeFotos.test.ts`](../../../apps/web/src/eca/memoriaDeFotos.test.ts); cambian [`AlertasCriticas.tsx`](../../../apps/web/src/eca/AlertasCriticas.tsx) y [`eca.ts`](../../../apps/web/src/eca/eca.ts).
- **Pruebas nuevas (API):** `paradas-fotos.spec.ts` (17), `paradas-fotos.e2e-spec.ts` (19) y `paradas-fotos.int-spec.ts` (1, con la base real).
- **Qué arregla:** `paradas.spec.ts` en rojo en `dev` y en `testing`. **No se tocó ninguna prueba existente.**

## 1. Qué pasaba

Desde HU-10 RF-08 (commit `dbed7f5`), cada reporte de parada de la lista traía `fotoUrl`: **la primera foto completa, en base64**, para mostrarla en la alerta del Portal ECA. Eso rompió el criterio de HU-17 RF-03, **«la lista no devuelve las imágenes, sólo cuántas hay»**, y la prueba que lo cuida (`paradas.spec.ts`) falla en `dev` y en `testing` desde entonces. `npm run verify` de la API no pasaba.

Además es el mismo problema de peso que el chat resolvió en HU-19 RF-05: cada consulta de la lista bajaba una foto entera por reporte, y no sólo la lista: también la respuesta de guardar, confirmar o rechazar un reporte repetía la imagen.

## 2. Qué quedó implementado

- **La lista y las respuestas no llevan la imagen.** `GET /api/paradas`, `POST /api/paradas` y `POST /api/paradas/:id/confirmar|rechazar` devuelven una **vista** del reporte: la cantidad de fotos (`fotos`) y `fotoRuta`, la ruta para pedirla aparte (o `null` si la foto no se puede servir). La imagen se sigue **guardando** con el reporte, en la base, igual que antes.
- **La foto se sirve aparte:** `GET /api/paradas/:id/foto`.
  - **Con sesión.** Sin ella, 401.
  - **A quien puede ver el reporte:** la Secretaría y el Administrador, todos; el Firmante, los de sus edificios; la ECA, los de su empresa; el RT de Calle, los que cargó él. Para cualquier otro, **404** (no 403), el mismo mensaje que para un reporte que no existe: no se revela que existe.
  - **Con caché de un año** (`private, max-age=31536000, immutable`), porque la foto de un reporte no cambia, y `nosniff`.
- **La alerta del Portal ECA pide la foto por esa ruta.** La alerta de la máquina trae `fotoRuta`; la pantalla la baja con la sesión **una sola vez** (la guarda en memoria, con un tope de 60 fotos y sin mezclar usuarios) y la muestra. Si la ruta no responde, o la alerta no viene de un reporte de parada (las de ejemplo), muestra la foto de siempre. El `<img>` indica de dónde salió en `data-origen` (`ruta` o `respaldo`).
- **Lo demás sigue igual.** La alerta conserva la imagen adentro (`fotografiaCabinaTrabada`) porque la usan el remito, el aviso de la Secretaría con su enlace y el detalle del backoffice. Las pruebas que miran ese campo, de HU-10 y HU-11, siguen pasando sin cambios.

## 3. Cómo se levanta y se prueba

```bash
npm run db:up && npm run dev                                   # API
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
npm run build -w apps/web && npm run preview -w apps/web        # web compilada en https://localhost:4173
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-12-entrega.sh
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-12-entrega.sh --carga 30
```

La prueba del navegador carga un reporte de «DEMO Cabildo 1540 · M1» como `rt.beto` y, **al terminar, el Firmante lo rechaza**: el equipo vuelve a Normal y la demo queda como estaba (queda un reporte «Rechazado» en la lista por cada corrida).

## 4. Qué datos hacen falta

Los de demo de HU-04 RF-02: `rt.beto`, `demo.firmante`, `demo.secretaria` y `demo.eca`, clave `Demo-Clave-2026`.

## 5. Qué endpoints o pantallas toca

- **Nuevo:** `GET /api/paradas/:id/foto`.
- **Cambia lo que devuelven:** `GET /api/paradas`, `POST /api/paradas`, `POST /api/paradas/:id/confirmar`, `POST /api/paradas/:id/rechazar` (`fotoUrl` desaparece; aparece `fotoRuta`) y las alertas de `GET /api/eca/alertas` y `GET /api/eca/maquinas` (aparece `fotoRuta`).
- **Pantalla:** el Portal ECA, la tarjeta «ALERTA CRÍTICA: FUERA DE SERVICIO».
- **No cambia ninguna pantalla que lea `fotoUrl`:** ninguna lo leía.

## 6. Cómo se corre integrado

Resultado del 28/11/2026:

| Condición | Resultado |
|---|---|
| 1. La lista trae sólo la cantidad de fotos y `paradas.spec.ts` vuelve a pasar | `paradas.spec.ts`: 8 de 8, **idéntica a la de `dev`** (el script lo comprueba con `git diff`). Ni la lista ni guardar, confirmar o rechazar traen una imagen |
| 2. La foto se sirve aparte, con sesión y a quien corresponde; la ECA la ve en su alerta | Sin sesión 401. Con permiso 200, `image/jpeg`, caché de un año y los mismos bytes que mandó el RT. Otro Firmante o una ECA ajena, 404. La alerta de `demo.eca` muestra la foto con `data-origen=ruta`, **un solo pedido** con la sesión, y no se baja de nuevo al salir y volver |
| 3. El peso de la lista no crece con las fotos | 5 reportes con una foto de 500 KB: la lista pesa menos de 10 KB (prueba por HTTP). En el navegador, unos 710 bytes por reporte frente a una foto de 74 KB |
| 4. `npm run verify` sin fallas, con pruebas nuevas | Tipos bien, **API 1679/1679** (36 nuevas; en `dev` era 1642 de 1643), **web 991/991** (17 nuevas). `test:int` de paradas contra PostgreSQL real: 3/3 (1 nueva) |

`RF-12-entrega.sh`: **11 bien, 0 mal, 0 omitidos** (con 12 comprobaciones en el navegador).

`RF-12-entrega.sh --carga 30`: 30 pedidos de la lista y 30 de la foto, **0 fallidos**. La lista (2.109 bytes con los reportes que había): promedio 14 ms, p95 21 ms, máx 25 ms. La foto (74.639 bytes): promedio 15 ms, p95 24 ms, máx 40 ms. Se midió contra la API local con la base real.

## 7. Qué quedó afuera y qué se asumió

- **Las alertas siguen llevando la imagen adentro.** `GET /api/eca/alertas`, `GET /api/eca/maquinas` y `GET /api/firmante/maquinas` siguen trayendo `fotografiaCabinaTrabada` en base64, porque el remito, el aviso con enlace y el backoffice leen ese campo. La pantalla de la ECA ya no la usa (pide la ruta), pero el peso de esas respuestas no bajó. Sacarla de ahí obliga a que el remito, el aviso y el backoffice también la pidan por la ruta: es una tarea aparte, más grande. **Está en el tablero como HU-10 RF-09 (`REQ-1795876195799`)**, que depende de esta Tarea.
- **El caché de memoria de la pantalla está duplicado con el del chat.** `memoriaDeFotos.ts` y el de HU-19 RF-05 (PR #126, todavía sin mergear) hacen lo mismo, con otro nombre. Cuando se mergee el chat conviene unificarlos.
- **Reportes viejos con una dirección web en `fotoUrl`** (no una imagen) no se sirven por la ruta: `fotoRuta` es `null` y la alerta usa la foto de siempre. Hoy los reportes que carga el RT son imágenes.
- **Un RT sólo ve la foto de los reportes que cargó él.** Otro RT, la ECA de otra empresa o un Firmante de otro edificio reciben 404.
- **La comparación de la ECA es exacta** (sin distinguir sólo por espacios): «Conservación Porteña S.R.L.» y «CONSERVACIÓN PORTEÑA S.R.L.» son ECA distintas, igual que en el resto del Portal.
- **La imagen sigue viajando una vez de ida** (del celular al servidor, al cargar el reporte). Reducirla antes de enviarla, como hace el chat, es del lado del celular y no se tocó.
- **Las pruebas con la base real** tardan en arrancar en frío: con el límite de 5 segundos de Jest para el arranque pueden fallar la primera vez; con `--testTimeout=120000` pasan (el script ya lo usa).

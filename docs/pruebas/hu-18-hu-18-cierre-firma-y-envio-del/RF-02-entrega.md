# HU-18 · RF-02 · Entrega — El informe cerrado exige y sella las fotos obligatorias de cada equipo en uso

- **Tarea:** HU-18 / RF-02 — `REQ-1795480710378`
- **Script:** [RF-02-entrega.sh](RF-02-entrega.sh) · **Guía (por API):** [RF-02-fotos-obligatorias-del-informe.md](RF-02-fotos-obligatorias-del-informe.md)
- **Archivos cambiados:** [`informes.types.ts`](../../../apps/api/src/informes/informes.types.ts) (las claves y las etiquetas), [`informes.logic.ts`](../../../apps/api/src/informes/informes.logic.ts) (la validación), el helper de pruebas nuevo [`fotos-obligatorias.ts`](../../../apps/api/test/fotos-obligatorias.ts) y las pruebas `informes.spec.ts`, `informes-sellado.spec.ts`, `informes-idempotencia.spec.ts`, `informes.e2e-spec.ts` e `informes.int-spec.ts`. Los tres scripts de entrega de HU-18 que arman informes (RF-01, RNF-01, RNF-02) ahora mandan las fotos.
- **Es parte de:** la decisión de producto del 23/11/2026 de pedir las fotos del frente y de cables en toda visita, para que quede más auditada. La parte del celular es HU-17 RF-11 (PR #109) y que el Portal no pida cables a un hidráulico es HU-08 RF-08.
- **Depende de:** HU-17 RF-11. Esta tarea se mergea **después**.

## 1. Qué quedó implementado

Hasta ahora la API aceptaba un informe sin ninguna foto. Para que la auditoría no dependa de que el celular lo haga bien (una versión vieja de la app, un envío armado a mano), `POST /api/informes-visita` controla ahora las fotos obligatorias de **cada equipo en uso**:

- **Tracción y montavehículos:** la foto del frente de cabina y botonera (`obligatoria:frente`) y la de los cables de tracción (`obligatoria:cables`).
- **Hidráulico:** sólo la del frente, porque no tiene cables de tracción.
- **Fuera de servicio:** ninguna; lleva su reporte de parada con fotos.
- Cada foto tiene que ser una **imagen** (data URL jpeg, png o webp) de hasta **2.000.000 caracteres**.
- Si falta alguna o no es una imagen, responde **400 «Datos inválidos»** con un mensaje por foto que **nombra el equipo y la foto** («El equipo M1 (equipos[0]) no trae la foto de frente de cabina y botonera (obligatoria:frente)…») y **no guarda nada**. Con varios equipos, cada uno dice lo suyo.
- Las fotos viajan en `fotos` de cada equipo, así que **ya forman parte del contenido sellado**: no hizo falta tocar el cálculo del hash. Cambiar una foto después de cerrado hace que la verificación dé `coincide: false`.
- **La regla se aplica sólo al cerrar.** Un informe guardado antes de esta tarea, sin fotos obligatorias, se sigue leyendo, listando y verificando.

## 2. Cómo se levanta y se prueba

```bash
npm run db:up && npm run dev
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
bash docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RF-02-entrega.sh
bash docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RF-02-entrega.sh --carga 50
npm run test:int -w apps/api            # la prueba contra PostgreSQL real
```

## 3. Qué datos hacen falta

Los de demo de HU-04 RF-02 (`demo.admin` y `demo.secretaria`). El script crea un RT y un edificio temporales y los borra al terminar, con sus informes.

## 4. Qué endpoints o pantallas toca

`POST /api/informes-visita` (ahora valida las fotos obligatorias). No cambia ninguna pantalla: la del RT que las hace sacar es HU-17 RF-11. Si la web llegara a enviar un informe sin ellas, mostraría el mensaje de la API en el cierre de la visita.

## 5. Cómo se corre integrado

Resultado del 23/11/2026:

| Condición | Resultado |
|---|---|
| 1. Equipo en uso sin la foto del frente → 400 que nombra el equipo y la foto, sin guardar nada | «El equipo M1 (equipos[0]) no trae la foto de frente de cabina y botonera (obligatoria:frente)…»; 0 filas nuevas en la base |
| 2. Tracción o montavehículos sin cables → 400; hidráulico sin cables → se acepta | Tracción con frente y sin cables → 400 sólo por cables; montavehículos → 400; hidráulico con el frente → 201; hidráulico sin el frente → 400 |
| 3. Foto que no es una imagen o de más de 2 MB → 400 con el mensaje | Texto, `text/html`, `image/gif`, data URL vacía o rota, sin `dataUrl` → 400; 2.000.000 caracteres → 201; 2.000.001 → 400 |
| 4. Equipo fuera de servicio sin fotos → se acepta | 201 |
| 5. Las fotos están en el sello y alterarlas se detecta | Hash SHA-256 recalculado por fuera con otro programa = el de la API; verificación `coincide: true`; cambiando la foto del frente en la base, `coincide: false` |
| 6. Informes anteriores, y pruebas y scripts en verde | Un informe sin fotos obligatorias ya guardado se lee, se lista y se verifica. `npm run verify`: tipos bien, API **1278/1278** (28 nuevas), web 621/621. `test:int` de informes: 23/23 (3 nuevas) |

`RF-02-entrega.sh`: **23 ok, 0 con error.** Los scripts anteriores de HU-18, ya con fotos: RF-01 **24 ok**, RNF-01 **18 ok**, RNF-02 **15 ok**.

`RF-02-entrega.sh --carga 50`: 50 informes válidos (201) y 50 rechazados (400), **0 respuestas inesperadas**. Válidos: promedio 41 ms, p95 62 ms, máx 83 ms. Rechazados: promedio 12 ms, p95 14 ms, máx 37 ms. Se midió contra la API local con curl (casi todo el tiempo de los válidos es guardar y sellar el informe).

## 6. Qué quedó afuera y qué se asumió

- **La decisión es de German (23/11/2026) y falta confirmarla con MAICON.** HU-17 RF-05 había dejado pendiente de MAICON si estas fotos son siempre obligatorias. La regla está en `informes.types.ts` e `informes.logic.ts`.
- **Hay que mergearla después de HU-17 RF-11.** Con sólo este cambio en `dev`, la pantalla actual del RT no hace sacar las fotos y no podría cerrar ningún informe. Mientras RF-11 no esté mergeado, `dev` queda con la app y la API desincronizadas.
- **La API controla que haya una imagen, no que sea del frente o de los cables.** Una foto cualquiera con la clave correcta pasa; la evidencia está en que queda sellada y no se puede cambiar.
- **Un hidráulico que manda la foto de cables** (la sacó antes de cambiar el tipo) la API se la acepta y se la guarda, sin exigirla.
- **Los datos de prueba cambiaron:** los equipos de las pruebas de la API (`informes*.spec.ts`, e2e e int) y de los scripts de HU-18 llevan las dos fotos mínimas. Hay un helper, `apps/api/test/fotos-obligatorias.ts`, que escribe las claves a mano, a propósito: si cambian en la API, las pruebas se enteran.
- **Los informes ya guardados no se tocan ni se vuelven a validar.** No se hizo ninguna migración de datos.
- **Las pruebas de integración tardan en arrancar:** con la API de desarrollo y Vite prendidos, la primera corrida de `test:int` se pasó de los 5 segundos que Jest da por defecto al `beforeAll` y falló; con `--testTimeout=120000` pasó entera. No es un problema de esta tarea.

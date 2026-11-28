# HU-19 · RF-11 · Entrega — [FIX] chat-hilo.e2e-spec carga los 205 mensajes directo en el repositorio y no se pasa del tope con la máquina ocupada

- **Tarea:** HU-19 / RF-11 — `REQ-1795876195557`
- **Rama:** `feature/hu-19-hu-19-chat-interno-entre-opera/req-1795876195557-fix-chat-hilo-e2e-spec-carga-los-205-men`
- **Script:** [RF-11-entrega.sh](RF-11-entrega.sh) · **De dónde sale:** [docs/decisiones/2026-11-28-pruebas-intermitentes/README.md](../../decisiones/2026-11-28-pruebas-intermitentes/README.md)
- **No tiene pantalla:** es una prueba automática de la API. No cambia nada de `apps/api/src`, ni la configuración de Jest.

## 1. Qué quedó implementado

Un solo archivo: [apps/api/test/chat-hilo.e2e-spec.ts](../../../apps/api/test/chat-hilo.e2e-spec.ts).

- **Antes:** para pasar el límite de 200 del hilo, las dos pruebas de 205 mensajes los escribían **uno por uno por HTTP** (205 pedidos seguidos con sesión). Con la máquina libre tardaban 1,3 a 1,6 s y, con la máquina ocupada, se pasaban de los 5 s que Jest da por defecto.
- **Ahora:** esos 205 mensajes se cargan con `ChatRepository.guardarMensaje` (el repositorio en memoria de la misma aplicación que levanta la prueba, con el id del RT de la sesión de prueba), y **se leen por HTTP con la sesión del Firmante**, como antes. Lo que se prueba es la lectura del hilo; escribir por HTTP ya lo prueban `chat.e2e-spec.ts` y `chat-validacion.e2e-spec.ts`.
- **No cambian** las aserciones (los 200 más nuevos, `X-Hay-Anteriores`, los 5 anteriores con el id del más viejo), ni las otras cuatro pruebas (3 y 20 mensajes siguen escribiéndose por HTTP: son baratas), ni el título de ninguna prueba.
- **No se sube ningún tope** (`jest.setTimeout`, `testTimeout`) **ni se agregan reintentos.**

## 2. Cómo se levanta y se prueba

```bash
cd apps/api && npx jest chat-hilo.e2e-spec --verbose     # dentro de apps/api: desde la raíz con --rootDir no encuentra los *.e2e-spec
bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-11-entrega.sh
```

## 3. Qué datos hacen falta

Ninguno: la prueba levanta la API con repositorios en memoria. No necesita Docker.

## 4. Qué endpoints o pantallas toca

Sólo `GET /api/chat/mensajes` (lectura del hilo). Ningún endpoint cambia.

## 5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-11-entrega.sh              # 12 comprobaciones
bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-11-entrega.sh --carga 20   # + 20 corridas
bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-11-entrega.sh --estres     # + la suite completa con la máquina ocupada (~8 min)
```

Medido el 28/11/2026, en la misma PC:

| Qué | Antes | Ahora |
|---|---|---|
| «con más de 200 mensajes responde los 200 más nuevos…» (máquina libre, 3 corridas) | 1491 · 1495 · 1594 ms | 325 · 298 · 304 ms |
| «con el id del más viejo que se ve, trae los anteriores…» (máquina libre, 3 corridas) | 1279 · 1336 · 1309 ms | 154 · 162 · 141 ms |
| La prueba más lenta de `chat-hilo.e2e-spec` en 10 corridas más | — | p95 398 ms · peor 398 ms · 0 fallos |
| Suite completa de la API con 8 procesos usando CPU (`estres-suite-api.sh`) | `chat-hilo.e2e-spec` fallaba con «Exceeded timeout of 5000 ms» (README de la decisión) | **1693 de 1693 pruebas bien, 0 «Exceeded timeout», `chat-hilo.e2e-spec` en PASS**; tardó 469 s |

El tiempo de la primera prueba (~300 ms) incluye levantar la aplicación y crear las sesiones, que se hace antes de cada prueba.

**Picos sueltos, sin explicar:** la prueba más lenta de cada corrida casi siempre está entre 280 y 410 ms, pero aparecieron picos: en una corrida de `--carga 5` hecha justo después de otro script pesado (un recorrido de Playwright) dio **1002 ms**, apenas sobre el límite de 1 s del script, y en otra tanda de 10 corridas el peor fue **849 ms**. No se identificó la causa (otros procesos de la PC, el antivirus o la sincronización de OneDrive son sospechas sin comprobar). En las otras tandas (15, 10 y 3 corridas) el máximo fue 392, 398 y 376 ms. Es un pico cada unas 40 corridas y queda a 5 veces del tope de 5 s de Jest, así que no es el «Exceeded timeout» que se quería evitar; el límite de 1 s del script se deja como está, en vez de aflojarlo para que pase: un pico que lo supere va a verse como error.

| Condición de aprobación | ¿Cubierta? | Cómo se comprobó |
|---|---|---|
| 1. Con la máquina libre, cada prueba de `chat-hilo.e2e-spec` tarda menos de 1 s | Sí | Script paso 3 (3 corridas, la más lenta 376 ms) y `--carga` (peor 398 ms) |
| 2. Con la máquina ocupada, la suite completa no falla `chat-hilo.e2e-spec` por «Exceeded timeout» | Sí, una corrida | Script `--estres`: suite completa 1693/1693, 0 «Exceeded timeout» |
| 3. La prueba comprueba lo mismo que antes | Sí | Script pasos 1 y 4: las mismas aserciones y los mismos 6 `it`/`it.each` que `dev`; con 204 mensajes en vez de 205 las dos pruebas del límite **fallan** |
| 4. No se sube ningún tope, no hay reintentos y no se quita ninguna prueba | Sí | Script paso 2: ningún `setTimeout`/`testTimeout`/reintento; de `apps/` sólo cambia este archivo; el envío por HTTP sigue en `chat.e2e-spec` y `chat-validacion.e2e-spec` |

## 6. Qué quedó afuera y qué se asumió

- **La corrida bajo carga es una sola** (469 s). Que no haya fallado no demuestra que no pueda fallar: demuestra que ya no depende de 205 pedidos seguidos (de 1,3-1,6 s a 0,15-0,3 s por prueba, contra un tope de 5 s). La corrida no mide cuánto tardó `chat-hilo.e2e-spec` por prueba bajo la carga, sólo que pasó.
- **No se probó contra PostgreSQL:** la prueba usa el repositorio en memoria, como antes. El hilo contra la base real lo cubre `chat-hilo.int-spec.ts`, que no se tocó y que esta entrega no volvió a correr.
- **RNF-03 (`informes.e2e-spec`) no se resuelve acá:** sigue bloqueada porque no se reproduce, ni con esta suite completa bajo carga (ver el README de la decisión).
- **Uso de `guardarMensaje`:** el repositorio en memoria guarda el emisor con nombre y usuario de prueba; la prueba sólo lee `contenido`, por eso no importa.

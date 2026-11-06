# HU-01 · RNF-02 · Entrega — Evitar que las pruebas de integración fallen al correr en paralelo

- **Tarea:** HU-01 / RNF-02 — `REQ-1794000103321`
- **Rama:** `feature/hu-01-hu-01-gestion-y-alta-de-eca-y/req-1794000103321-evitar-que-las-pruebas-de-integracion-fa`
- **Depende de:** HU-01 / RNF-01 (`REQ-1793979090598`), ya certificada
- **Script del flujo integrado:** [RNF-02-entrega.sh](RNF-02-entrega.sh)
- **Guía visual:** no corresponde. La tarea no tiene pantallas: la evidencia es la salida de las corridas.

## 1. Qué quedó implementado

`npm run test:int` ahora corre los archivos de integración de a uno, con `maxWorkers: 1` en `apps/api/jest.int.config.js`. Todos comparten la misma base, y en paralelo el test de RNF-01 contaba filas que estaba escribiendo otro archivo.

No cambia código de la app. La opción está en la configuración, así que también aplica a una corrida directa con `npx jest --config jest.int.config.js`.

## 2. Cómo se levanta y se prueba

```bash
npm install
npm run db:up
bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RNF-02-entrega.sh
```

## 3. Qué datos hacen falta

Ninguno. Hace falta el contenedor `mant-asc-db` corriendo, porque el script lee los totales de filas con `docker exec`.

## 4. Qué endpoints o pantallas toca

Ninguno. Sólo cambia la configuración de Jest para integración.

## 5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RNF-02-entrega.sh             # 5 corridas
bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RNF-02-entrega.sh --carga 20  # 20 corridas
```

Resultado medido el 06/11/2026 sobre `dev` con este cambio:

| Medición | Antes | Después |
|---|---|---|
| Corridas de `npm run test:int` con fallas | 3 de 6 (16 tests por corrida) | 0 de 8 (21 tests por corrida) |
| Filas `consorcios`/`maquinas` antes y después | 0/0 y 0/0 | 0/0 y 0/0 |
| Duración promedio de la corrida | No medida | 12,4 s (la más lenta: 14,1 s) |

`npm run verify` sigue en verde: tipos OK, API 144/144, web 49/49.

| Condición de aprobación | ¿Cubierta? | Cómo se prueba |
|---|---|---|
| 1. Cinco corridas seguidas de `npm run test:int` terminan en verde | Sí | `RNF-02-entrega.sh` |
| 2. La corrida deja `consorcios` y `maquinas` con las mismas filas | Sí | `RNF-02-entrega.sh`, que compara los totales |

## 6. Qué quedó afuera y qué se asumió

- **No se tocó `texto-invalido.int-spec.ts`:** su conteo global sigue ahí y funciona porque ahora nada escribe en simultáneo. Si alguien usa la base mientras corre la suite, puede volver a fallar. Las pruebas de integración necesitan una base sin otro uso.
- **La suite ya no corre en paralelo:** no se midió la duración anterior, así que no hay una cifra del costo de este cambio.
- **Las pruebas de integración siguen usando la base de desarrollo,** no una propia.
- **Una corrida en verde en 8 no demuestra por sí sola que no pueda fallar:** el respaldo es la causa identificada. Las fallas eran conteos globales pisados por otros archivos, y ahora esos archivos no se solapan.
- **El documento de HU-02 / RF-01 sigue indicando `--runInBand`:** funciona igual y ya no hace falta. No se editó porque es de otra Tarea.
- **Regresión:** la tarea no tiene módulo. Corrió la integración completa y `npm run verify`.

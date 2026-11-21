# HU-06 · RF-08 · Entrega — Los informes de falla crítica y el estado del ascensor se guardan en PostgreSQL

- **Tarea:** HU-06 / RF-08 — `REQ-1795263641766`
- **Script:** [RF-08-entrega.sh](RF-08-entrega.sh), con un reinicio real de la API en el medio
- **Archivos cambiados:** [`fallas-criticas.repository.ts`](../../../apps/api/src/fallas-criticas/fallas-criticas.repository.ts) (nuevo), [`fallas-criticas.service.ts`](../../../apps/api/src/fallas-criticas/fallas-criticas.service.ts), [`app.module.ts`](../../../apps/api/src/app.module.ts), la migración `037_informes_falla`, y las pruebas nuevas [`fallas-persistencia.e2e-spec.ts`](../../../apps/api/test/fallas-persistencia.e2e-spec.ts) y [`fallas-persistencia.int-spec.ts`](../../../apps/api/test/fallas-persistencia.int-spec.ts)
- **Depende de HU-11 RF-12, RF-11 y HU-17 RF-09 (PR #103, #104 y #105):** esta rama los incluye. El estado del ascensor (criterio 3) lo guarda HU-17 RF-09, y el aviso a la ECA, HU-11 RF-11.

## 1. Qué quedó implementado

Los informes de falla crítica que manda el RT vivían en la memoria de `FallasCriticasService`, igual que su `clientReportId` (lo que evita duplicados cuando el celular reintenta) y quién abrió cada alerta. Un reinicio borraba todo eso: la alerta desaparecía del panel de la Secretaría y del Firmante, y un reintento del celular se tomaba como un informe nuevo, con alarma y aviso nuevos.

**Ahora:**

- Cada informe se guarda en la tabla **`informes_falla`**, con su `clientReportId` (único en la base) y quién abrió la alerta primero.
- **Al arrancar**, la API carga los informes **sin volver a emitir sus eventos**. Lo que ya sonó y ya se avisó no se repite. El aviso a la ECA sigue en la bandeja porque se guarda aparte (HU-11 RF-11).
- **El reintento del celular**, con el mismo `clientReportId`, devuelve el informe que ya estaba, sin alarma ni aviso nuevos, también después de un reinicio.
- **El estado del ascensor**, que marca el RT y confirma o rechaza el Firmante, son los reportes de parada que ya guarda HU-17 RF-09, incluido en esta rama.
- **Quién ve qué no cambia:** la Secretaría ve todas las alertas; el Firmante, las de sus edificios; el RT no ve el panel.
- **RLS:** la tabla sólo tiene política para la Secretaría y el Administrador. La aplicación no puede borrar informes.
- El guardado es en orden y en segundo plano, porque `registrarInforme` sigue siendo síncrono, como lo usan sus pruebas. Si la base no responde, el informe queda en memoria, la alarma suena igual y el error queda en el registro.

## 2. Cómo se levanta y se prueba

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh   # si no están los datos de demo
bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-08-entrega.sh       # o con --carga 30
```

El script compila la API y la levanta aparte. Un RT temporal informa una falla en la M1 de «DEMO Corrientes 100» y marca el equipo «Fuera de Servicio», y `demo.firmante` lo confirma. Después **apaga el proceso de la API y lo vuelve a arrancar**, y comprueba todo. Al terminar borra el RT y los datos de prueba.

## 3. Qué datos hacen falta

Los datos de demo de HU-04 RF-02, con `demo.firmante` y `demo.eca` (HU-14 RF-03).

## 4. Qué endpoints o pantallas toca

Ningún endpoint cambia de forma. `POST /api/fallas-criticas/informes`, `GET /api/fallas-criticas/informes`, `POST /api/fallas-criticas/informes/:id/abrir` y `GET /api/fallas-criticas/informes/:id` siguen igual, pero ahora sobreviven a un reinicio.

## 5. Cómo se corre integrado

Resultado del 21/11/2026, con la API compilada y PostgreSQL 16 + PostGIS 3.4.3:

| Condición | Resultado |
|---|---|
| 1. Después de reiniciar, el informe y la alerta siguen visibles para la Secretaría, el Firmante y la ECA | La Secretaría y `demo.firmante` siguen viendo la alerta, el informe se abre y su aviso a la ECA sigue en la bandeja |
| 2. El reintento con el mismo clientId después del reinicio no duplica ni vuelve a avisar | Mismo informe, `eventoEmitido: false` y un solo aviso. Con `--carga 30`, sigue habiendo un informe y un aviso |
| 3. El estado del ascensor y su confirmación se mantienen | «Fuera de Servicio», confirmado por el Firmante, sigue igual |
| 4. Un RT sólo ve sus informes y la ECA los de sus edificios, como antes | El RT sigue sin ver el panel (403); un Firmante que no es del edificio no ve la alerta ni la abre (403) |
| 5. Pruebas existentes en verde e integración con la base real | Fallas críticas 14/14 (incluye `fallas-persistencia.e2e-spec` 7/7) y `fallas-persistencia.int-spec` 1/1 |

- `RF-08-entrega.sh --carga 30`: 12 ok, 0 con error.
- `npm run verify`: API 1250/1250 y web 616/616. Integración: 197/197.

## Supuestos y límites

- **La ECA ve la falla por el aviso** (WhatsApp, correo y enlace, después de que la Secretaría lo aprueba), igual que antes. El Portal ECA no lista informes de falla del RT: muestra las alertas propias de cada máquina. Esta Tarea no cambia eso.
- Si la API se corta en el mismo instante en que llega un informe, la escritura en curso se puede perder. El RT ya recibió la respuesta, y su reintento lo vuelve a registrar.
- La prueba de integración de avisos (HU-11 RF-11) ahora también borra los informes que crea.

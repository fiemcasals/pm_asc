# HU-17 · RF-09 · Entrega — Los reportes de parada se guardan en PostgreSQL

- **Tarea:** HU-17 / RF-09 — `REQ-1795263643334`
- **Script:** [RF-09-entrega.sh](RF-09-entrega.sh), con un reinicio real de la API en el medio
- **Archivos cambiados:**
  - API: [`paradas.repository.ts`](../../../apps/api/src/paradas/paradas.repository.ts) (nuevo), [`paradas.service.ts`](../../../apps/api/src/paradas/paradas.service.ts), [`paradas.types.ts`](../../../apps/api/src/paradas/paradas.types.ts), [`paradas.controller.ts`](../../../apps/api/src/paradas/paradas.controller.ts), [`firmante.service.ts`](../../../apps/api/src/firmante/firmante.service.ts) y la migración `036_reportes_parada`.
  - Web: [`usoEquipo.ts`](../../../apps/web/src/checklist/usoEquipo.ts) e [`InspeccionCampoView.tsx`](../../../apps/web/src/checklist/InspeccionCampoView.tsx).
  - Pruebas nuevas: [`paradas-persistencia.e2e-spec.ts`](../../../apps/api/test/paradas-persistencia.e2e-spec.ts) y [`paradas-persistencia.int-spec.ts`](../../../apps/api/test/paradas-persistencia.int-spec.ts).
- **Depende de HU-11 RF-12 y RF-11 (PR #103 y #104):** esta rama los incluye, por el orden de las migraciones (`034`, `035` y `036`).

## 1. Qué quedó implementado

Los reportes de parada que carga el RT («Fuera de Servicio» o «Reparación Urgente», con causa y fotos) vivían en la memoria de `ParadasService` y se perdían con cada reinicio. Con ellos se perdía también el estado del equipo, que es lo que ven la ECA, el Monitoreo y la ficha.

**Ahora:**

- Cada reporte se guarda en la tabla **`reportes_parada`**: al cargarse, cuando el Firmante lo confirma o lo rechaza, y cuando una nueva inspección devuelve el equipo a «Normal».
- **Al arrancar**, la API carga los reportes y le vuelve a poner a cada equipo el estado que corresponde a su último reporte: pendiente, confirmado, rechazado o vuelto a «Normal». Las máquinas de los edificios con terna se crean al arrancar, en otro servicio. Por eso `FirmanteService` ahora avisa cada vez que agrega una máquina, y la máquina recibe su estado sin importar qué servicio arranque primero.
- **El reintento del celular no duplica.**
  - El celular genera un `clientReportId` por borrador y manda el mismo si reintenta.
  - La API devuelve el reporte que ya tenía, también después de un reinicio.
  - La base garantiza un solo reporte por `clientReportId`.
- **Un reporte o una decisión sólo se dan por hechos si quedaron guardados.** Si la base no responde, la API contesta 500 y el equipo y el reporte quedan como estaban. Se puede reintentar.
- **RLS:** la tabla sólo tiene política para la Secretaría y el Administrador. Quién ve qué lo sigue decidiendo `ParadasService`: el Firmante ve sólo lo de sus edificios. La aplicación no puede borrar reportes.

## 2. Cómo se levanta y se prueba

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh   # si no están los datos de demo
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-09-entrega.sh       # o con --carga 20
```

El script compila la API y la levanta aparte (no hace falta `npm run dev`). Crea un RT temporal, que reporta la M1 de «DEMO Cabildo 1540». Después **apaga el proceso de la API y lo vuelve a arrancar**, y comprueba lo que ven `demo.secretaria`, `demo.firmante` y `demo.eca`. Al terminar borra el RT y los reportes de prueba.

## 3. Qué datos hacen falta

Los datos de demo de HU-04 RF-02, con `demo.firmante` y `demo.eca` (HU-14 RF-03).

## 4. Qué endpoints o pantallas toca

- `POST /api/paradas` acepta un `clientReportId` opcional. Si ya recibió ese reporte, devuelve el mismo.
- `GET /api/paradas`, `POST /api/paradas/:id/confirmar` y `rechazar`, y `POST /api/paradas/maquinas/:id/normalizar` siguen igual, pero ahora sobreviven a un reinicio.
- En pantalla: la Inspección Técnica del RT manda el `clientReportId` con el reporte de parada.

## 5. Cómo se corre integrado

Resultado del 21/11/2026, con la API compilada y PostgreSQL 16 + PostGIS 3.4.3:

| Condición | Resultado |
|---|---|
| 1. Después de reiniciar, el reporte sigue visible para el Firmante, la Secretaría y la ECA | La Secretaría y `demo.firmante` siguen viendo el reporte, y `demo.eca` sigue viendo el equipo «Fuera de Servicio» |
| 2. El reintento del celular después del reinicio no duplica | El reintento devuelve el mismo reporte. Con `--carga 20`, 20 reintentos más y sigue habiendo una sola fila |
| 3. Las pruebas de paradas en verde y una de integración con la base real | Pruebas de paradas 31/31 (incluye `paradas-persistencia.e2e-spec` 7/7) y `paradas-persistencia.int-spec` 1/1 |

- `RF-09-entrega.sh --carga 20`: 11 ok, 0 con error.
- `npm run verify`: API 1243/1243 y web 616/616. Integración: 196/196.

## Supuestos y límites

- Las fotos del reporte no se guardan: el reporte guarda cuántas fotos tenía, igual que antes. Guardar las imágenes sería otra Tarea.
- Las máquinas de ejemplo («MAQ-…», de HU-08 RF-06) también recuperan su estado. Pero el Portal ECA, con la API real, muestra sólo las máquinas de los edificios con terna. Por eso el script usa una de «DEMO Cabildo 1540».
- Las pruebas unitarias de paradas (`paradas.spec.ts` y `estado-ascensor.spec.ts`) pasaron a esperar al servicio (`await`), porque ahora guarda antes de responder.

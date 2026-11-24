# HU-08 / RF-07 · El informe cerrado por el RT crea la visita en el Portal Firmante

- **Tarea:** HU-08 / RF-07 — `REQ-1795266849123`
- **Script:** [RF-07-entrega.sh](RF-07-entrega.sh) (con soporte `--carga 25`)
- **Qué resuelve:** Conecta el informe consolidado y cerrado por el RT en la app móvil (HU-18) con el Portal Firmante (HU-08). Cada equipo del informe cerrado pasa a ser la visita de su máquina en el mes en curso, con sus fotos obligatorias y la firma del encargado o su marca de revisión si fue cerrado «Sin firma».

## Qué cambió

| Qué | Dónde queda |
|---|---|
| Sincronización automática de informe cerrado | `InformesService.crearIdempotente` invoca `sincronizarConPortalFirmante(informe)` |
| Registro de visita de máquina en consorcio | `FirmanteService.registrarVisita(maquinaId, visita, estado)` |
| Manejo de «Sin firma» y revisión | `VisitaInspeccion.requiereRevision` y `sinFirma: true` |
| Soporte de equipo fuera de servicio | Si el equipo queda fuera de servicio, permanece en `Pendiente de Visita` / Advertencia |
| Idempotencia y protección de autorizaciones | Reenvíos con el mismo `clientReportId` no alteran visitas ya autorizadas (`autorizada: true`) |
| Persistencia en base de datos real | Tabla `firma_visitas` almacena la visita para sobrevivir reinicios de API |

## Criterios de Aceptación verificados

1. **Criterio 1: Máquina como «Recorrida» con fotos y firma**
   Al cerrar el informe de un edificio con terna, el Firmante ve la máquina en estado `Recorrida` con las fotos obligatorias del frente (y cables si es tracción) y la firma del encargado.
2. **Criterio 2: Cierre «Sin firma» con marca de revisión**
   Si el informe se cerró con «Sin firma» y motivo, la máquina queda marcada con `requiereRevision: true` y no permite autorizarse hasta contar con firma o subsanación.
3. **Criterio 3: Equipo fuera de servicio**
   Si un equipo quedó fuera de servicio en el informe, no se marca como recorrida sino que figura con estado `Pendiente de Visita` / `Advertencia` para inspección técnica.
4. **Criterio 4: Idempotencia en reenvío**
   Si se reenvía el mismo informe con idéntico `clientReportId`, responde HTTP 200 y no duplica la visita ni sobreescribe una autorización existente.
5. **Criterio 5: Persistencia post-reinicio**
   La visita creada en PostgreSQL sobrevive al reinicio de la API y el Firmante la sigue viendo en su panel.

## Cómo se probó

| Prueba | Resultado |
|---|---|
| `test/informe-firmante.e2e-spec.ts` (suite E2E completa para RF-07, 5 criterios) | 5/5 passed |
| `test/informes.int-spec.ts` (PostgreSQL real: criterios 1 y 5 con persistencia) | 25/25 passed |
| `npm run typecheck` (apps/api y apps/web) | OK, 0 errores |
| `npx vitest run src/firmante` (pruebas de frontend del firmante) | 48/48 passed |
| `RF-07-entrega.sh --carga 25` | 25 recorridos, 0 fallas · promedio 3 ms · p95 4 ms · máx 9 ms |

## Ejecución del script de entrega

```bash
bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-07-entrega.sh
bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-07-entrega.sh --carga 25
```

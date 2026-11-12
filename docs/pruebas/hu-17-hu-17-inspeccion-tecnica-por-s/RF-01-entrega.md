# HU-17 · RF-01 · Entrega — Motor del checklist configurable

- **Tarea:** HU-17 / RF-01 — `REQ-1794494000545`
- **Rama:** `feature/hu-17-hu-17-inspeccion-tecnica-por-s/req-1794494000545-motor-del-checklist-configurable`
- **Depende de:** `RO-01 RF-01` (ya integrado en `dev`) y `HU-06 RF-03` (en `to_do`; el motor sincroniza 1 a 1 sus 14 códigos críticos y 8 fallas comunes no críticas para evitar bloqueo)
- **Script del flujo integrado:** [RF-01-entrega.sh](RF-01-entrega.sh)
- **Guía visual:** no corresponde. Esta tarea provee el modelo versionado y los endpoints de API; la renderización de las solapas corresponde a **HU-17 / RF-04**.

## 1. Qué quedó implementado

1. **Configuración declarativa versionada (`apps/api/src/checklist/checklist.config.ts`)**:
   - `CHECKLIST_VERSION = '2026.11.1'` con 5 solapas (`Sala de Máquinas`, `Cabina`, `Accesos`, `Caja`, `Fosa`), sus subgrupos e ítems parametrizados por `tiposAplicables` (`traccion`, `hidraulico`, `montavehiculos`).
   - Cada opción declara explícitamente `{ id, etiqueta, esFalla, esFallaCritica, fotoObligatoria, codigoFallaCritica? }`.
   - `requiereFotoChecklist(opcion, estadoEquipo)`: exige fotografía si `esFallaCritica === true`, si `fotoObligatoria === true` o si el equipo está en estado `fuera_de_servicio`.
   - Filtrado por tipo (`obtenerChecklistParaTipo`): al elegir `hidraulico`, excluye ítems exclusivos de tracción (`cables_traccion`, `extension_cables`, `poleas_traccion`) e incluye `"Aceite de batea"` (`aceite_batea`).
   - Alineación 1 a 1 con `HU-06 RF-03`: expone exactamente los 14 códigos críticos (`CABLES_DESGASTADOS`, `LIMITADOR_ANULADO`, `ACEITE_BATEA_INSUFICIENTE`, `CORTE_FUERZA_MOTRIZ_NO_ACTUA`, `BOTON_PARE_FALLA`, `PARACAIDAS_ANOMALIA`, `DESTRABE_MANUAL_TRABADO_INEXISTENTE`, `CERRADURA_NO_TRABA`, `CONTACTO_ELECTRICO_PUENTEADO_FALLA`, `ESPACIO_ENTRE_PUERTAS_MAYOR_12CM`, `INSTALACIONES_AJENAS_SI`, `ESPACIOS_CON_ABERTURAS`, `LIMITES_FALLAN_ANULADOS`, `STOP_FOSA_DEFICIENTE_INEXISTENTE`) y clasifica como fallas comunes (`esFalla: true, esFallaCritica: false`) los 8 ítems no críticos de esa definición.
2. **Persistencia versionada (`010_checklist_inspecciones` en PostgreSQL + `ChecklistService` / `ChecklistController`)**:
   - `GET /api/checklist/config?tipo=traccion|hidraulico|montavehiculos` → devuelve la configuración filtrada junto a `version`.
   - `POST /api/checklist/inspecciones` y `GET /api/checklist/inspecciones/:id` → persisten `version_checklist` en la tabla `inspecciones_checklist` para preservar la trazabilidad histórica ante futuros cambios del motor.

## 2. Cómo se levanta y se prueba

```bash
npm run db:up          # PostgreSQL + PostGIS en 127.0.0.1:5433
npm run dev            # API :3050 (migra 010_checklist_inspecciones al arrancar) + Web https://localhost:8050
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-01-entrega.sh
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-01-entrega.sh --carga 20
```

### Pruebas automatizadas

| Comando | Resultado |
|---|---|
| `npm run verify` | API: 24 suites / 178 tests OK · Web: 7 archivos / 82 tests OK · Typecheck 0 errores |
| `npm run test:int -w apps/api` | 7 suites / 25 tests OK (`inspecciones_checklist` + `schema_migrations` contra PostGIS real) |
| `RF-01-entrega.sh` | Verificado en entorno vivo contra API/Web |

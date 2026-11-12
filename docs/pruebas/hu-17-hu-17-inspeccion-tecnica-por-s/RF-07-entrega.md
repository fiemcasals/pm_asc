# Entrega — HU-17 RF-07 (`REQ-1794494001754`) · Navegación por Estaciones y Sala Compartida

## Alcance implementado
- `apps/web/src/checklist/navegacion.ts`: `aplicarRespuestaConSalaCompartida`, `esItemEntornoSala`, `obtenerSiguienteSolapa` y `obtenerSolapaAnterior`.
- `apps/web/src/checklist/ChecklistSolapaView.tsx` + `InspeccionCampoView.tsx`: barra de equipos (`M1`, `M2`, `M3`) dentro de cada solapa preservando el estado completo por máquina, sincronización automática de ítems `esEntornoSala` entre máquinas de la misma `salaCompartidaId`, y navegación de estación con `"Ir a Accesos/Cabinas →"`.
- `apps/web/src/App.tsx` + `ui/command.ts`: integración de sesión autenticada (`HU-14` desde `dev`) habilitando `Inspección Técnica` también para el rol `rt_calle`.
- Guía visual móvil: [RF-07-navegacion.md](RF-07-navegacion.md).

## Cómo verificar
```bash
npm.cmd run verify
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-07-entrega.sh
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-07-entrega.sh --carga 20
```

## Dependencias
- Metadatos de edificio/sala (`salaCompartidaId` desde API) pendientes de integración cuando `HU-17 RF-02 [to_do]` y `HU-01 RF-05 [pr_open]` se integren en `dev`; hasta entonces se proveen `EQUIPOS_EDIFICIO_DEMO` con `Sala Principal` compartida entre `M1`/`M2` y `M3` independiente.

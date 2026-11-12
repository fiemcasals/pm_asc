# Entrega — HU-17 RF-08 (`REQ-1794494002220`) · Las Fallas Críticas del Checklist llegan a Secretaría y Firmante

## Alcance implementado
- **API (`apps/api/src/fallas-criticas/`):**
  - `fallas-criticas.types.ts` y `fallas-criticas.service.ts`: soporte completo de los 14 códigos críticos del checklist (`obtenerFallasCriticasDefinidas()`), fotos embebidas `data:image/*;base64,...` (<= 750 KB) además de URLs `http(s)`, y deduplicación por `clientReportId` (`eventoEmitido: false` al reintentar tras caída de red).
  - `fallas-criticas.controller.ts`: nuevo `GET /api/fallas-criticas/informes` para hidratar alertas críticas recientes al abrir Secretaría o Firmante, más `renderInforme` con etiquetas de cada código del checklist.
- **Web (`apps/web/src/checklist/` y `apps/web/src/fallas/`):**
  - `fallasCriticasChecklist.ts`: recolección de fallas críticas y fotos de una solapa (incluyendo fallas por piso críticas en Accesos), armado de payload con `clientReportId`, envío en línea, encolado en IndexedDB (`cola_fallas_criticas`) sin señal y sincronización única al recuperar conexión (`online`).
  - `InspeccionCampoView.tsx` + `App.tsx`: prop `inspectorNombre={usuario.nombre}`, botón `"Guardar <Solapa>"` (`data-testid="btn-guardar-solapa"`), insignia `"Cola crítica offline: N"` y banner de estado/sincronización.
  - `fallas.ts`, `AlertaFallaCritica.tsx` y `PortalFirmante.tsx`: catálogo completo de etiquetas/códigos del checklist en `parsearEventoFalla` y escucha unificada (`GET /api/fallas-criticas/informes` + SSE) tanto en Secretaría como en Firmante.
- Guía visual móvil: [RF-08-fallas-criticas.md](RF-08-fallas-criticas.md).

## Cómo verificar
```bash
npm.cmd run verify
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-08-entrega.sh
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-08-entrega.sh --carga 20
```

## Dependencias
- En el modo campo actual, el selector de edificio utiliza `EQUIPOS_EDIFICIO_DEMO` (`firmanteMaquinaId: MAQ-CALLAO-M1`, `MAQ-CALLAO-M2`, `MAQ-CORRIENTES-M1`) hasta que se integre el selector definitivo de edificio/visita (`HU-17 RF-02 [to_do]`).

# Entrega — HU-17 RF-06 (`REQ-1794494001529`) · Fallas por Piso en Accesos

## Alcance implementado
- `apps/web/src/checklist/fallasPiso.ts`: catálogo de componentes de acceso agrupado en **Seguridad Crítica** (con `"Espacio entre puertas mayor a 12 cm"`), **Mecánica de Puerta** y **Llamadores**, lista de pisos del edificio y operaciones inmutables (`crearFallaPiso`, `agregarFallaPiso`, `eliminarFallaPiso`).
- `apps/web/src/checklist/InspeccionCampoView.tsx`: sección **Fallas por Piso en Accesos** dentro de la solapa `accesos` con botón `"+ Agregar Falla en un Piso"`, selector de piso y componente, múltiples registros por piso, adjunto opcional de foto comprimida y botón **Eliminar** por fila.
- `apps/web/src/checklist/checklist.test.ts`: pruebas unitarias de catálogo y alta/baja múltiple por piso.
- Guía visual móvil: [RF-06-fallas-piso.md](RF-06-fallas-piso.md).

## Cómo verificar
```bash
npm.cmd run verify
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-06-entrega.sh
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-06-entrega.sh --carga 20
```

## Dependencias
- Lista dinámica de pisos por edificio cargada provisoriamente con `PISOS_EDIFICIO_DEFAULT` hasta completar `HU-17 RF-02 [to_do]` / `HU-17 RF-07`.

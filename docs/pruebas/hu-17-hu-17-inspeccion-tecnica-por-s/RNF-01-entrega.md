# Entrega — HU-17 RNF-01 (`REQ-1794494001967`) · Modo Offline Completo (IndexedDB + PWA)

## Alcance implementado
- `apps/web/src/checklist/offlineStore.ts`: base `mant_asc_inspeccion_db` en **IndexedDB** con almacenes `visitas_en_curso` y `cola_fallas_criticas` (cero `LocalStorage` para respuestas o fotografías).
- `apps/web/src/checklist/InspeccionCampoView.tsx` + `apps/web/src/App.tsx`: guardado inmediato ante cada cambio e hidratación automática de vista (`inspeccion`), máquina, solapa, respuestas, observaciones, fotos y fallas por piso al reabrir la app sin conexión.
- `apps/web/vite.config.ts`: configuración Workbox (`navigateFallback: 'index.html'`, precaché de activos y `NetworkFirst` sobre `/api/checklist/config`) para abrir la app sin señal tras una primera carga con red.
- `apps/web/src/checklist/checklist.test.ts`: prueba de ciclo completo IndexedDB con **3 equipos y 20 fotos comprimidas `<= 500 KB`** y verificación explícita de `localStorage` sin uso.
- Guía visual móvil: [RNF-01-offline.md](RNF-01-offline.md).

## Cómo verificar
```bash
npm.cmd run build -w apps/web
npm.cmd run verify
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RNF-01-entrega.sh
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RNF-01-entrega.sh --carga 20
```

## Validación pendiente en hardware físico
- La verificación de campo de una visita de **3 equipos y 20 fotos en un celular Android real** (`TEST-1794494002009-6`) queda pendiente de ejecución por QA sobre dispositivo físico para registrar el modelo utilizado.

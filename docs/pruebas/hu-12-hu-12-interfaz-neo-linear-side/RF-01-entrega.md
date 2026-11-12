# Entrega HU-12 · RF-01 (`REQ-1794486918351`) — Shell Visual NEO Linear, Sidebar Colapsable, Cobertura Neón y Buscador Global Inline

## Qué quedó implementado

1. **Sistema de diseño NEO Linear dual (Dark / Light)**:
   - Variables semánticas, tipografía (`Inter` + `JetBrains Mono`) y estilos de shell, tablas, modales y tarjetas en [`apps/web/src/neo.css`](../../../apps/web/src/neo.css), [`apps/web/index.html`](../../../apps/web/index.html) y [`apps/web/src/main.tsx`](../../../apps/web/src/main.tsx).
   - Selector de tema `Cambiar tema visual` (`[data-testid="btn-toggle-theme"]`) e íconos SVG dedicados en [`apps/web/src/ui/Icons.tsx`](../../../apps/web/src/ui/Icons.tsx).
2. **Shell operativo con Sidebar colapsable sin superposición**:
   - En [`apps/web/src/App.tsx`](../../../apps/web/src/App.tsx), la barra lateral izquierda permite alternar mediante `Alternar barra lateral`: al colapsar a `80px`, el botón de expandir queda alineado lado a lado junto al logo violeta sin superponerse.
   - Vista bento `Estado del sistema` (`[data-testid="tab-sistema"]`) y barra de navegación inferior para móviles.
3. **Buscador Global Inline en reemplazo del modal `Ctrl+K`**:
   - Componente [`apps/web/src/ui/GlobalSearch.tsx`](../../../apps/web/src/ui/GlobalSearch.tsx) y lógica de filtrado/tipos en [`apps/web/src/ui/command.ts`](../../../apps/web/src/ui/command.ts) consultan consorcios (`/api/consorcios`) y máquinas (`/api/firmante/maquinas`), permitiendo saltar directo al consorcio en [`apps/web/src/consorcios/SecretariaView.tsx`](../../../apps/web/src/consorcios/SecretariaView.tsx) (`consorcioInicialId`) o abrir la auditoría en [`apps/web/src/firmante/PortalFirmante.tsx`](../../../apps/web/src/firmante/PortalFirmante.tsx) (`maquinaInicialId`).
4. **Contraste Neón en Medidor de Cobertura Mensual**:
   - Especificidad dedicada en [`apps/web/src/neo.css`](../../../apps/web/src/neo.css) para las métricas `Inspeccionadas`, `Firmadas (Legal AGC)`, `Pendientes de Visita`, `Con Advertencia` y `Flota Total`.

## Cómo se levanta y se prueba

```bash
npm run db:up
npm run dev
```

Abrir `https://localhost:8050` o correr el script de entrega y carga:

```bash
bash docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-01-entrega.sh
bash docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-01-entrega.sh --carga 50
```

- **Guía visual con capturas:** [`RF-01-interfaz-neo-buscador.md`](RF-01-interfaz-neo-buscador.md)

## Pruebas automatizadas en verde

- `npm run verify`:
  - `tsc --noEmit` en `apps/api` y `apps/web`: 0 errores.
  - `apps/api` (Jest): 22 suites passed, 170 tests passed.
  - `apps/web` (Vitest): 7 files passed, 82 tests passed (incluye `src/ui/command.test.ts`).

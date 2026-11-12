# HU-17 · RF-04 · Entrega — Pantalla de solapa generada desde el motor

- **Tarea:** HU-17 / RF-04 — `REQ-1794494001043`
- **Rama:** `feature/hu-17-hu-17-inspeccion-tecnica-por-s/req-1794494001043-pantalla-de-solapa-generada-desde-el-mot`
- **Depende de:** `HU-17 RF-01` (motor configurable) y `HU-17 RF-02` (`germanG`, aún en `to_do`: pantalla de inicio de visita y selección de edificio; se provee barra selectora provisoria de equipo/tipo/estado en `InspeccionCampoView.tsx`)
- **Guía visual:** [RF-04-pantalla-solapas.md](RF-04-pantalla-solapas.md) (con capturas `360 px` enfocadas con `.scrum-qa-foco`)
- **Script de entrega:** [RF-04-entrega.sh](RF-04-entrega.sh)

## 1. Qué quedó implementado

1. **`ChecklistSolapaView.tsx` (`apps/web/src/checklist/`)**: pantalla única genérica que recibe `ChecklistMotorConfig` y renderiza dinámicamente las 5 solapas (`Sala de Máquinas`, `Cabina`, `Accesos`, `Caja`, `Fosa`), subgrupos, ítems y botones táctiles (`min-height: 44px`).
2. **Observaciones de texto libre**: cada solapa incluye `<textarea id="obs-<solapaId>">` etiquetado `Observaciones` (compatible con dictado por micrófono del teclado del celular).
3. **Regla de tilde completa (`esSolapaCompleta` en `checklist.logic.ts`)**: la solapa muestra la tilde verde `✓` (`data-testid="solapa-tilde-<id>"`) únicamente cuando todos los ítems aplicables al tipo de máquina elegido tienen opción seleccionada.
4. **Diseño responsive `360 px` (`styles.css`)**: grilla adaptativa con `font-size: 16px` en opciones e inputs (sin auto-zoom en móviles) y ancho contenido (`scrollWidth <= 360`).

## 2. Cómo se levanta y se prueba

```bash
npm install
npm run db:up
npm run dev
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-04-entrega.sh
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-04-entrega.sh --carga 20
```

### Pruebas automatizadas

| Comando | Resultado |
|---|---|
| `npm run verify` | Typecheck 0 errores · API y Web tests en verde |
| `npm run test:int -w apps/api` | Suites de integración contra PostgreSQL + PostGIS en verde |
| `RF-04-entrega.sh` + `--carga 20` | Config + smoke UI Playwright `360 px` + carga verificados |


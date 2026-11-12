# Entrega HU-13 · RF-01 (`REQ-1794486918510`) — Alertas Críticas sin Prefijos Obvios ni Códigos Duplicados

## Qué quedó implementado

1. **`formatearNombreEquipo(codigoAGC, nombre)` en [`apps/web/src/eca/AlertasCriticas.tsx`](../../../apps/web/src/eca/AlertasCriticas.tsx)**:
   - Evita duplicaciones cuando el nombre del ascensor ya comienza con su código AGC (por ejemplo `M2: Ascensor Posterior` en lugar de `M2 - M2: Ascensor Posterior`).
2. **Eliminación de obviedades en tarjetas críticas**:
   - Removido el prefijo `CARTEL GIGANTE:` en encabezados de `ANOMALÍAS GRAVES DETECTADAS OPERANDO` (`REPARACIÓN URGENTE — ...`).
   - Removido el rótulo redundante superpuesto sobre la fotografía de cabina trabada.
3. **Actualización de pruebas en [`apps/web/src/eca/eca.test.ts`](../../../apps/web/src/eca/eca.test.ts)** validando títulos sin duplicación y sin prefijo redundante.

## Cómo se levanta y se prueba

```bash
npm run db:up
npm run dev
bash docs/pruebas/hu-13-hu-13-claridad-operativa-y-lim/RF-01-entrega.sh
bash docs/pruebas/hu-13-hu-13-claridad-operativa-y-lim/RF-01-entrega.sh --carga 30
```

- **Guía visual con capturas:** [`RF-01-alertas-sin-obviedades.md`](RF-01-alertas-sin-obviedades.md)

## Pruebas automatizadas en verde

- `npm run verify`:
  - `tsc --noEmit`: 0 errores.
  - `apps/api` (Jest): 22 suites passed, 170 tests passed.
  - `apps/web` (Vitest): 6 files passed, 79 tests passed (incluye `src/eca/eca.test.ts` con 22 tests).

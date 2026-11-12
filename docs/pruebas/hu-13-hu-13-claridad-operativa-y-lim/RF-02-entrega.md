# Entrega HU-13 · RF-02 (`REQ-1794486918616`) — Limpieza de Badges Obvios y Jerga Técnica

## Qué quedó implementado

1. **Portal ECA ([`apps/web/src/eca/PortalEca.tsx`](../../../apps/web/src/eca/PortalEca.tsx) y [`apps/web/src/eca/MedidorCobertura.tsx`](../../../apps/web/src/eca/MedidorCobertura.tsx))**:
   - Badge `data-testid="badge-solo-lectura"` simplificado a `Solo lectura` (eliminado `(Protegido)` y `Modo Solo Lectura`).
   - Removidos los subtítulos y chips redundantes `Modo Consulta Oficial` y `Solo lectura: Sin edición habilitada`.
2. **Consorcios ([`apps/web/src/consorcios/FichaConsorcio.tsx`](../../../apps/web/src/consorcios/FichaConsorcio.tsx) y [`apps/web/src/consorcios/FormularioConsorcio.tsx`](../../../apps/web/src/consorcios/FormularioConsorcio.tsx))**:
   - Eliminadas referencias internas a historias (`(HU-07)`), menciones de implementación (`base oficial`, `PostgreSQL` en ficha) y etiquetas técnicas (`Dirección Literal`, `Grilla Dinámica`).

## Cómo se levanta y se prueba

```bash
npm run db:up
npm run dev
bash docs/pruebas/hu-13-hu-13-claridad-operativa-y-lim/RF-02-entrega.sh
bash docs/pruebas/hu-13-hu-13-claridad-operativa-y-lim/RF-02-entrega.sh --carga 30
```

- **Guía visual con capturas:** [`RF-02-badges-y-textos-limpios.md`](RF-02-badges-y-textos-limpios.md)

## Pruebas automatizadas en verde

- `npm run verify`:
  - `tsc --noEmit`: 0 errores.
  - `apps/api` (Jest): 22 suites passed, 170 tests passed.
  - `apps/web` (Vitest): 6 files passed, 79 tests passed.

# Entrega HU-15 · RNF-02 (`REQ-1794493999670`) — Acceso de RT y Firmante a Edificios de Varias ECA

## Qué quedó implementado

1. **Migración [`009_rls_multi_eca_rt_firmante`](../../../apps/api/src/database/migrations.ts)**:
   - Función `SECURITY DEFINER` `usuario_asignado_en_edificio(uuid)` evaluando en vivo la asignación vigente en `roles_edificio` por `app.rol_actual` (`'rt_calle'` o `'firmante'`) y `app.usuario_actual`.
   - Políticas `FOR SELECT` en `consorcios`, `maquinas`, `roles_edificio` y `visitas_fallidas` habilitando visibilidad transversal entre distintas ECA sin requerir caché ni relogueo al revocar.
2. **Contexto RLS y revocación (`apps/api/src/database/`, `apps/api/src/consorcios/`)**:
   - [`rls-context.ts`](../../../apps/api/src/database/rls-context.ts) y [`eca-context.middleware.ts`](../../../apps/api/src/database/eca-context.middleware.ts): propagan `app.rol_actual` y `app.usuario_actual` (`x-rol-actual` / `x-usuario-actual` o `req.user`).
   - [`consorcios.controller.ts`](../../../apps/api/src/consorcios/consorcios.controller.ts) y [`pg-consorcios.repository.ts`](../../../apps/api/src/consorcios/pg-consorcios.repository.ts): `DELETE /api/consorcios/:id/roles` para quitar asignación en forma inmediata.

## Cómo se levanta y se prueba

```bash
npm run db:up
npm run dev
npm run test:int -w apps/api
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-02-entrega.sh
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-02-entrega.sh --carga 20
```

- **Guía de verificación:** [`RNF-02-acceso-multi-eca-rt-firmante.md`](RNF-02-acceso-multi-eca-rt-firmante.md)
- **Nota de integración:** Esta rama apila los cambios de `HU-15 RNF-01` (`PR #28`); mergear `PR #28` antes o junto a este PR.

## Pruebas automatizadas en verde

- `npm run verify`: API 23 suites / 174 tests passed; Web 7 files / 82 tests passed; `tsc --noEmit` 0 errores.
- `npm run test:int -w apps/api` (PostgreSQL real): 8 suites / 27 tests passed (incluye [`rls-rt-firmante.int-spec.ts`](../../../apps/api/test/rls-rt-firmante.int-spec.ts)).
- Prueba de entrega (`RNF-02-entrega.sh`): `4 OK · 0 fallas`; `--carga 20`: `20 corridas · 0 fallas HTTP != 200 · promedio 64 ms · p95 77 ms · más lenta 77 ms`.

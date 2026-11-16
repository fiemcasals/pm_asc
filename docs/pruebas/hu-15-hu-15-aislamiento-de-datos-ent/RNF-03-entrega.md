# Entrega HU-15 · RNF-03 (`REQ-1794500687294`) — Tomar la ECA y el rol del RLS desde la sesión del usuario

## Qué quedó implementado

1. **Extracción del contexto RLS desde la sesión autenticada (`RlsContextInterceptor`)**:
   - Implementado [`rls-context.interceptor.ts`](../../../apps/api/src/database/rls-context.interceptor.ts) ejecutándose tras [`RolesGuard`](../../../apps/api/src/auth/roles.guard.ts).
   - El contexto de aislamiento PostgreSQL (`app.eca_actual`, `app.rol_actual`, `app.usuario_actual`) se construye a partir del token verificado (`req.usuario`).
   - Se ignoran deliberadamente los headers cliente `x-eca-actual`, `x-rol-actual` y `x-usuario-actual` en [`eca-context.middleware.ts`](../../../apps/api/src/database/eca-context.middleware.ts).
   - Se eliminó el fallback a la ECA por defecto (`ECA_SISTEMA_DEV`) en [`rls-context.ts`](../../../apps/api/src/database/rls-context.ts): el RLS estricto opera de forma permanente sin flags de entorno.

2. **Migración [`012_rls_admin_secretaria`](../../../apps/api/src/database/migrations.ts)**:
   - Políticas RLS para roles de gestión central (`secretaria` y `administrador`) sobre `consorcios`, `maquinas`, `roles_edificio`, `acuses_recibo_legal` y `visitas_fallidas`.
   - Modificación del valor por defecto de `consorcios.eca_nombre` y `visitas_fallidas.eca_nombre` para reemplazar `'ECA_SISTEMA_DEV'` por `COALESCE(NULLIF(current_setting('app.eca_actual', true), ''), 'SIN_ASIGNAR')`.
   - Sincronización automática de `consorcios.eca_nombre` al asignar la terna tripartita en [`pg-consorcios.repository.ts`](../../../apps/api/src/consorcios/pg-consorcios.repository.ts).

3. **Protección estricta de rutas con datos operativos**:
   - [`ConsorciosController`](../../../apps/api/src/consorcios/consorcios.controller.ts) y [`VisitasFallidasController`](../../../apps/api/src/visitas-fallidas/visitas-fallidas.controller.ts) protegidos con `@Roles()`. Toda petición sin sesión válida responde `401 Unauthorized`.

4. **Compatibilidad en pruebas y suites de integración**:
   - [`create-test-app.ts`](../../../apps/api/test/create-test-app.ts): inyección controlada de sesión de prueba cuando no se pasan repositorios de autenticación en tests aislados en memoria.
   - Actualización completa de [`rls-eca.int-spec.ts`](../../../apps/api/test/rls-eca.int-spec.ts) y [`rls-rt-firmante.int-spec.ts`](../../../apps/api/test/rls-rt-firmante.int-spec.ts) con usuarios reales en PostgreSQL y tokens JWT.

---

## Cómo se levanta y se prueba

```bash
# 1. Base de datos PostgreSQL + PostGIS
npm run db:up

# 2. Verificación de tests unitarios y estáticos
npm run verify

# 3. Verificación de integración en PostgreSQL real (10/10 suites)
npm run test:int -w apps/api

# 4. Flujo de entrega interactivo y prueba de carga
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-03-entrega.sh
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-03-entrega.sh --carga 50
```

- **Guía de verificación:** [`RNF-03-rls-sesion-usuario.md`](RNF-03-rls-sesion-usuario.md)

---

## Pruebas automatizadas en verde

- `npm run verify`:
  - TypeScript: 0 errores de tipo en API y Web (`tsc --noEmit`).
  - Jest unit/e2e: 29 suites / 246 tests aprobados.
  - Vitest frontend: 10 suites / 123 tests aprobados.
- `npm run test:int -w apps/api` (PostgreSQL + PostGIS real):
  - 10 suites / 38 tests aprobados (incluye `rls-eca.int-spec.ts`, `rls-rt-firmante.int-spec.ts`, `visitas-fallidas-persistencia.int-spec.ts`, `consorcios.int-spec.ts`, `consorcios-roles.int-spec.ts`, `texto-invalido.int-spec.ts`).
- Script de entrega (`RNF-03-entrega.sh`):
  - Modo funcional: `5 OK · 0 fallas`.
  - Modo carga (`--carga 50`): `50 corridas · 0 fallas HTTP != 200 · promedio 59 ms · p95 76 ms · más lenta 86 ms`.

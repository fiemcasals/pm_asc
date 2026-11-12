# Entrega HU-15 · RNF-01 (`REQ-1794493999440`) — Row Level Security por ECA

## Qué quedó implementado

1. **Migración [`008_rls_por_eca`](../../../apps/api/src/database/migrations.ts)**:
   - Crea rol runtime **`ascensores_app`** (`NOSUPERUSER`, `NOBYPASSRLS`, sin propiedad sobre las tablas y sin contraseña embebida en SQL).
   - Otorga permisos de lectura/escritura sobre `ALL TABLES IN SCHEMA public`, secuencias existentes y futuras tablas/secuencias mediante `ALTER DEFAULT PRIVILEGES IN SCHEMA public` (cubre `consentimientos_ubicacion` y próximas migraciones).
   - Agrega columna `eca_nombre` e índices en `consorcios` y `visitas_fallidas`.
   - Habilita **Row Level Security** y políticas por ECA (`current_setting('app.eca_actual', true)`) en todas las tablas con datos de ECA (`consorcios`, `maquinas`, `roles_edificio`, `acuses_recibo_legal`, `visitas_fallidas`).
2. **Pool runtime sin `BYPASSRLS`, credencial en `.env` y propagación por contexto (`apps/api/src/database/`)**:
   - [`rls-context.ts`](../../../apps/api/src/database/rls-context.ts): `AsyncLocalStorage` con `runWithEcaContext`.
   - [`database.service.ts`](../../../apps/api/src/database/database.service.ts): `deriveAppDatabaseUrl` conecta el pool permanente como `ascensores_app` usando `DATABASE_APP_PASSWORD` (o `DATABASE_APP_URL`) desde `.env`; la conexión owner `DATABASE_URL` corre migraciones + `ALTER ROLE ascensores_app` en `onModuleInit` y se cierra. Toda query/transacción aplica `set_config('app.eca_actual', ..., true)` cuando hay contexto activo, o devuelve 0 filas sin contexto.
   - [`eca-context.middleware.ts`](../../../apps/api/src/database/eca-context.middleware.ts) y [`seguridad-rls.controller.ts`](../../../apps/api/src/database/seguridad-rls.controller.ts): propagación HTTP (`x-eca-actual` / `req.user.eca`) y diagnóstico en vivo (`GET /api/seguridad/rls`).

## Cómo se levanta y se prueba

```bash
npm run db:up
npm run dev
npm run test:int -w apps/api
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-01-entrega.sh
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-01-entrega.sh --carga 20
```

- **Guía de verificación:** [`RNF-01-rls-por-eca.md`](RNF-01-rls-por-eca.md)

## Supuesto / integración pendiente con `HU-14 RF-01`

- Al no estar aún integrado `HU-14 RF-01` en `dev`, cuando un request HTTP omite `x-eca-actual` y no trae `req.user.eca`, `EcaContextMiddleware` asigna temporalmente `'ECA_SISTEMA_DEV'` para mantener operativas las pantallas previas al login (con `RLS_STRICT_HTTP=true` o sin contexto en DB devuelve 0 filas).

## Pruebas automatizadas en verde

- `npm run verify`:
  - `tsc --noEmit`: 0 errores.
  - `apps/api` (Jest): 23 suites passed, 173 tests passed.
  - `apps/web` (Vitest): 7 files passed, 82 tests passed.
- `npm run test:int -w apps/api` (PostgreSQL real):
  - 7 suites passed, 26 tests passed (incluye [`rls-eca.int-spec.ts`](../../../apps/api/test/rls-eca.int-spec.ts) probando aislamiento completo entre 2 ECAs, 0 filas sin contexto y rol `ascensores_app` sin `BYPASSRLS`).
- Prueba de entrega y estrés (`RNF-01-entrega.sh`):
  - Funcional: `4 OK · 0 fallas`.
  - `--carga 20`: `20 corridas · 0 fallas HTTP != 200 · promedio 74 ms · p95 86 ms · más lenta 102 ms`.

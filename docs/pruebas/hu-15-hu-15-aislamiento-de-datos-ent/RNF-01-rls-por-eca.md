# Guía de Verificación — HU-15 · RNF-01: Row Level Security por ECA

**Requisito:** `REQ-1794493999440`
**Historia:** HU-15 — Aislamiento de Datos entre ECAs
**Fecha:** 2026-11-12

---

## Prerrequisitos

1. Base de datos PostgreSQL + PostGIS levantada (`npm run db:up`).
2. Entorno local activo (`npm run dev`), accesible en `https://localhost:8050`.

---

## Verificación de las 4 condiciones de aceptación

1. **Tablas con RLS activo y política por ECA:**
   Consultar `GET https://localhost:8050/api/seguridad/rls` y confirmar `rlsActivo: true` y `politicas: 1` en:
   - `acuses_recibo_legal`
   - `consorcios`
   - `maquinas`
   - `roles_edificio`
   - `visitas_fallidas`
2. **Usuario de aplicación sin `BYPASSRLS` ni ownership de tablas:**
   El mismo endpoint confirma `usuarioActual: "ascensores_app"`, `esSuperuser: false`, `tieneBypassRls: false` y `esDuenoTablas: false` (la conexión administrativa de `DATABASE_URL` sólo corre en migraciones al arranque y se cierra).
3. **Consulta sin contexto de ECA devuelve 0 filas:**
   - A nivel SQL (`db.query('SELECT * FROM consorcios')` sin `runWithEcaContext`) devuelve `0` filas.
   - A nivel HTTP con header `x-eca-actual: ` vacío devuelve `[]`.
4. **Test automático con 2 ECAs (`apps/api/test/rls-eca.int-spec.ts`):**
   Ejecutar `npm run test:int -w apps/api` y `bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-01-entrega.sh`.

---

## Nota sobre dependencia upstream (`HU-14 RF-01`)

El login y la sesión JWT de usuarios (`HU-14 RF-01`) están en desarrollo por otro integrante. Mientras se integra en `dev`, `EcaContextMiddleware` lee `x-eca-actual` (o `req.user?.eca` cuando esté disponible) y usa un contexto por defecto de desarrollo (`ECA_SISTEMA_DEV`) únicamente si no se envía el header para no interrumpir las pantallas de Secretaría previas al login; con `RLS_STRICT_HTTP=true` o `x-eca-actual: ` vacío, falla cerrado devolviendo `0` filas.

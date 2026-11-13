# Guía de Verificación — HU-15 · RNF-03: Tomar la ECA y el rol del RLS desde la sesión del usuario

**Requisito:** `REQ-1794500687294`  
**Historia:** HU-15 — Aislamiento de Datos entre Empresas Conservadoras (ECA)  
**Fecha:** 2026-11-13  

---

## Prerrequisitos

1. Base de datos PostgreSQL + PostGIS levantada (`npm run db:up`), con migraciones hasta `012_rls_admin_secretaria` aplicadas.
2. Servidor API activo en desarrollo (`npm run dev` o `npm run start:dev -w apps/api`), accesible en `https://localhost:8050` o `http://localhost:3000`.

---

## Verificación de las 4 condiciones de aceptación

1. **Condición 1: Contexto de RLS extraído de la sesión verificada e ignorancia de cabeceras de cliente:**
   - La API ya no lee `x-eca-actual`, `x-rol-actual` ni `x-usuario-actual` para determinar las políticas de aislamiento.
   - El contexto seguro se establece en `RlsContextInterceptor` inmediatamente después de la verificación del token JWT en `RolesGuard`.
   - Para un usuario con rol `eca`, la ECA del contexto se obtiene de su registro en la base de datos (`req.usuario.eca`).

2. **Condición 2: Inmunidad frente a spoofing de ECA por cabeceras:**
   - Un usuario perteneciente a `ECA-ALPHA` que efectúe peticiones enviando `x-eca-actual: ECA-BETA` sigue visualizando única y exclusivamente los datos de `ECA-ALPHA`.
   - Cualquier intento de acceder o modificar filas de `ECA-BETA` mediante su identificador UUID recibe un `404 Not Found` por filtrado de RLS en base de datos.
   - Un test automático dedicado valida esta condición y falla si se filtra cualquier fila ajena.

3. **Condición 3: RLS estricto permanente y respuesta 401 sin sesión:**
   - Una petición sin sesión (`Authorization: Bearer <token>`) dirigida a rutas con datos operativos de ECA (`/api/consorcios`, `/api/visitas-fallidas`, etc.) responde inmediatamente `401 Unauthorized`.
   - Se elimina de forma permanente cualquier fallback a una ECA por defecto (`ECA_SISTEMA_DEV`).
   - Consultas SQL directas a la base sin contexto RLS devuelven exactamente 0 filas.

4. **Condición 4: RT de Calle y Firmante multi-ECA y consentimiento de ubicación:**
   - Los roles transversales (`rt_calle` y `firmante`) conservan visibilidad sobre los edificios y máquinas asignados independientemente de la ECA propietaria.
   - La funcionalidad de consentimiento de ubicación continúa operativa utilizando el usuario de conexión de aplicación del RLS (`ascensores_app`).
   - La suite completa de integración (`npm run test:int`) se ejecuta 100% en verde (10/10 suites).

---

## Comandos de verificación automatizada

```bash
# Verificación de compilación y pruebas unitarias
npm run verify

# Verificación de integración en PostgreSQL real
npm run test:int -w apps/api

# Script de flujo de entrega interactivo y carga
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-03-entrega.sh
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-03-entrega.sh --carga 50
```

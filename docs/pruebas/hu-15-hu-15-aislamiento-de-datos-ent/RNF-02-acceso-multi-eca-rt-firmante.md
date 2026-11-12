# Guía de Verificación — HU-15 · RNF-02: Acceso de RT y Firmante a Edificios de Varias ECA

**Requisito:** `REQ-1794493999670`
**Historia:** HU-15 — Aislamiento de Datos entre ECAs
**Fecha:** 2026-11-12

---

## Prerrequisitos

1. Base de datos PostgreSQL + PostGIS levantada (`npm run db:up`), migraciones `008_rls_por_eca` y `009_rls_multi_eca_rt_firmante` aplicadas.
2. Entorno local activo (`npm run dev`), accesible en `https://localhost:8050`.

---

## Verificación de las 3 condiciones de aceptación

1. **RT de Calle multi-ECA:**
   Consultando `GET /api/consorcios` con `x-rol-actual: rt_calle` y `x-usuario-actual: <nombre o email>`, PostgreSQL evalúa la función `usuario_asignado_en_edificio(id)` contra `roles_edificio` y retorna edificios asignados aunque pertenezcan a distintas ECA, ocultando los no asignados.
2. **Firmante multi-ECA:**
   Consultando `consorcios` y `maquinas` con `x-rol-actual: firmante` y `x-usuario-actual: <nombre o email>`, sólo son legibles las máquinas de edificios donde figura como Firmante.
3. **Revocación inmediata:**
   Al quitar o reasignar el rol (`DELETE /api/consorcios/:id/roles` o `PUT /api/consorcios/:id/roles`), la siguiente consulta realizada con el mismo usuario ya no incluye el edificio ni sus máquinas.

## Comando automatizado

```bash
npm run test:int -w apps/api -- test/rls-rt-firmante.int-spec.ts
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-02-entrega.sh
```

# HU-17 / RF-03 — Verificación del reporte de parada

El reporte de parada se construyó junto con la pregunta de uso de HU-17 RF-02 (la misma pantalla) y está en `dev`; esta nota verifica sus 3 criterios contra el código y sus pruebas, sin cambios de código. La guía completa está en `RF-02-pregunta-de-uso.md`.

| Criterio | Dónde está | Cómo se comprobó |
| --- | --- | --- |
| 1. «Guardar Reporte de Parada» se habilita sólo con causa y al menos una foto | `puedeGuardarParada` (web) y la validación de `POST /api/paradas` (API) | `usoEquipo.test.ts` (habilitación del botón) y `paradas.spec.ts` (400 sin causa, causa en blanco, sin fotos, fotos vacías); en el navegador el botón sigue deshabilitado con sólo la causa |
| 2. Al guardar, el equipo queda «Fuera de Servicio — Pendiente de confirmación» y la Secretaría y el Firmante reciben el aviso | `ParadasService.registrar` | `paradas.spec.ts` y `paradas.e2e-spec.ts` (201, estado, `avisadoA`, lista para Secretaría y Firmante, 403 para el Firmante que reporta); `RF-03-entrega.sh` (9 verificaciones) |
| 3. El pin del edificio sale del mapa del RT recién cuando todos sus equipos están resueltos | `edificioResuelto` | `usoEquipo.test.ts`. La regla está hecha y probada como función; el mapa del RT es HU-16, que la usará |

Para repetirlo: `cd apps/web && npx vitest run src/checklist/usoEquipo`, `cd apps/api && npx jest test/paradas` y `bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-03-entrega.sh` (con la API levantada).

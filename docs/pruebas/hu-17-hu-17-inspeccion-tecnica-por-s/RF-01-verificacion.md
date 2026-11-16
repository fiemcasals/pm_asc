# HU-17 / RF-01 — Verificación del motor del checklist configurable

El motor ya estaba construido y mergeado a `dev` (ver `RF-01-entrega.md`); la tarjeta seguía en «doing» sin PR ni certificación. Esta nota deja registrada la verificación punto por punto contra el código de `dev` (16/11/2026), sin cambios de código.

| Criterio | Dónde está | Cómo se comprobó |
| --- | --- | --- |
| 1. Las 5 solapas, subgrupos, ítems y opciones en un archivo de configuración versionado | `apps/api/src/checklist/checklist.config.ts` (`CHECKLIST_VERSION`) y su copia en la web | `checklist.config.spec.ts`: «define las 5 solapas versionadas con sus subgrupos e ítems» |
| 2. Cada opción indica falla, Falla Crítica y foto obligatoria; la foto es obligatoria en Falla Crítica y en Fuera de Servicio | `ChecklistOpcionConfig` y `requiereFotoChecklist` | «exige foto obligatoria en falla crítica o cuando el equipo está Fuera de Servicio» |
| 3. Cada ítem indica a qué tipos aplica: en hidráulicos no hay poleas, cables ni extensión de cables y aparece «Aceite de batea» | `tiposAplicables` por ítem | «hidráulico oculta cables/poleas/extensión de cables e incluye Aceite de batea» |
| 4. Un test verifica los ítems del cliente y que las críticas son exactamente las de la lista | `checklist.config.spec.ts` | «sincroniza 1 a 1 las 14 fallas críticas definidas con HU-06 RF-03» y «mantiene como fallas comunes no críticas los ítems excluidos» |
| 5. Cada inspección guarda la versión del checklist | columna `version_checklist` de `inspecciones_checklist` | `checklist.int-spec.ts`: «aplica la migración 010 y persiste version_checklist en la tabla» |

Resultado: las 8 pruebas de `checklist.config.spec.ts` y de `checklist.e2e-spec.ts` pasan, y la prueba de integración contra PostgreSQL también.

Para repetirlo: `cd apps/api && npx jest test/checklist` y `npx jest --config jest.int.config.js test/checklist`.

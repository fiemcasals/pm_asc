# HU-17 · RF-05 · Entrega — Fotos por anomalía

- **Tarea:** HU-17 / RF-05 — `REQ-1794494001295`
- **Rama:** `feature/hu-17-hu-17-inspeccion-tecnica-por-s/req-1794494001295-fotos-por-anomalia`
- **Depende de:** `HU-17 RF-04` (PR #32, integrado en esta rama)
- **Guía visual:** [RF-05-fotos-anomalia.md](RF-05-fotos-anomalia.md)
- **Script de entrega:** [RF-05-entrega.sh](RF-05-entrega.sh)

## 1. Qué quedó implementado

1. **`fotos.ts` (`apps/web/src/checklist/fotos.ts`)**:
   - Compresor Canvas JPEG iterativo (`comprimirFotoAnomalia` + `comprimirDataUrlHastaTope`) que reduce escala y calidad hasta garantizar `sizeBytes <= 512000` (`500 KB`).
   - Registro tipado `FotoAnomalia` con `maquinaId`, `referenciaAgc`, `solapaId`, `itemId`, `itemEtiqueta`, `sizeBytes` y `tomadaEn` ISO-8601.
2. **Validación en `evaluarEstadoSolapa` (`checklist.logic.ts`)**:
   - Marcar cualquier falla muestra `"Adjuntar Foto de Anomalía — <ítem>"`; opciones correctas no lo muestran.
   - Una **Falla Crítica** sin foto (o falla con equipo `fuera_de_servicio`) impide completar la solapa (`completa: false`) y muestra `Falta foto obligatoria`; una falla común sin foto sí permite completar la solapa.

## 2. Cómo se levanta y se prueba

```bash
npm run db:up
npm run dev
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-05-entrega.sh
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-05-entrega.sh --carga 20
```

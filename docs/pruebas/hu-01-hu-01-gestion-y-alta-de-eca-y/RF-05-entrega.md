# Entrega HU-01 · RF-05 (`REQ-1794493998460`) — Datos Operativos del Edificio y del Equipo para la Calle

## Qué quedó implementado

1. **Migración [`007_datos_operativos_edificio_equipo`](../../../apps/api/src/database/migrations.ts)**:
   - Agrega `encargado_nombre`, `encargado_telefono`, `pisos` (`jsonb`) y `ubicacion` (`geometry(Point, 4326)` con índice GIST) en `consorcios`.
   - Agrega `tipo` (`'traccion' | 'hidraulico' | 'montavehiculos'`) y `sala_compartida_id` en `maquinas`.
2. **Backend NestJS (`apps/api/src/consorcios/`)**:
   - [`consorcio.validation.ts`](../../../apps/api/src/consorcios/consorcio.validation.ts) valida y normaliza encargado, pisos deduplicados, coordenadas lat/lon `ubicacion`, `tipo` de máquina y `salaCompartidaId`.
   - [`pg-consorcios.repository.ts`](../../../apps/api/src/consorcios/pg-consorcios.repository.ts) persiste y lee puntos PostGIS (`ST_SetSRID(ST_MakePoint(lon, lat), 4326)`, `ST_X`/`ST_Y`) y expone `listarParaMapa()` filtrando `WHERE c.ubicacion IS NOT NULL`.
   - [`consorcios.controller.ts`](../../../apps/api/src/consorcios/consorcios.controller.ts) publica `GET /api/consorcios/mapa`.
3. **Frontend React (`apps/web/src/consorcios/`)**:
   - [`MapaUbicacionConsorcio.tsx`](../../../apps/web/src/consorcios/MapaUbicacionConsorcio.tsx): mapa CABA interactivo offline (modo clicable editable y vista global).
   - [`FichaConsorcio.tsx`](../../../apps/web/src/consorcios/FichaConsorcio.tsx): advertencia explícita cuando falta ubicación, edición en línea de encargado/pisos/punto PostGIS/tipo/sala compartida y bloque **Salas de Máquinas Compartidas** cuando 2+ equipos comparten sala.
   - [`FormularioConsorcio.tsx`](../../../apps/web/src/consorcios/FormularioConsorcio.tsx) y [`SecretariaView.tsx`](../../../apps/web/src/consorcios/SecretariaView.tsx): carga opcional inicial y panel **Vista Mapa** excluyendo edificios sin ubicación.

## Cómo se levanta y se prueba

```bash
npm run db:up
npm run dev
bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-05-entrega.sh
bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-05-entrega.sh --carga 20
```

- **Guía visual con capturas:** [`RF-05-datos-operativos-edificio-equipo.md`](RF-05-datos-operativos-edificio-equipo.md)

## Pruebas automatizadas en verde

- `npm run verify`:
  - `tsc --noEmit`: 0 errores.
  - `apps/api` (Jest): 22 suites passed, 172 tests passed.
  - `apps/web` (Vitest): 7 files passed, 85 tests passed.
- `npm run test:int -w apps/api`:
  - PostgreSQL + PostGIS: 6 suites passed, 25 tests passed.
- Prueba de entrega y estrés (`RF-05-entrega.sh`):
  - Funcional: `4 OK · 0 fallas`.
  - `--carga 20`: `20 corridas · 0 fallas HTTP != 200 · promedio 60 ms · p95 73 ms · más lenta 74 ms`.

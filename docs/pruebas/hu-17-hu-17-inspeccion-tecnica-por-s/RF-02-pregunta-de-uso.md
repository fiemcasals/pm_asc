# HU-17 / RF-02 y RF-03 — Pregunta de uso del equipo y reporte de parada

Qué cambia en la pantalla «Inspección Técnica (Checklist)» del RT:

1. **Pregunta de uso (RF-02).** Al elegir un equipo, antes de ver las solapas aparece «¿El equipo está en uso?» con dos botones: **SÍ, EN USO** y **NO, FUERA DE SERVICIO**. Mientras no responda no se ven las solapas: no se puede avanzar. El título muestra la referencia AGC y el tipo del equipo (Tracción, Hidráulico o Montavehículos). La respuesta se puede cambiar con «Cambiar respuesta».
   - **SÍ, EN USO** habilita las solapas.
   - **NO, FUERA DE SERVICIO** abre el **reporte de parada** y también habilita las solapas (la foto de cada falla es obligatoria en un equipo fuera de servicio, como ya definía HU-17 RF-01).
2. **Reporte de parada (RF-03).** Pide la **causa** (texto) y **al menos una foto**. «Guardar Reporte de Parada» está deshabilitado hasta tener las dos cosas. Al guardar, el equipo queda **«Fuera de Servicio — Pendiente de confirmación»** y se avisa a la Secretaría y al Firmante.

## API (RF-03)

- `POST /api/paradas` con `{ "maquinaId", "causa", "fotos": [...] }`. Roles: RT de Calle, Secretaría y Administrador (Firmante y ECA reciben 403; sin sesión 401). Sin causa o sin fotos: 400 con el detalle. Máquina inexistente: 404. Un equipo que ya tiene un reporte pendiente: 409.
- `GET /api/paradas`: los reportes pendientes (sin las imágenes, sólo cuántas hay). Secretaría, Administrador y Firmante.
- Los reportes están **en memoria** (igual que las máquinas del módulo del Firmante) y se pierden al reiniciar la API. La **confirmación** del estado por el Firmante es HU-06 RF-05.

## Qué queda para otras tarjetas

- **Equipos reales del edificio:** la pantalla usa los equipos de la ficha cuando se le pasa un edificio (`equiposDeFicha`, de RF-06); hoy se abre sin edificio y muestra los de demostración. HU-16 («Iniciar Inspección» en un edificio) es la que lo conecta.
- **Criterio 3 de RF-03 (el pin sale del mapa recién cuando todos los equipos están resueltos):** la regla está hecha y probada como función (`edificioResuelto`); el mapa del RT es HU-16.

## Cómo probarlo

1. `npm run dev` y los datos demo (`RF-02-datos-demo.sh` de HU-04). Entrá a https://localhost:8050 como `demo.secretaria` / `Demo-Clave-2026` y abrí «Inspección Técnica (Checklist)».
2. Se ve la pregunta de uso y **no** las solapas. Tocá «NO, FUERA DE SERVICIO»: aparece el reporte de parada. Escribí una causa: el botón sigue deshabilitado. Sacá o elegí una foto: se habilita. Guardá: «Fuera de Servicio — Pendiente de confirmación. Se avisó a la Secretaría y al Firmante.»
3. «Cambiar respuesta» y tocá «SÍ, EN USO»: aparecen las solapas y no el reporte.
4. API: `bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-03-entrega.sh` (9 verificaciones; los reportes quedan hasta reiniciar la API).

## Pruebas automáticas

Web: `usoEquipo.test.ts` (la pregunta, la habilitación del botón, el edificio resuelto y el envío). API: `paradas.spec.ts` (8) y `paradas.e2e-spec.ts` (3, con roles reales). La pantalla se verificó en el navegador: sin responder no hay solapas; «NO» abre el reporte con el botón deshabilitado hasta tener causa y foto; guardar muestra el estado; «SÍ» habilita las solapas.

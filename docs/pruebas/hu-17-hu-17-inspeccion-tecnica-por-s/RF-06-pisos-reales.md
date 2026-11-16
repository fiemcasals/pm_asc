# HU-17 / RF-06 — Fallas por piso: los pisos reales del edificio

La tarjeta ya estaba construida (`RF-06-fallas-piso.md`): el botón «+ Agregar Falla en un Piso», los tres grupos del cliente (Seguridad Crítica, Mecánica de Puerta, Llamadores), «Espacio entre puertas mayor a 12 cm» como falla crítica, varias fallas por piso y eliminar una antes de cerrar la solapa. Faltaba un detalle del criterio 1: la lista de pisos era una lista fija por defecto, no la del edificio.

## Qué se agregó

- `pisosDelEdificio(pisos)`: la lista de pisos de la ficha del edificio, sin repetidos ni vacíos y en el orden en que están cargados; si el edificio no tiene pisos cargados, la lista por defecto (`SS, PB, 1…`).
- `InspeccionCampoView` recibe una propiedad opcional `edificio` (equipos y pisos). Con ella, el selector «Piso del edificio» ofrece los pisos reales de ese edificio; sin ella (demostración) sigue usando los de ejemplo.
- `equiposDeFicha(maquinas)`: arma los equipos de la pantalla a partir de las máquinas de la ficha (referencia AGC y tipo; por defecto tracción; las salas compartidas se agrupan). Es lo que pide HU-17 RF-02 («los equipos del edificio con su referencia AGC y su tipo»).

**Pendiente:** hoy la pantalla se abre sin edificio (demostración). El que le pasa el edificio real es el mapa del RT (HU-16, «Iniciar Inspección» en un edificio). La conexión queda lista del lado de la pantalla.

## Cómo probarlo

1. `npm run dev`, entrá como RT y abrí «Inspección Técnica (Checklist)» › solapa Accesos › «+ Agregar Falla en un Piso»: hoy ofrece los pisos por defecto.
2. Las pruebas de la web (`checklist.test.ts`, 4 casos nuevos) comprueban que, con un edificio de pisos `PB, 1, 2, Terraza`, la función que alimenta el selector devuelve exactamente esos, y que `equiposDeFicha` conserva la referencia AGC y el tipo de cada máquina.

Se rompió el código a propósito de tres maneras (no quitar repetidos, no usar la lista por defecto, ignorar el tipo de la máquina) y las tres hicieron fallar pruebas.

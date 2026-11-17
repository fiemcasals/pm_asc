# HU-16 · RF-01 — Mapa del RT con pines por horario

**Qué hace.** La pantalla inicial del RT de Calle en el celular: un encabezado con saludo, zona y hora, y un mapa con **sus edificios pendientes de hoy**, cada pin pintado según el horario del edificio: **verde** (abierto ahora), **rojo** (cerrado) o **amarillo** («A coordinar»). Los colores y la hora se recalculan solos al cruzar una franja, sin recargar. Es distinto del mapa de la Secretaría (que muestra el semáforo del mes).

Captura a 360 px de ancho: `imagenes/RF-01-mapa-del-rt-360px.png`.

## La pantalla

- **Encabezado:** «Hola Ing. Aliado 1 | Zona Norte | 11:30 hs» (hora de Buenos Aires, 24 h). Sin zona cargada no inventa una: «Hola Ing. Aliado 1 | 11:30 hs».
- **Mapa:** el mapa de CABA de la app con un pin por edificio (nombre al lado; al tocarlo se ve «Abierto ahora · dirección», etc.). Un edificio sin punto en el mapa no es pin: se lista debajo como «Sin ubicación en el mapa».
- **Leyenda:** ● Abierto ahora · ● Cerrado · ● A coordinar.
- Debajo del mapa sigue la lista «Edificios pendientes de hoy» con «No se pudo realizar la inspección» (HU-07 RF-06).
- **Sin desplazamiento horizontal** a 360 px (verificado: el ancho del documento es 360).

## Cómo se calcula el color

`colorDePin(horario, feriados, ahora)` (apps/web/src/rtmapa/colorPin.ts) es la misma regla que aplica la API en `GET /api/consorcios/:id/horarios/abierto`:

| Situación | Color |
|---|---|
| «A coordinar» (gana sobre todo lo demás, también en un feriado) | amarillo |
| Feriado | rojo |
| Dentro de una franja (el inicio cuenta como abierto y el fin no: 12:00 ya es rojo) | verde |
| Fuera de franja o día sin franjas | rojo |

Se evalúa en **hora de Buenos Aires**. El celular corrige su reloj con la hora del servidor que trae el mapa, y recalcula **cada 15 s**: probado en el navegador, con la página abierta, un pin pasó de rojo a verde al llegar la hora de apertura (11:21) y el encabezado avanzó de 11:19 a 11:21 sin recargar.

## API

`GET /api/rt/mapa` (sólo rol RT de Calle) → `{ rt: { nombre, zona }, ahora, feriados, edificios: [{ id, nombre, direccion, ubicacion, aCoordinar, franjas }] }`. Trae **sólo los edificios que el RT tiene asignados** (lo garantiza la RLS de la base) y de ésos saca:

- los **bloqueados** (3 visitas fallidas sin visita exitosa ni desbloqueo),
- los que ya tienen una **visita fallida de hoy**,
- los **resueltos en el día**: todos sus equipos con una inspección de hoy (día de Buenos Aires). Con la mitad inspeccionada el edificio sigue en el mapa; uno sin equipos no se da por resuelto.

**Zona del RT:** `PUT /api/usuarios/:id/zona` con `{ "zona": "Norte" }` (sólo el Administrador, sólo usuarios RT de Calle; hasta 40 caracteres; vacío o `null` la borra). Migración `025_zona_del_rt`.

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-16-hu-16-mapa-del-rt/RF-01-entrega.sh
```

El script crea dos RT y cuatro edificios temporales y los borra. Para ver la pantalla: entrar como un RT con edificios asignados (el RT de la demo no tiene clave), aceptar el aviso de ubicación y mirar la pestaña «Mapa del RT».

Pruebas automáticas: `rt-mapa.e2e-spec.ts` (zona, filtros y roles), `rt-mapa.int-spec.ts` (PostgreSQL real: RLS, PostGIS, inspecciones del día, visitas fallidas y bloqueo) y `apps/web/src/rtmapa/colorPin.test.ts` (los 4 casos del criterio 2 —dentro de franja, fuera de franja, feriado y «A coordinar»—, los bordes minuto a minuto, la zona horaria, el encabezado y la corrección del reloj). Se verificaron con 17 mutaciones (bloqueados visibles, resueltos que no salen, resuelto con una sola inspección, edificio sin equipos resuelto, zona no informada, rol equivocado, el fin de la franja que cuenta, el inicio que no, feriados que no cierran, «A coordinar» sin amarillo, UTC, desfase invertido, leyenda incompleta…): todas hacen fallar algún test, salvo una equivalente (un cuerpo sin `zona` da 400 igual, con otro mensaje).

## Limitaciones y para confirmar

- El mapa es el esquema de CABA de la app (sin teselas ni calles reales): los pines se proyectan sobre los límites de la Ciudad. Un mapa real (Leaflet/MapLibre) es una mejora aparte.
- «Resuelto en el día» cuenta las inspecciones; el reporte de parada de un equipo fuera de servicio (HU-17 RF-03) vive en memoria y todavía no se tiene en cuenta.
- La zona se carga por API: no hay pantalla de administración para editarla.
- El mapa se carga una vez al abrir la pantalla; un cambio de horarios de la Secretaría se ve al volver a abrirla.
- Para confirmar con el cliente: cómo se define la «zona» de un RT (hoy es un texto libre por RT) y si quiere ver también, en gris, los edificios ya resueltos del día.

# HU-16 · RF-05 · Entrega — Usar el mapa nuevo en las pantallas y retirar el dibujo anterior

- **Tarea:** HU-16 / RF-05 — `REQ-1795097971367`
- **Rama:** `feature/hu-16-hu-16-mapa-del-rt-y-llegada-al/req-1795097971367-usar-el-mapa-nuevo-en-las-pantallas-y-re`
- **Depende de:** HU-16 / RF-04 (`REQ-1795097971265`, el componente `MapaEdificios`). **Este PR está apilado sobre el de RF-04:** su base es la rama de RF-04, no `dev`, y hay que mergear primero ese.
- **Script:** [RF-05-entrega.sh](RF-05-entrega.sh) · **Guía visual con capturas:** [RF-05-guia-visual.md](RF-05-guia-visual.md)

## 1. Qué quedó implementado

- **Las cinco pantallas usan `MapaEdificios`:** la ficha del edificio (lectura y edición), el alta de consorcio, Secretaría (la vista de mapa y Monitoreo), el Semáforo y el Mapa del RT. Los datos que cada una le pasa no cambian.
- **Se retiró `MapaUbicacionConsorcio.tsx`,** el dibujo con las tres avenidas a mano. En `apps/web/src` no queda ninguna referencia a él ni a «Av. Rivadavia», «Av. 9 de Julio» ni «Av. Cabildo / Santa Fe».
- **El Mapa del RT funciona sin conexión:** cada vez que baja los datos los guarda en el celular, y si no hay conexión muestra los últimos datos guardados con un cartel que dice de qué hora son («Sin conexión: los edificios son los últimos datos descargados, de las 02:06 del 21/11/2026.»). Al volver la señal los baja de nuevo. Con el mapa base ya descargado (RF-03) se ve el mapa y los pines.
  - Un error del servidor o una sesión revocada **no** se tapan con datos viejos: en esos casos sigue mostrando el error de antes.
  - Los datos guardados se borran al cerrar sesión.
  - Sin conexión, los colores de los pines se recalculan con la hora del celular.
- **El Semáforo** conserva los colores de sus pines, su leyenda y la nota «El mapa muestra solamente edificios: no hay seguimiento de técnicos en vivo».
- **La app no pide ninguna geolocalización nueva:** sólo `auth/ubicacion.ts` la usa, y su prueba sigue en verde.
- El Mapa del RT ahora ofrece **Descargar mapa para usar sin señal** debajo del mapa.

Archivos: las cinco pantallas, `rtmapa/mapaRt.ts` (`cargarMapaRtConRespaldo`, `guardarMapaRt`, `leerMapaRtGuardado`, `horaDeLosDatos`), `rtmapa/MapaRtView.tsx`, `auth/sesion.ts` (borra los datos guardados al cerrar sesión), `semaforo/semaforo.ts` y la prueba nueva `rtmapa/mapaRtGuardado.test.ts`. En `rtmapa/tarjeta.test.ts` se cambió la dirección de ejemplo «Av. Rivadavia 1234» por «Av. Corrientes 1234», para que la búsqueda de la condición 1 dé vacía.

## 2. Cómo se levanta y se prueba

```bash
npm install
npm run mapa:generar      # el mapa base (~11 MB); no está en git, necesita internet
npm run verify
bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-05-entrega.sh
npm run dev               # y abrir la guía visual
```

## 3. Qué datos hacen falta

Los de demo (`RF-02-datos-demo.sh` de HU-04) y `caba.pmtiles`. Para el Mapa del RT, el usuario `rt.beto`, que además tiene que haber aceptado el aviso de uso de ubicación.

## 4. Qué endpoints o pantallas toca

Las cinco pantallas de arriba. Ningún endpoint cambia: el Mapa del RT sigue pidiendo `GET /api/rt/mapa`.

## 5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-05-entrega.sh
bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-05-entrega.sh --carga 15
```

Medido el 21/11/2026:

| Qué | Resultado |
|---|---|
| Script | 15 verificaciones OK; carga de 15 corridas: 0 fallos, promedio 3528 ms |
| `mapaRtGuardado.test.ts` | 13 de 13 |
| `npm run verify` | Tipos OK · API 1143/1143 · web 578/578 |
| `npm run build` (web) | Compila, 29 entradas de precache |
| `npm run test:int` | 188/188 |

| Condición de aprobación | ¿Cubierta? | Cómo se comprobó |
|---|---|---|
| 1. Las cinco pantallas usan el componente nuevo y no queda nada del dibujo anterior | Sí | Script pasos 1 y 2 (búsqueda vacía; 7 usos de `<MapaEdificios>`) · capturas de la guía |
| 2. Las pruebas de la web y `verify` y `test:int` siguen en verde | Sí | Tabla de arriba |
| 3. Mapa del RT sin red: se ven el mapa base y los pines con los últimos datos, y un cartel con la hora | Sí | `mapaRtGuardado.test.ts` (13 pruebas) · en el navegador, con la app compilada, el Service Worker y `setOffline(true)` + recarga en un celular de 360 px: cartel «de las 02:06 del 21/11/2026», `origen: guardado`, los dos pines dentro de la vista con su nombre completo |
| 4. El Semáforo conserva colores, leyenda y nota | Sí | Script paso 4 · captura del Semáforo (escritorio y celular) |
| 5. Ninguna geolocalización nueva y `ubicacion.test.ts` en verde | Sí | Script paso 5 |
| 6. Guía visual con capturas de Playwright de las cinco pantallas, en escritorio y en un celular de 360 px | Sí | [RF-05-guia-visual.md](RF-05-guia-visual.md): 15 capturas |

## 6. Qué quedó afuera y qué se asumió

- **Apilada sobre RF-04:** el PR se abre contra la rama de RF-04. Si se mergea RF-04 a `dev` y se borra su rama, GitHub debería pasar este PR a `dev` solo; si no, hay que cambiarle la base.
- **La ficha del edificio no entra en un celular de 360 px:** esa pantalla ya era más ancha que el celular antes de este cambio (grilla de 340 + 736 px, que mide 1380 px de página en un navegador de 1265). El mapa toma el ancho de la ficha y queda cortado a la derecha, como se ve en las capturas. Arreglar el diseño de esa pantalla no es de esta tarea. El alta de consorcio también desborda por su formulario. Monitoreo, la vista de mapa, el Semáforo y el Mapa del RT sí caben.
- **Los datos guardados del RT están en `localStorage`,** sin cifrar, con nombres, direcciones y teléfonos de los encargados de los edificios pendientes. Se borran al cerrar sesión, pero no si el celular se pierde sin haber cerrado sesión. Hay que decidirlo con el cliente si es un riesgo.
- **Sin conexión no se puede iniciar una inspección:** esa acción sigue necesitando la API.
- **No se probó en un celular físico:** la prueba sin red es en Chromium emulado, con la app compilada y su Service Worker. Para que el navegador tome una versión nueva de la app puede hacer falta recargar dos veces.
- **El modo desarrollo no sirve para probar sin conexión:** `npm run dev` no guarda los módulos de Vite. Hay que usar `npm run build` y `vite preview`.
- **El mapa se vuelve a crear al bajar el mapa para usarlo sin señal,** y por eso el componente vuelve a encuadrar los edificios (corregido en RF-04).
- **Un solo juego de datos guardado:** si dos RT usan el mismo celular, el segundo reemplaza al primero. Se borra al cerrar sesión.
- **Regresión:** la tarea no tiene módulo. Se corrió toda la API, la web y la integración en verde.

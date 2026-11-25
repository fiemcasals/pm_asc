# HU-16 · RF-04 · Entrega — Componente de mapa con pines por estado, zoom y nombres que no se pisan

- **Tarea:** HU-16 / RF-04 — `REQ-1795097971265`
- **Rama:** `feature/hu-16-hu-16-mapa-del-rt-y-llegada-al/req-1795097971265-componente-de-mapa-con-pines-por-estado`
- **Depende de:** HU-16 / RF-03 (`REQ-1795097971049`, el mapa base de CABA), ya integrado en `dev`.
- **Script:** [RF-04-entrega.sh](RF-04-entrega.sh) · **Guía visual con capturas:** [RF-04-guia-visual.md](RF-04-guia-visual.md)
- **Lo usa:** HU-16 / RF-05, que cambia las cinco pantallas al componente nuevo. Hasta entonces el componente no se ve en ninguna pantalla.

## 1. Qué quedó implementado

`MapaEdificios` (`apps/web/src/mapa/MapaEdificios.tsx`) dibuja los edificios sobre el mapa base de CABA propio, con MapLibre GL JS. Recibe los mismos datos que el dibujo anterior (`MapaUbicacionConsorcio`) para poder cambiarlo pantalla por pantalla: marcadores con `id`, `etiqueta`, `color`, `colorNombre` y `subtitulo`; una `ubicacion` única; modo `editable` y `onCambiarUbicacion`; `onSeleccionarMarcador` y `marcadorSeleccionadoId`.

- **Pines en su lugar real:** se ubican por latitud y longitud. El dibujo anterior estiraba el recuadro de CABA (casi cuadrado) sobre un lienzo de 600 × 260 px.
- **Zoom y desplazamiento:** rueda del mouse, botones «+» y «–», arrastre. Al abrirse encuadra a todos los edificios con margen; con uno solo, lo centra a zoom 15.
- **Nombres que no se pisan:** los dibuja MapLibre, que oculta los que se pisan y deja primero los de mayor prioridad (rojo, amarillo, verde y el resto; el seleccionado antes que todos). El pin siempre se ve. Al acercar reaparecen. Si a la derecha del pin el nombre no entra en el mapa, pasa a la izquierda para no quedar cortado.
- **Pines accesibles:** son botones (o imágenes, si no se pueden elegir) con `aria-label` «Nombre. Color: estado», se eligen con clic, Enter o Espacio, y el elegido lleva un aro. El área para tocarlos es de 38 px aunque el círculo mida 18.
- **Tema:** el mapa y los nombres siguen el tema claro u oscuro de la app.
- **Modo editable:** tocar el mapa fija la ubicación (latitud y longitud con 6 decimales), el pin rojo se arrastra para ajustarla, y «Quitar ubicación» la borra.
- **Celular:** ocupa el ancho disponible. En un celular de 360 px, con el mapa descargado y sin red, se ven el mapa base y los pines.

Archivos: `marcadores.ts` (lógica pura), `MapaEdificios.tsx` (componente), `mapa.css` (pines) y `marcadores.test.ts`. `MapaUbicacionConsorcio.tsx` reexporta el tipo `MarcadorMapa`, que ahora vive en `mapa/marcadores.ts`: una sola definición del contrato.

## 2. Cómo se levanta y se prueba

```bash
npm install
npm run mapa:generar      # solo para actualizar el mapa base (~11 MB, necesita internet): ya viene en el repo (HU-16 RF-06)
npm run verify            # tipos + API + web
bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-04-entrega.sh
npm run dev               # y abrir la guía visual
```

## 3. Qué datos hacen falta

Los de demo (`RF-02-datos-demo.sh` de HU-04) y el archivo `caba.pmtiles`.

## 4. Qué endpoints o pantallas toca

Ninguno. Es un componente de la web que todavía ninguna pantalla usa.

## 5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-04-entrega.sh
bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-04-entrega.sh --carga 20
```

Medido el 21/11/2026:

| Qué | Resultado |
|---|---|
| Script | 7 verificaciones OK, 0 omitidas; carga de 20 corridas: 0 fallos, promedio 3359 ms |
| `marcadores.test.ts` | 26 de 26 |
| `npm run verify` | Tipos OK · API 1143/1143 · web 565/565 |
| `npm run build` (web) | Compila, 29 entradas de precache |
| `npm run test:int` | 188/188 |

**Verificación en el navegador** (Playwright, Chromium, con el componente puesto en el Semáforo, el alta de consorcio y el Mapa del RT):

| Condición de aprobación | ¿Cubierta? | Cómo se comprobó |
|---|---|---|
| 1. Mismos datos que el actual, sobre el mapa base propio | Sí | El tipo `MarcadorMapa` es único y las cinco pantallas compilan sin cambiar los datos que pasan (RF-05). Se dibuja sobre `caba.pmtiles`. |
| 2. Pines por latitud y longitud reales, sin distorsión | Sí | `marcadores.test.ts`: 500 m al este y 500 m al norte miden lo mismo en pantalla (error menor al 0,5 %) a zoom 11, 13, 15, 16 y 17. En el navegador, dos edificios a 2.109 m se vieron a 2.120 m (0,52 %) y otros a 8.431 m, a 8.440 m (0,11 %). |
| 3. Zoom, desplazamiento y encuadre | Sí, salvo el pellizco | Rueda del mouse de zoom 11,63 a 17 (el máximo); al abrir, los pines caen dentro del mapa. Arrastrar 120 px a zoom 14 movió el centro 822 m (más que los 459 m exactos por la inercia de MapLibre) sin cambiar el zoom, y la flecha izquierda del teclado también lo mueve. A zoom 11,6 el mapa no se desplaza: CABA entera cabe en pantalla y MapaBase (RF-03) lo limita a CABA. **El pellizco con dos dedos no se probó** (Chromium con mouse). |
| 4. Nombres que no se pisan, rojos primero, y reaparecen | Sí | Con 21 edificios: 21 pines siempre a la vista y entre 4 y 9 nombres según el zoom. Con un rojo a 35 m del verde, sobrevive el nombre del rojo hasta zoom 16,66, donde aparece el del verde. Capturas 1 a 3. |
| 5. Clic o teclado, y `aria-label` «Nombre. Color: estado» | Sí | Enter y Espacio eligen el pin (aro de elegido); etiquetas «DEMO Cabildo 1540. Rojo: pendiente». |
| 6. Sigue el tema claro u oscuro | Sí | Se alternó el tema 4 veces: el mapa cambia y los pines y nombres se mantienen. Captura 4. |
| 7. Editable: tocar fija el punto con 6 decimales, y el pin se arrastra | Sí | Clic: «-34.614858, -58.445432»; arrastre: «-34.614152, -58.444134». Captura 5. |
| 8. Celular de 360 px, con la red cortada | Sí | App compilada con su Service Worker, mapa descargado, `context.setOffline(true)` y recarga: se ve el mapa base, los dos pines con su nombre completo y el cartel de datos guardados. Captura 6. |

## 6. Qué quedó afuera y qué se asumió

- **La prueba sin red es en Chromium emulado,** no en un celular de verdad: no se probó el pellizco con los dedos ni el uso con una sola mano. El gesto de «una mano» sale de no activar los gestos cooperativos de MapLibre (por defecto, no).
- **Tres defectos encontrados al probar en el navegador, ya corregidos:** en tema claro no se dibujaban los nombres; al bajar el mapa para usarlo sin señal, el mapa se volvía a crear y no volvía a encuadrar los edificios; y en el borde derecho el nombre quedaba cortado. Las pruebas automáticas no los detectan, porque dependen del mapa dibujado: por eso la guía visual es parte de la entrega.
- **El ancho del nombre se estima por la cantidad de letras** (6,8 px por letra, tipografía de 12 px) para decidir de qué lado del pin va. Si un nombre es inusualmente ancho, puede quedar apenas cortado.
- **Los nombres que se pisan, MapLibre los oculta con su propia regla** y no la prueba una prueba unitaria: se verificó en el navegador.
- **Los pines son botones HTML** encima del mapa (no una capa de MapLibre), para poder elegirlos con teclado. Con cientos de edificios habría que pasarlos a una capa. El alcance actual es de decenas.
- **`MapaUbicacionConsorcio` sigue en el repositorio** hasta RF-05, que lo retira.
- **El archivo del mapa (`caba.pmtiles`, 10,7 MB) es de RF-03 y desde HU-16 RF-06 va en el repositorio.** Cuando RF-04 se entregó no estaba en git: sin él el mapa salía vacío (o, sin conexión, mostraba «Mapa sin descargar»); hoy, si falta, la app avisa «El mapa no está disponible».
- **Sin geolocalización:** el componente no usa el GPS del dispositivo (lo verifica el script).
- **Regresión:** la tarea no tiene módulo. Se corrió toda la API, la web y la integración en verde.

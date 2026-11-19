# HU-16 / RF-03 · Entrega — Mapa base de CABA propio, que se dibuja sin conexión

- **Tarea:** RF-03 — `REQ-1795097971049`
- **Rama:** `feature/hu-16-hu-16-mapa-del-rt-y-llegada-al/req-1795097971049-mapa-base-de-caba-propio-que-se-dibuja-s`
- **Script del flujo integrado:** [RF-03-entrega.sh](RF-03-entrega.sh)
- **Guía visual:** [RF-03-mapa-sin-conexion.md](RF-03-mapa-sin-conexion.md) — 9 capturas sacadas con Playwright, con el elemento de cada paso resaltado.
- **Depende de:** nada. Destraba «Componente de mapa con pines por estado» (RF-04) y «Usar el mapa nuevo en las pantallas» (RF-05).

## 1. Qué quedó implementado

El mapa de hoy es un dibujo fijo con tres avenidas hechas a mano y no sirve para ubicarse en la calle. El RT trabaja a veces sin wifi y sin señal, así que el mapa nuevo se dibuja desde un archivo **propio**, guardado en el celular. No se usó el servidor de mosaicos de OpenStreetMap porque su política prohíbe bajar los mosaicos para usarlos sin conexión.

- **El archivo del mapa de CABA** (`apps/web/public/mapa/caba.pmtiles`): calles, manzanas, parques, agua y nombres, en formato PMTiles. Pesa **10,67 MB** (zoom 0 a 15, 533 mosaicos) y sale de la compilación `20261118` de Protomaps, con datos de OpenStreetMap. Lo genera `npm run mapa:generar` (~1 minuto, necesita Internet): `scripts/mapa/generar-mapa-caba.mjs` lee la compilación por pedidos de rango —solo baja los mosaicos del recuadro de CABA, no los ~140 GB del planeta—, escribe el archivo y lo vuelve a leer con la misma librería que lo dibuja, comparando un mosaico por zoom con el original. **No va a git** (`.gitignore`).
- **Tipografías e íconos propios** (`apps/web/public/mapa/`, 0,87 MB, sí van a git): `npm run mapa:assets` los baja de un commit fijo de `protomaps/basemaps-assets`. Tipografías Noto Sans bajo SIL OFL; íconos derivados de `tangrams/icons` (MIT).
- **`MapaBase`** (`apps/web/src/mapa/`): el mapa, con MapLibre GL JS. Zoom y desplazamiento, límites en CABA (no deja alejar hasta mostrar el vacío), controles y textos en castellano, atribución «© OpenStreetMap contributors · Protomaps», y sigue el tema claro u oscuro de la app. Sin WebGL, o si falla, lo dice en lugar de dejar un recuadro roto. Un mapa dentro de una página que se desplaza puede usar `gestosCooperativos` (Ctrl + rueda, o dos dedos).
- **Descarga** (`ControlDescargaMapa`): «Descargar mapa para usar sin señal», con barra de avance y **Cancelar**. Guarda el archivo en la caché del navegador y anota la versión (el ETag que informa el servidor). Avisa cuando hay una versión más nueva. La versión nueva se guarda aparte y reemplaza a la anterior recién cuando terminó de bajar y se comprobó que es un PMTiles; si se corta, el mapa que ya había sigue sirviendo.
- **Qué lee el mapa:** con el mapa guardado, lo lee del celular, sin red. Sin guardar pero con red, lee los mosaicos del servidor de la app a medida que hacen falta. Sin red y sin mapa guardado, dice «Mapa sin descargar: conectate a una red para bajarlo», y al volver la conexión se dibuja solo.
- **PWA:** el service worker precachea el worker de MapLibre, las tipografías y los íconos (29 entradas, 3,6 MiB), pero **no** el archivo de CABA, que se baja a pedido.
- **Dónde se ve:** Estado del sistema › «Mapa de CABA para usar sin señal». Los mapas de las demás pantallas siguen siendo el dibujo anterior hasta RF-05.

## 2. Cómo se levanta y cómo se prueba

```bash
npm install
npm run mapa:generar        # una vez: arma apps/web/public/mapa/caba.pmtiles
npm run db:up && npm run dev
```

Para probar **sin conexión de verdad** hace falta la app compilada (el service worker de desarrollo no guarda la app entera): `npm run build -w apps/web`, `npm run preview -w apps/web` y entrar a https://localhost:4173.

| Prueba | Resultado (19/11/2026) |
|---|---|
| `npm run verify` | Tipos OK. API: 1143 en verde. Web: 539 en verde, **24 nuevos** (`apps/web/src/mapa/`: estilo, fuente del archivo y descarga) |
| `bash docs/pruebas/hu-16-…/RF-03-entrega.sh` | 11 verificaciones, 11 OK: el archivo (10,67 MB, MVT, zoom 0 a 15, recuadro de CABA, compilación de origen, atribución), lo que entrega la app (rangos con HTTP 206, 9 tipografías y 8 archivos de íconos con HTTP 200) y los tests del mapa |
| `… RF-03-entrega.sh --carga 100` | 100 pedidos de 16 KB al azar dentro del archivo, 0 fallidos · promedio 187 ms · p95 233 ms (casi todo es el costo de arrancar `curl` con TLS) |
| El estilo no pide nada a terceros | Un test comprueba que todas las URLs del estilo son de la app o `pmtiles://`, y que las 3 tipografías y los 2 juegos de íconos que usa están en `public/mapa/` |
| Navegador (Playwright), con la app compilada | Descarga con avance → «Mapa guardado»; **con la red cortada y la página recargada, el mapa se dibuja completo** con calles y nombres hasta el zoom 15,9; sin red y sin mapa, el aviso; al volver la red, se dibuja solo; versión nueva → «Actualizar el mapa»; tema claro y oscuro; celular de 360 px |
| `npm run mapa:generar` | 533 mosaicos, 10,67 MB, 16 mosaicos releídos e idénticos al original |

## 3. Qué datos hacen falta

- El archivo de CABA: `npm run mapa:generar`. Tipografías e íconos ya están en el repo (`npm run mapa:assets` solo para actualizarlos).
- Un usuario que pueda abrir «Estado del sistema»: se probó con `admin` / `Admin-Desarrollo-2026`.

## 4. Endpoints o pantallas

- **Pantalla:** Estado del sistema › «Mapa de CABA para usar sin señal».
- **API:** ninguno nuevo. La app entrega archivos estáticos: `/mapa/caba.pmtiles` (por rangos), `/mapa/fuentes/…` y `/mapa/sprites/…`.

## 4.5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-03-entrega.sh               # el archivo, lo que entrega la app y el estilo
bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-03-entrega.sh --regenerar   # antes, vuelve a generar el mapa
bash docs/pruebas/hu-16-hu-16-mapa-del-rt-y-llegada-al/RF-03-entrega.sh --carga 100   # además, mide el servidor
```

Lo que se ve en el navegador —descarga, sin conexión, versión nueva— se recorre con [RF-03-mapa-sin-conexion.md](RF-03-mapa-sin-conexion.md).

## 5. Qué quedó afuera y qué se asumió

- **El archivo no está en git.** Pesa 10,7 MB y se regenera con un comando. Quien clone el repo, y el despliegue a producción, tienen que correr `npm run mapa:generar` (o copiar el archivo) antes de compilar. Si falta, la descarga lo rechaza con «falta generarlo con npm run mapa:generar» (hay un test); el mapa en línea sin el archivo no se probó.
- **Se cambió una condición de la tarea.** Decía «con `pmtiles extract`». En este entorno no se pudo bajar y ejecutar esa herramienta, así que el generador es un script propio en Node que hace lo mismo con la librería `pmtiles` y evita que cada desarrollador dependa de un ejecutable. La condición se reescribió sin nombrar la herramienta; lo que exige (recuadro de CABA, zoom 15 o menos, compilación con fecha, sin terceros) se cumple igual.
- **Solo se probó en Chromium** (Playwright, escritorio y una ventana de 360 px). **No se probó en un celular Android real** ni en Safari. El celular del cliente es Android, así que conviene una prueba ahí antes de darlo por cerrado. Sin WebGL el mapa muestra un aviso.
- **Tipografías: solo los rangos latinos** (`0-255`, `256-511`, `8192-8447`), que cubren el castellano. Un nombre con otro alfabeto se dibujaría sin esos caracteres.
- **El archivo llega hasta el zoom 15.** Más cerca (hasta el 17) se agranda el mosaico del 15: sirve para ubicarse, no agrega calles ni números.
- **Los datos del mapa quedan en la compilación `20261118`.** Actualizarlos es volver a correr `npm run mapa:generar`; los celulares avisan que hay una versión nueva.
- **Quedan por hacer los pines y las demás pantallas.** Esta tarea no dibuja edificios: eso es RF-04, y cambiar las 5 pantallas es RF-05.
- **El navegador puede borrar lo guardado** si el celular se queda sin espacio. La app lo detecta (la nota de versión sin el archivo cuenta como «no descargado») y vuelve a ofrecer la descarga.
- **Dos cosas que vi una vez y no pude reproducir.** En una prueba el mapa apareció guardado sin que se apretara el botón; y otra vez el zoom pasó de 11 a 15,4 sin que se tocara el mapa. Repetí el flujo desde cero varias veces y la descarga solo ocurre al apretar el botón, y el zoom se mantiene estable. Por las dudas, este panel usa gestos cooperativos para que la rueda del mouse no acerque el mapa sin querer.
- **Peso de la app:** MapLibre (1,1 MB, 305 KB comprimido) es un archivo aparte que se baja recién cuando se abre un mapa.

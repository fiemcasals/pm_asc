# HU-16 · RF-02 — Tarjeta del edificio y validación de presencia a 30 m

**Qué hace.** Al tocar un pin del mapa del RT se abre la **tarjeta del edificio** (dirección, estado, encargado y horarios, con «Llamar» y «Cómo llegar»). Los botones **«Iniciar Inspección»** y **«No se pudo realizar la inspección»** aparecen recién cuando el RT está a **30 m o menos** del edificio. Si el GPS no tiene precisión suficiente aparece **«Sin buena señal GPS»**, que exige foto del frente y una justificación escrita y deja la visita para revisión de la Secretaría.

Capturas a 360 px: `imagenes/RF-02-tarjeta-a-menos-de-30-m.png` e `imagenes/RF-02-sin-buena-senal-gps.png`.

## La tarjeta

| Elemento | Comportamiento |
|---|---|
| Dirección, estado, encargado, horarios | El estado es el de ahora (Abierto ahora / Cerrado / A coordinar); el encargado con su teléfono; los horarios por día (o «A coordinar»). |
| **📞 Llamar al encargado** | Enlace `tel:` con el teléfono del encargado (abre el marcador del celular). Sin teléfono utilizable no se muestra. |
| **🧭 Cómo llegar** | Abre Google Maps con destino en el edificio (por su punto en el mapa; si no tiene, por su dirección). |
| **Verificar que estoy en el edificio** | Toma la ubicación **una sola vez**, al tocar (sin seguimiento), y la compara con el punto del edificio. |

## La regla de presencia (la misma en la pantalla y en la API; la que decide es la API)

| Lectura de GPS | Qué pasa |
|---|---|
| Buena señal (precisión ≤ 30 m) y **a 30 m o menos** (el borde cuenta) | Aparecen **Iniciar Inspección** y **No se pudo realizar la inspección**. |
| Buena señal y a más de 30 m | «Estás a 120 m del edificio: acercate a 30 m o menos…». No aparecen los botones. La API rechaza con 409. |
| Precisión peor que 30 m, **o** el edificio no tiene punto en el mapa | **«Sin buena señal GPS»**: pide la foto del frente y una justificación (al menos 10 caracteres). Recién con las dos aparecen los botones. La visita queda **pendiente de revisión** de la Secretaría. |

## API

| Acción | Endpoint | Quién |
|---|---|---|
| Iniciar la inspección: `{ consorcioId, gps: { latitud, longitud, precision, timestamp }, horaDispositivo, fotoFrenteUrl?, justificacion? }` | `POST /api/inicios-inspeccion` | RT de Calle del edificio |
| Ver los inicios (`?revision=pendiente` = por revisar) | `GET /api/inicios-inspeccion` | Secretaría, Administrador |
| Marcar la visita como revisada | `POST /api/inicios-inspeccion/:id/revisar` | Secretaría, Administrador |

- **La distancia la mide la API** contra el punto PostGIS del edificio; lo que mande el celular sobre distancia o «sin buena señal» se ignora. A más de 30 m con buena señal → **409** con la distancia. Sin buena señal sin foto o justificación → **400** que dice qué falta.
- La ubicación tiene que ser **reciente** (hasta 5 minutos antes de la hora del dispositivo): si no, 400 «volvé a verificar».
- **Se registran** coordenadas, precisión, distancia medida, **hora del dispositivo** y **hora del servidor** (la pone la API), y el usuario de la sesión. **Nada se edita**: no hay PUT/PATCH/DELETE y la base lo impide con un disparador para el rol de la aplicación (sólo cambia la revisión). Migración `026_inicios_inspeccion` con RLS (el RT sólo inserta y ve los edificios que tiene asignados).
- `GET /api/rt/mapa` ahora trae por edificio el `encargado` y las reglas `presencia` (`radioM`, `precisionMaxM`) que usa la pantalla. La precisión máxima se configura con `GPS_PRECISION_MAX_M` (por defecto 30).
- «Iniciar Inspección» registra el inicio y pasa a la pantalla de inspección del edificio (con sus equipos y pisos). «No se pudo realizar la inspección» abre la constancia de visita fallida (HU-07 RF-06).

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-16-hu-16-mapa-del-rt/RF-02-entrega.sh
```

El script crea dos RT y un edificio temporales y los borra. Pruebas automáticas: `inicios.spec.ts` (distancia y bordes), `inicios.e2e-spec.ts` (roles reales), `inicios.int-spec.ts` (PostgreSQL real: PostGIS, RLS, disparador, CHECK) y `apps/web/src/rtmapa/tarjeta.test.ts`. Se verificaron con 20 mutaciones (iniciar a más de 30 m, borde de 30 m, precisión en el máximo, sin exigir foto, justificación de 1 caracter, sin revisión, confiar en la distancia del celular, sin control de ubicación vieja, roles equivocados, edificio sin punto dado por verificado, distancia sin coseno, «Cómo llegar» con las coordenadas al revés, teléfono sin «+», etc.): todas hacen fallar algún test. La tarjeta se recorrió en el navegador a 360 px con GPS simulado (a 200 m, a 28 m y con 80 m de precisión) hasta pasar a la inspección.

## ⚠️ A revisar con el cliente / legal

- **Aviso de ubicación (Ley 25.326).** El aviso vigente dice que la ubicación se toma «una sola vez, al tocar “Iniciar Inspección” o “No se pudo realizar la inspección”». Para que los botones aparezcan a 30 m hace falta leer la ubicación **antes** de mostrarlos. Se resolvió con un botón **«Verificar que estoy en el edificio»**: una lectura por toque, sin seguimiento, con el mismo motivo `inicio-inspeccion` (es el primer paso de iniciar una inspección). Conviene que el cliente y su asesor legal confirmen que alcanza o ajusten el texto del aviso (y su versión).
- **«Precisión suficiente».** El cliente no dio el número: se tomó 30 m (el mismo radio), configurable con `GPS_PRECISION_MAX_M`.
- Un edificio sin punto en el mapa se trata como «Sin buena señal GPS» (no se puede verificar), con revisión de la Secretaría.

## Limitaciones

- La Secretaría puede ver y marcar como revisadas las visitas pendientes por API; no hay todavía una pantalla de revisión.
- El inicio no queda vinculado a la inspección que se carga después (HU-17): son dos registros del mismo edificio y día.
- «Cómo llegar» y «Llamar» dependen de que el celular tenga Google Maps y un marcador (los enlaces estándar los resuelven).

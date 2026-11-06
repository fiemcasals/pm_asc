# HU-01 · RNF-01 · Entrega — Rechazar con 400 los textos que la base no puede guardar

- **Tarea:** HU-01 / RNF-01 — `REQ-1793979090598`
- **Rama:** `feature/hu-01-hu-01-gestion-y-alta-de-eca-y/req-1793979090598-rechazar-con-400-los-textos-que-la-base`
- **Depende de:** HU-01 RF-01 (`REQ-1791909582859`), ya integrada y certificada
- **Origen:** hallazgo de QA sobre HU-01 RF-01: un carácter NUL (`\u0000`) en un texto devolvía 500
- **Script del flujo integrado:** [RNF-01-entrega.sh](RNF-01-entrega.sh)
- **Guía visual:** no corresponde. Es un cambio sin pantallas: la evidencia es la salida de las corridas automáticas y del script.

## 1. Qué quedó implementado

**El problema.** PostgreSQL no puede guardar el byte `0x00` en una columna de texto. La validación de `/api/consorcios` no lo conocía, así que el texto llegaba a la base, la base lo rechazaba con `invalid byte sequence for encoding "UTF8": 0x00` y el cliente recibía un `500 Internal server error` aunque el error era de sus datos.

**La solución.** Un **filtro de errores global** (`apps/api/src/database/database-error.filter.ts`), registrado en `configureApp` (`apps/api/src/app.setup.ts`), por lo que cubre **todos los endpoints** presentes y futuros, no sólo los de consorcios:

- Traduce a **HTTP 400** los errores de PostgreSQL con SQLSTATE `22021` (carácter fuera del repertorio: el NUL o una secuencia UTF-8 inválida) y `22P05` (carácter no traducible).
- La respuesta tiene el mismo formato que el resto de las validaciones: `{ "message": "Datos inválidos", "errores": ["El contenido enviado incluye caracteres que no se pueden guardar, como el carácter nulo (U+0000). Revisá los textos y volvé a enviar."] }`.
- **El texto de PostgreSQL no sale en la respuesta.** El error real queda en el log de la API, una línea por rechazo: `WARN [TextoInvalidoFilter] Texto con codificación inválida rechazado (SQLSTATE 22021): invalid byte sequence for encoding "UTF8": 0x00`.
- **Todo lo demás sigue igual:** los `HttpException` conservan su código, y cualquier otro error (base caída, tabla inexistente, un error común) sigue siendo `500`.

No se tocó ningún módulo de negocio ni ninguna migración.

## 2. Cómo se levanta y se prueba

Igual que RO-01 y HU-01 RF-01 (`npm install`, `npm run db:up`, `npm run dev`). Prueba a mano:

```bash
# 400 con message y errores (el \u0000 va escrito como texto dentro del JSON)
printf '%s' '{"nombre":"con nulo \u0000 adentro","direccion":"Calle 1"}' > /tmp/nul.json
curl -s -X POST http://127.0.0.1:3050/api/consorcios -H 'Content-Type: application/json' --data-binary @/tmp/nul.json
```

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run verify` | Tipos OK. API: **122 tests, 122 en verde** (Jest; 15 nuevos: `database-error.filter.spec` 4 y `texto-invalido.e2e-spec` 11). Web: 49 en verde |
| `npm run test:int` (con `npm run db:up`) | **12 tests, 12 en verde** contra PostGIS real: los 7 anteriores y 5 nuevos (`texto-invalido.int-spec`) |
| `BASE_URL=http://127.0.0.1:3050 bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RNF-01-entrega.sh` | 4 verificaciones, 4 OK. No deja filas |
| `… RNF-01-entrega.sh --carga 200` | 200 envíos con NUL, 0 fallidos (todos 400) · promedio 58 ms · p95 77 ms · el más lento 88 ms (06/11/2026, máquina de desarrollo con Windows 11, API compilada con `node dist/main.js`) |

**Comprobado que las pruebas miden lo que dicen:** con el registro del filtro sacado de `app.setup.ts`, `texto-invalido.e2e-spec` falla **5 de 11** (los de las condiciones 1, 2 y 3) y `texto-invalido.int-spec` contra PostgreSQL real falla **4 de 5**, todos con `Expected: 400, Received: 500`. Con el filtro vuelven a pasar todos. Los que pasan con o sin el filtro son los de la condición 4 y los de "lo que ya funcionaba", que es lo esperado.

Las pruebas de `desarrollo` (e2e) corren **aisladas**, con un repositorio en memoria que lanza el error de PostgreSQL. Las de integración usan la base real.

## 3. Qué datos hacen falta

Ninguno previo. El script crea un consorcio de prueba (`RNF01-entrega-<pid>`) y lo borra al terminar; `texto-invalido.int-spec` borra los suyos (`RNF01-int…`).

## 4. Endpoints y pantallas

Ninguno nuevo. El filtro actúa sobre **todos** los existentes: hoy lo ejercitan `POST` y `PUT /api/consorcios`; los módulos de ECA y de visitas fallidas también escriben en la base y quedan cubiertos por el mismo filtro, aunque en esta tarea no se probó cada uno por separado.

## 4.5. Cómo se corre integrado

Con `npm run db:up` y `npm run dev` (o sólo la API) levantados:

```bash
bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RNF-01-entrega.sh              # condiciones 1, 2 y 3 (respuesta)
bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RNF-01-entrega.sh --carga 200  # 200 envíos con NUL, con tiempos
```

Con la web levantada la URL por defecto es `https://localhost:8050`; sin ella, `BASE_URL=http://127.0.0.1:3050`.

**Lo que el script no puede ver** (se hace a mano, y se hizo):

- **Condición 3, el log:** en la terminal donde corre la API, cada rechazo deja una línea `WARN [TextoInvalidoFilter] … (SQLSTATE 22021)`. Tras la corrida de 200 hubo 202 líneas: 2 del recorrido normal y 200 de la carga.
- **Condición 4, con la base caída de verdad:**
  ```bash
  docker stop mant-asc-db
  curl -s -X POST http://127.0.0.1:3050/api/consorcios -H 'Content-Type: application/json' -d '{"nombre":"x","direccion":"y"}'   # 500
  curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3050/api/health                                                       # 503
  docker start mant-asc-db
  ```
  Resultado: el alta válida y la que lleva NUL dieron **500** `{"statusCode":500,"message":"Internal server error"}`, `/api/health` dio 503, y al levantar la base volvió a 200.

## 5. Qué quedó afuera y qué se asumió

- **No se agregó una validación del NUL en `consorcio.validation.ts`.** La decisión fue resolverlo con el filtro global y no campo por campo. La consecuencia: el mensaje es **uno solo y no dice qué campo** tiene el carácter. Si más adelante hace falta señalar el campo, se suma esa validación encima del filtro, que queda como red de contención.
- **La lista de códigos es deliberadamente corta** (`22021` y `22P05`). Otros errores de datos, como `22003` (número fuera de rango), siguen siendo 500 porque podrían ser un error de programación nuestro y un 400 lo escondería. Si aparece otro código que sea claramente un dato inválido del cliente, se agrega a `SQLSTATE_TEXTO_INVALIDO`.
- **El mensaje de error está en español y es único**, sin traducción ni código de error estructurado.
- **No se probó cada endpoint de otros módulos** (ECA, visitas fallidas, WhatsApp) con un NUL: el filtro es global y se probó con consorcios, que es donde se encontró el defecto.
- **No se limpian ni se normalizan los textos:** un NUL se rechaza, no se elimina en silencio.
- **Regresión:** esta tarea no pertenece a ningún módulo (`moduleId` vacío). Se corrió la batería completa: 122 de API y 49 de web en verde, y 12 de integración en verde, incluidos los 7 de HU-01 RF-01 y RO-01. Con la base caída, `/api/health` siguió respondiendo 503 como antes.

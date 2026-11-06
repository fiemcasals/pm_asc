# HU-10 · RF-03 · Entrega — Registrar el acuse de recibo legal sólo si quedó guardado en la base

- **Tarea:** HU-10 / RF-03 — `REQ-1793980587652`
- **Rama:** `feature/hu-10-hu-10-centro-de-alertas-critic/req-1793980587652-registrar-el-acuse-de-recibo-legal-solo`
- **Depende de:** HU-10 RF-02 (`REQ-1791910396729`), que construyó el acuse; y del filtro de HU-01 RNF-01 (`REQ-1793979090598`), que traduce el NUL a 400
- **Origen:** hallazgo de QA al certificar HU-01 RNF-01
- **Script del flujo integrado:** [RF-03-entrega.sh](RF-03-entrega.sh)
- **Guía visual:** no corresponde. Es un cambio de API sin pantallas nuevas: la evidencia es la salida de las corridas automáticas y del script.

## 1. Qué quedó implementado

**El problema.** `EcaService.registrarAcuseRecibo` (`apps/api/src/eca/eca.service.ts`) hacía dos cosas mal:

1. Marcaba el acuse en memoria (`alertaCritica.acuseRecibo`) **antes** de guardarlo.
2. Envolvía el `INSERT` en un `try/catch` vacío, que se tragaba cualquier error de la base.

Resultado: si la base fallaba (caída, o un texto que no puede guardar, como un carácter NUL), la API respondía `201 { ok: true, "Acuse de recibo legal registrado exitosamente" }`, la alerta mostraba el acuse y `acuses_recibo_legal` quedaba **sin la fila**. Es el registro legal con el que la ECA acusa recibo de una falla crítica, y el sistema afirmaba tenerlo sin tenerlo.

**La solución** (24 líneas en un solo archivo de código):

- **Con base de datos, se guarda primero** y recién después se marca en memoria. Si el `INSERT` falla, **el error sube**: no queda nada marcado y quien llama se entera.
- Los errores salen por el camino de siempre: un texto que la base no puede guardar sale como **400** `{ message: "Datos inválidos", errores }` por el filtro global de RNF-01, y cualquier otro error de base (caída, etc.) como **500** genérico.
- **El remito sigue el mismo camino.** `GET /api/eca/remito/:alertaId` registra el acuse al descargarse; si el acuse no se puede guardar, el remito **no se entrega**.
- **Sin base configurada** (servicio creado sin `DatabaseService`, como en las pruebas unitarias) el acuse queda sólo en memoria, como hasta ahora.

No se tocó la web: `AlertasCriticas.tsx` ya marca el acuse como registrado **sólo** si la API responde bien; ante un error muestra el mensaje de la API ("No se pudo descargar el remito de notificación").

## 2. Cómo se levanta y se prueba

Igual que RO-01 (`npm install`, `npm run db:up`, `npm run dev`). Prueba a mano contra la API:

```bash
# Acuse válido: 201, queda 1 fila y la alerta lo muestra
curl -s -X POST http://127.0.0.1:3050/api/eca/alertas/ALT-CP-001/acuse -H 'Content-Type: application/json' -d '{"usuario":"qa.valido"}'
curl -s http://127.0.0.1:3050/api/eca/alertas          # ECA por defecto: Conservación Porteña
# Con un NUL en usuario: 400 (el \u0000 va escrito como texto dentro del JSON)
printf '%s' '{"usuario":"con \u0000 nulo"}' > /tmp/nul.json
curl -s -X POST http://127.0.0.1:3050/api/eca/alertas/ALT-MAICON-002/acuse -H 'Content-Type: application/json' --data-binary @/tmp/nul.json
```

Alertas disponibles: `ALT-CP-001` (Conservación Porteña), `ALT-MAICON-001` y `ALT-MAICON-002` (MAICON Mantenimiento; se consultan con `?eca=maicon`).

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run verify` | Tipos OK. API: **135 tests, 135 en verde** (Jest; 13 nuevos: `eca-acuse.spec` 6 y `acuse-persistencia.e2e-spec` 7). Web: 49 en verde |
| `npm run test:int` (con `npm run db:up`) | **16 tests, 16 en verde** contra PostGIS real: los 12 anteriores y 4 nuevos (`acuse-persistencia.int-spec`) |
| `BASE_URL=http://127.0.0.1:3050 bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-03-entrega.sh` | 5 verificaciones, 5 OK. No deja filas |
| `… RF-03-entrega.sh --carga 100` | 100 acuses válidos, 0 fallidos · **100 de 100 filas guardadas** · promedio 55 ms · p95 69 ms · el más lento 80 ms (06/11/2026, máquina de desarrollo con Windows 11, API compilada con `node dist/main.js`) |

**Comprobado que las pruebas miden lo que dicen.** Con el código **sin arreglar**: `eca-acuse.spec` + `acuse-persistencia.e2e-spec` fallan **8 de 13** (el orden de guardado, el error que sube, el 500, el 400, el remito con la base caída) y `acuse-persistencia.int-spec` contra PostgreSQL real falla **2 de 4**: el acuse con NUL respondía `Expected 400, Received 201` y el remito `Expected 400, Received 200`. Los que pasan con o sin arreglo son los de lo que **ya funcionaba**: el acuse válido, el 404, el modo sin base y el remito con la base sana. Con el arreglo pasan todos.

Las pruebas de `desarrollo` (e2e y unitarias) son **aisladas**: una base simulada que registra las consultas y falla a pedido. Para eso se extendió `fakeDatabase` en `apps/api/test/create-test-app.ts` con un `query` que registra y puede fallar; el cambio es aditivo y no altera las pruebas existentes.

## 3. Qué datos hacen falta

Ninguno previo. Las alertas son datos de ejemplo del módulo del firmante. El script y `acuse-persistencia.int-spec` crean filas con usuario `RF03-entrega-…` / `RF03-int…` y las borran al terminar.

## 4. Endpoints y pantallas

Ningún endpoint nuevo. Cambia el comportamiento ante fallas de `POST /api/eca/alertas/:alertaId/acuse` y de `GET /api/eca/remito/:alertaId` (y su vista `…/informe`, que usa el mismo camino). Ninguna pantalla.

## 4.5. Cómo se corre integrado

Con `npm run db:up` y `npm run dev` (o sólo la API) levantados:

```bash
bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-03-entrega.sh              # condiciones 2, 3 y 4 (NUL y remito)
bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-03-entrega.sh --carga 100  # 100 acuses válidos, con tiempos y filas
```

Con la web levantada la URL por defecto es `https://localhost:8050`; sin ella, `BASE_URL=http://127.0.0.1:3050`. Para verificar la fila en `acuses_recibo_legal` el script usa `docker exec mant-asc-db psql …`; sin docker lo avisa y no cuenta ese paso.

**Lo que el script no hace** (apaga la base; se hace a mano, y se hizo, con `ALT-MAICON-001`):

```bash
docker stop mant-asc-db
curl -s -X POST http://127.0.0.1:3050/api/eca/alertas/ALT-MAICON-001/acuse -H 'Content-Type: application/json' -d '{"usuario":"x"}'   # 500
curl -s -i http://127.0.0.1:3050/api/eca/remito/ALT-MAICON-001                                                                      # 500, sin content-disposition
curl -s 'http://127.0.0.1:3050/api/eca/alertas?eca=maicon'      # ALT-MAICON-001 sigue sin acuseRecibo
docker start mant-asc-db
```

Resultado: **condición 1** → `POST` HTTP 500 `{"statusCode":500,"message":"Internal server error"}` y la alerta sigue sin acuse. **Condición 4** → `GET` del remito HTTP 500, 0 encabezados `content-disposition` y la alerta sigue sin acuse. `/api/health` dio 503. Al levantar la base, el mismo `POST` dio 201, la alerta mostró el acuse y quedó 1 fila.

## 5. Qué quedó afuera y qué se asumió

- **Si no se puede guardar el acuse, el remito no se entrega.** Se decidió por coherencia con HU-10 RF-02, cuya condición 2 dice que *al descargarse el remito el sistema registra el acuse*: entregar el remito sin acuse rompería esa cadena. Con la base caída, la descarga falla con 500 hasta que vuelva.
- **No hay reintento automático ni cola.** Un 500 significa "volvé a intentarlo". El reintento manual funciona sin estados a medias.
- **El acuse guardado en la base no se vuelve a leer.** Ningún código del proyecto consulta `acuses_recibo_legal` (se verificó buscando la tabla en el código): `GET /api/eca/alertas` informa el acuse desde la memoria del servicio. Por lectura del código, al **reiniciar la API** la alerta vuelve a mostrarse sin acuse aunque la fila siga en la tabla; no se probó reiniciando. No es parte de esta tarjeta, pero conviene resolverlo en otra.
- **Cada `POST` inserta una fila nueva.** No hay restricción de unicidad por alerta: acusar dos veces la misma alerta deja dos filas. Es el comportamiento previo y no se cambió.
- **El mensaje del 400 por NUL es el único del filtro global** y no dice en qué campo está el carácter (decisión de RNF-01).
- **Hallazgo en otro módulo, no corregido acá (HU-07 RF-01, visitas fallidas).** `visitas-fallidas.service.ts` (línea 123) también guarda dentro de un `try/catch` que descarta el error (lo deja a nivel `debug`, "continuando en memoria"), y su `INSERT` **no puede funcionar nunca**: escribe en `acuses_recibo_legal` una columna `metadata` que no existe y omite `maquina_id`, `eca` y `tipo_alerta`, que son `NOT NULL`. Se comprobó ejecutando ese `INSERT` contra la base: `ERROR: column "metadata" of relation "acuses_recibo_legal" does not exist`. Resultado: las visitas fallidas sólo viven en memoria y se pierden al reiniciar. Pide su propia tarjeta. No se auditaron los demás módulos (WhatsApp, firmante).
- **Regresión:** esta tarjeta no pertenece a ningún módulo (`moduleId` vacío). Se corrió la batería completa: 135 de API y 49 de web en verde, y 16 de integración en verde, incluidos los de RO-01, HU-01 RF-01 y RNF-01.

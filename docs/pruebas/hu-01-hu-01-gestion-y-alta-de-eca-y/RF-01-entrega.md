# HU-01 · RF-01 · Entrega — API y Modelo de Datos de Consorcios y Máquinas

- **Tarea:** HU-01 / RF-01 — `REQ-1791909582859`
- **Rama:** `feature/hu-01-hu-01-gestion-y-alta-de-eca-y/req-1791909582859-api-y-modelo-de-datos-de-consorcios-y-ma`
- **Depende de:** RO-01 (`REQ-1791560828605`), ya integrado en `dev`
- **Script del flujo integrado:** [RF-01-entrega.sh](RF-01-entrega.sh)
- **Guía visual:** no corresponde. Esta tarea es sólo API, sin pantallas que fotografiar. La evidencia es la salida de las corridas automáticas y del script. La pantalla de carga es RF-02 de esta Historia.

## 1. Qué quedó implementado

1. **Modelo relacional** en PostgreSQL: tablas `consorcios` y `maquinas` (una máquina pertenece a un consorcio; borrar el consorcio borra sus máquinas).
2. **Sistema de migraciones** (RO-01 dejó esa decisión a esta tarea): SQL plano versionado en `apps/api/src/database/migrations.ts` y un aplicador (`migrator.ts`) que corre las pendientes **al arrancar la API**, cada una en su transacción, con un lock para que dos instancias no migren a la vez. Registra lo aplicado en `schema_migrations`; correrlo de nuevo no hace nada.
3. **Endpoints** bajo `/api/consorcios` (CRUD completo):

| Método | Ruta | Qué hace | Respuestas |
|---|---|---|---|
| `POST` | `/api/consorcios` | Registra un consorcio con sus máquinas y referencias AGC. Devuelve la ficha creada | `201` · `400` con `errores` si el cuerpo es inválido · `409` si la base rechaza una referencia repetida |
| `GET` | `/api/consorcios` | Listado: `id`, `nombre`, `direccion`, `cantidadMaquinas` | `200` |
| `GET` | `/api/consorcios/:id` | Ficha completa: dirección, administración y máquinas | `200` · `404` (no existe o el id no es un UUID) |
| `PUT` | `/api/consorcios/:id` | Reemplaza los datos y la lista **completa** de máquinas | `200` · `400` · `404` · `409` |
| `DELETE` | `/api/consorcios/:id` | Borra el consorcio y sus máquinas | `204` · `404` |

Cuerpo de `POST` / `PUT` (sólo `nombre` y `direccion` son obligatorios):

```json
{
  "nombre": "Consorcio Av. Rivadavia 1234",
  "direccion": "Av. Rivadavia 1234, CABA",
  "administracion": { "nombre": "Administración Pérez", "telefono": "11 4444-5555", "email": "admin@perez.com" },
  "maquinas": [
    { "referenciaAgc": "M1", "descripcion": "Derecha" },
    { "referenciaAgc": "M2", "descripcion": "Izquierda" }
  ]
}
```

Reglas de validación (se informan **todas juntas** en `errores`): `nombre` ≤ 200 caracteres, `direccion` ≤ 300, `administracion.email` con forma de email, `referenciaAgc` obligatoria (≤ 20), hasta 50 máquinas por consorcio. La referencia se guarda en **mayúsculas** (`m1` → `M1`) y **no puede repetirse dentro del mismo edificio** (sí en edificios distintos). Las máquinas se devuelven en orden natural: `M1, M2, M10`.

## 2. Cómo se levanta y se prueba

Requisitos y variables: los de RO-01 (ver su [entrega](../ro-01-ro-01-setup-del-proyecto-y-ent/RF-01-entrega.md)). No hace falta ningún paso nuevo: al hacer `npm run dev` la API migra sola.

```bash
npm install
npm run db:up          # PostgreSQL + PostGIS en 127.0.0.1:5433
npm run dev            # API :3050 (migra al arrancar) + web https://localhost:8050
```

Ejemplo a mano (sin la web: `http://127.0.0.1:3050`, con la web: `https://localhost:8050`):

```bash
curl -s -X POST http://127.0.0.1:3050/api/consorcios -H 'Content-Type: application/json' \
  -d '{"nombre":"Edificio Sur","direccion":"Calle 1","maquinas":[{"referenciaAgc":"M1","descripcion":"Derecha"}]}'
curl -s http://127.0.0.1:3050/api/consorcios/<id>
```

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run verify` | Tipos OK. API: **36 tests, 36 en verde** (Jest: los 15 de RO-01 más 21 nuevos: `consorcio.validation.spec` 8 y `consorcios.e2e-spec` 13). Web: 4 en verde |
| `npm run test:int` (con `npm run db:up`) | **7 tests, 7 en verde** contra PostGIS real: el de health de RO-01 y 6 nuevos (`consorcios.int-spec`): migraciones registradas e idempotentes, alta y ficha en las tablas, orden `M1, M2, M10`, referencia repetida rechazada por la base (`23505`), `PUT`, borrado en cascada |
| `BASE_URL=http://127.0.0.1:3050 bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-01-entrega.sh` | 5 verificaciones, 5 OK. No deja filas en la base |
| `… RF-01-entrega.sh --carga 200` | 200 recorridos (alta + consulta + borrado), 0 fallidos · promedio 283 ms · p95 320 ms · el más lento 357 ms (06/11/2026, máquina de desarrollo con Windows 11, API compilada con `node dist/main.js`) |

Las pruebas de `desarrollo` (e2e) corren **aisladas**, con un repositorio en memoria y datos fijos. Las de integración usan la base real.

## 3. Qué datos hacen falta

Ninguno previo. La migración crea las tablas vacías. El script y `consorcios.int-spec` crean sus propios datos (`RF01-entrega-…` / `Int-test …`) y los borran.

## 4. Endpoints y pantallas

Sólo los cinco endpoints de la tabla de arriba. No toca ninguna pantalla.

## 4.5. Cómo se corre integrado

Con `npm run db:up` y `npm run dev` (o sólo la API) levantados:

```bash
bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-01-entrega.sh              # las 2 condiciones, 5 verificaciones
bash docs/pruebas/hu-01-hu-01-gestion-y-alta-de-eca-y/RF-01-entrega.sh --carga 200  # alta + consulta + borrado, 200 veces, con tiempos
```

Con la web levantada la URL por defecto es `https://localhost:8050` (requiere `npm run certs` y `mkcert -install`); sin ella, `BASE_URL=http://127.0.0.1:3050`.

## 5. Qué quedó afuera y qué se asumió

- **"Consorcio" y "Edificio" son la misma entidad.** La descripción de la tarea nombra `Consorcios, Edificios y Máquinas`, pero los criterios hablan de "la ficha del edificio" en `GET /api/consorcios/:id`. Se modeló un único `consorcios` (el edificio con su dirección y administración). Si más adelante hace falta separarlos, es una migración nueva.
- **La ECA no está en este modelo.** El título de la Historia dice "ECA y Máquinas", pero esta tarea describe sólo consorcios y máquinas. La asignación de ECA al edificio es de HU-02 (`API de Asignación Tripartita de Roles por Edificio`).
- **`descripcion` de la máquina es texto libre** (`Derecha`, `Izquierda`), no un catálogo. `referenciaAgc` tampoco exige el patrón `M<n>`: el criterio pone `M1, M2, etc.` como ejemplos y no fija un formato.
- **Datos de administración:** se asumieron `nombre`, `telefono` y `email`, los tres opcionales. La Historia no los enumera.
- **No hay autenticación ni roles todavía.** Cualquiera que llegue a la API puede crear, modificar o borrar consorcios. La API sólo escucha en `127.0.0.1` y el control de acceso corresponde a otra tarea del proyecto.
- **Sin paginación en el listado** (`GET /api/consorcios`). Es el listado que va a consumir la UI (RF-02); se pagina si el volumen lo pide.
- **Migraciones al arrancar:** si la base no está disponible, la API arranca igual, lo registra en el log y `/api/health` responde `503` (comportamiento de RO-01). Al volver la base hay que reiniciar la API para que migre.
- **Sin ubicación geográfica** (PostGIS) en el consorcio: la usa el mapa de HU-03, no esta tarea.
- **Para correr `npm run test:int` sin `.env`:** se puede pasar `DATABASE_URL=postgres://ascensores:ascensores_dev@localhost:5433/ascensores` por variable de entorno.
- **Regresión:** esta tarea no pertenece a ningún módulo (`moduleId` vacío) y la única otra tarea integrada en `dev` es RO-01. Se corrieron igual las pruebas de RO-01: sus 15 tests (`health`, `cors`, `config`, `env-file`) y `db.int-spec` siguen en verde. No se corrió su script `RF-01-entrega.sh` (necesita la web con certificados).

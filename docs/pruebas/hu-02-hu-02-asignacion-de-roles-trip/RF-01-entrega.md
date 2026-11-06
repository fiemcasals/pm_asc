# HU-02 · RF-01 · Entrega — API de Asignación Tripartita de Roles por Edificio

- **Tarea:** HU-02 / RF-01 — `REQ-1791910395002`
- **Rama:** `feature/hu-02-hu-02-asignacion-de-roles-trip/req-1791910395002-api-de-asignacion-tripartita-de-roles-po`
- **Depende de:** HU-01 / RF-01 (`REQ-1791909582859`), ya certificada
- **Script del flujo integrado:** [RF-01-entrega.sh](RF-01-entrega.sh)
- **Guía visual:** no corresponde. Esta tarea es sólo API, sin pantallas que fotografiar. La evidencia es la salida de las corridas automáticas y del script. La pantalla es HU-02 / RF-02.

## 1. Qué quedó implementado

Cada edificio puede tener asignada su terna de trabajo: RT de Calle, Usuario Firmante / RT Legal y ECA Responsable. La terna se guarda en PostgreSQL y se consulta con los porcentajes operativos y los datos de contacto de cada responsable.

| Método | Ruta | Qué hace | Respuestas |
|---|---|---|---|
| `PUT` | `/api/consorcios/:id/roles` | Asigna o reemplaza la terna completa | `200` · `400` con `errores` · `404` (no existe o el id no es un UUID) |
| `GET` | `/api/consorcios/:id/roles` | Devuelve la terna con porcentajes y contacto | `200` · `404` |

Cuerpo de `PUT`:

```json
{
  "rtCalle": { "nombre": "Laura Gómez", "telefono": "11 4000-1000", "email": "laura@maicon.test" },
  "firmante": { "nombre": "Ing. Pablo Ruiz", "telefono": "11 4000-2000" },
  "eca": { "nombre": "Conservación Porteña S.R.L.", "email": "contacto@portena.test" }
}
```

Respuesta de `PUT` y `GET`:

```json
{
  "consorcioId": "e43c75a8-a48a-4e8e-9d01-20ee5fbdb49a",
  "rtCalle": { "nombre": "Laura Gómez", "telefono": "11 4000-1000", "email": "laura@maicon.test", "porcentaje": 60 },
  "firmante": { "nombre": "Ing. Pablo Ruiz", "telefono": "11 4000-2000", "email": null, "porcentaje": 25 },
  "eca": { "nombre": "Conservación Porteña S.R.L.", "telefono": null, "email": "contacto@portena.test", "porcentaje": null },
  "actualizadoEn": "2026-11-06T21:40:00.000Z"
}
```

Reglas de validación, informadas todas juntas en `errores`:

- `rtCalle`, `firmante` y `eca` son obligatorios.
- Cada uno necesita `nombre` (≤ 200 caracteres) y al menos un contacto: `telefono` (≤ 50) o `email` (≤ 200, con forma de email).

La tabla `roles_edificio` (migración `003_roles_por_edificio`) tiene una fila por edificio. Borrar el consorcio borra su terna, y editar su ficha con `PUT /api/consorcios/:id` no la modifica.

## 2. Cómo se levanta y se prueba

Requisitos y variables: los de RO-01 (ver su [entrega](../ro-01-ro-01-setup-del-proyecto-y-ent/RF-01-entrega.md)). La API aplica la migración sola al arrancar.

```bash
npm install
npm run db:up          # PostgreSQL + PostGIS en 127.0.0.1:5433
npm run dev            # API :3050 + web https://localhost:8050
```

Pruebas:

```bash
npm run verify                                           # tipos + API + web
cd apps/api && npx jest test/consorcios-roles.e2e-spec.ts    # sólo esta tarea, sin base
cd apps/api && npx jest --config jest.int.config.js --runInBand   # integración real, en serie
```

Usá `--runInBand` para integración: `npm run test:int` corre en paralelo y hoy falla de forma intermitente en `texto-invalido.int-spec.ts`. No es de esta tarea: lo cubre HU-01 / RNF-02 (`REQ-1794000103321`).

## 3. Qué datos hacen falta

Un consorcio existente, que se crea con `POST /api/consorcios`. No hacen falta usuario ni rol: la API todavía no tiene autenticación. El script crea sus propios datos y los borra.

## 4. Qué endpoints o pantallas toca

Los dos de la tabla de arriba. No hay pantallas. Las rutas existentes de `/api/consorcios` no cambian.

## 5. Cómo se corre integrado

Con la base y `npm run dev` levantados:

```bash
bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-01-entrega.sh
bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-01-entrega.sh --carga 200
```

Resultado medido el 06/11/2026 contra `https://localhost:8050`:

- Recorrido: 8 verificaciones OK, 0 fallidas.
- Carga de 200 recorridos (`POST` + `PUT` roles + `GET` roles + `DELETE`): 0 fallidas, promedio 537 ms, p95 653 ms, la más lenta 706 ms. Cada tiempo incluye el arranque de `curl` y `node` del script, no sólo la API.
- Al terminar, `consorcios` y `roles_edificio` quedaron con 0 filas.

| Suite | Resultado |
|---|---|
| `npm run verify` | Tipos OK · API 144/144 (9 nuevos) · web 49/49 |
| Integración con `--runInBand` | 21/21 (5 nuevos) |

| Condición de aprobación | ¿Cubierta? | Cómo se prueba |
|---|---|---|
| 1. `PUT /api/consorcios/:id/roles` guarda y valida la terna | Sí | `consorcios-roles.e2e-spec.ts` (bloque `PUT`) · `consorcios-roles.int-spec.ts` |
| 2. La consulta devuelve porcentajes operativos y contacto | Sí | `consorcios-roles.e2e-spec.ts` (bloque `GET`) · `consorcios-roles.int-spec.ts` |

## 6. Qué quedó afuera y qué se asumió

- **La ECA no tiene porcentaje:** la Tarea define 60% para el RT de Calle y 25% para el Firmante, y nada para la ECA. Devuelve `null`: no se dedujo un 15%.
- **Los porcentajes son constantes del código**, no se guardan por edificio: la Tarea no pide variarlos. Están en `PORCENTAJES_OPERATIVOS` (`roles.types.ts`).
- **Se pidió al menos un contacto por responsable:** es la validación elegida para cumplir la condición 2. La Tarea no fija cuáles son obligatorios.
- **Los responsables son texto, no cuentas de usuario:** el sistema todavía no tiene usuarios.
- **Una misma persona o empresa puede repetirse en dos roles:** la Tarea no lo prohíbe.
- **Sin terna asignada, `GET` responde `200` con los roles en `null`,** no `404`: el edificio existe. La pantalla de RF-02 puede usar esa respuesta para mostrar el formulario vacío.
- **No hay historial de reasignaciones:** se guarda sólo la terna vigente.
- **Fuera de alcance:** la pantalla es HU-02 / RF-02. El criterio 2 de la Historia (actualizar la vista de ruteo y firma) tampoco está acá: `FirmanteService` sigue con sus datos fijos en memoria y no lee esta tabla.
- **Sin autenticación:** igual que el resto de `/api/consorcios`, cualquiera que llegue a la API puede asignar roles.
- **Regresión:** la tarea no tiene módulo (`moduleId` vacío). Se corrió la integración completa con la base real: 21/21. Los 5 Tests de integración cargados con `verification.steps` en otras Tareas no se corrieron aparte.

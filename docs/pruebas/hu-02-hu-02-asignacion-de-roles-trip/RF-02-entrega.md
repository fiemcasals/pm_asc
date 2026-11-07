# HU-02 · RF-02 · Entrega — UI de Secretaría: Pestaña de Asignación de Roles de Trabajo

- **Tarea:** HU-02 / RF-02 — `REQ-1791910395101`
- **Rama:** `feature/hu-02-hu-02-asignacion-de-roles-trip/req-1791910395101-ui-de-secretaria-pestana-de-asignacion-d`
- **Depende de:** HU-02 / RF-01 (`REQ-1791910395002`) y HU-01 / RF-02 (`REQ-1791910394885`), ya certificadas
- **Script del flujo integrado:** [RF-02-entrega.sh](RF-02-entrega.sh)
- **Guía visual:** [RF-02-asignacion-de-roles.md](RF-02-asignacion-de-roles.md)

## 1. Qué quedó implementado

Secretaría ahora tiene dos pestañas: `Edificios y Máquinas`, que es la pantalla que ya existía, y `Asignación de Roles de Trabajo`, que es la nueva. En la nueva, cada edificio muestra selectores para `RT Calle (60%)`, `Firmante AGC (25%)` y `ECA Responsable`. Al apretar `Guardar`, la terna se guarda en PostgreSQL y aparece la confirmación. La lista de edificios se actualiza sin recargar la página.

Cada selector ofrece a quienes ya ocupan ese rol en algún edificio, más la opción `+ Persona nueva`. Elegir a una persona completa sus datos de contacto.

## 2. Cómo se levanta y se prueba

Requisitos y variables: los de RO-01 (ver su [entrega](../ro-01-ro-01-setup-del-proyecto-y-ent/RF-01-entrega.md)).

```bash
npm install
npm run db:up          # PostgreSQL + PostGIS en 127.0.0.1:5433
npm run dev            # API :3050 + web https://localhost:8050
```

Pruebas:

```bash
npm run verify                                                # tipos + API + web
cd apps/web && npx vitest run src/consorcios/roles.test.ts    # sólo esta tarea
cd apps/api && npx jest --config jest.int.config.js --runInBand   # integración real, en serie
```

## 3. Qué datos hacen falta

Al menos dos edificios, que se crean con `+ Alta de Nuevo Consorcio`. No hacen falta usuario ni rol: el sistema todavía no tiene autenticación. El script crea sus propios datos y los borra.

## 4. Qué endpoints o pantallas toca

| Pantalla | Cambio |
|---|---|
| `Secretaría (Edificios y Máquinas)` | Agrega las pestañas `Edificios y Máquinas` y `Asignación de Roles de Trabajo` |

| Método | Ruta | Para qué la usa la pantalla |
|---|---|---|
| `GET` | `/api/consorcios` | Listar los edificios |
| `GET` | `/api/consorcios/:id/roles` | Leer la terna de cada edificio y armar las opciones de los selectores |
| `PUT` | `/api/consorcios/:id/roles` | Guardar la terna |

La API no cambia.

## 5. Cómo se corre integrado

Con la base y `npm run dev` levantados:

```bash
bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-02-entrega.sh
bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-02-entrega.sh --carga 200
```

El script recorre las llamadas de la pantalla. Lo visual se comprueba con la [guía](RF-02-asignacion-de-roles.md).

Resultado medido el 06/11/2026 contra `https://localhost:8050`:

- Recorrido: 10 verificaciones OK, 0 fallidas.
- Carga de 200 recorridos (2 `POST`, 2 `GET` roles, 2 `PUT` roles y 2 `DELETE`): 0 fallidas, promedio 982 ms, p95 1088 ms, la más lenta 1739 ms. Cada tiempo incluye el arranque de `curl` y `node` del script.
- Al terminar, `GET /api/consorcios` devolvió una lista vacía.
- Recorrido en Chrome con Playwright, ventana de 1366 × 900: selectores, error de validación, guardado, actualización sin recargar, reutilización de una persona, cambio de responsable tras recargar y pestaña `Edificios y Máquinas`, sin errores de consola más allá del `400` provocado a propósito.

| Suite | Resultado |
|---|---|
| `npm run verify` | Tipos OK · API 144/144 · web 60/60 (11 nuevos) |
| Integración con `--runInBand` | 21/21 |

| Condición de aprobación | ¿Cubierta? | Cómo se prueba |
|---|---|---|
| 1. La pestaña presenta selectores para RT Calle (60%), Firmante AGC (25%) y ECA Responsable por cada edificio | Sí | Guía, pasos 2 a 4 · `roles.test.ts` (etiquetas y `directorioPorRol`) |
| 2. Al modificar un responsable y presionar Guardar, la interfaz actualiza los datos y muestra confirmación | Sí | Guía, pasos 5 a 7 y comprobación 1 · `RF-02-entrega.sh` · `roles.test.ts` (`guardarRoles`) |

## 6. Qué quedó afuera y qué se asumió

- **No hay padrón de personas ni de ECA:** el sistema sólo guarda nombre y contacto dentro de cada terna. Por eso los selectores se arman con las ternas ya guardadas y `+ Persona nueva` permite cargar a quien todavía no figura. El primer edificio siempre se carga a mano.
- **«En tiempo real» se interpretó como «sin recargar la página»:** quien guarda ve el cambio al instante. Otra persona con la pantalla abierta lo ve recién al volver a entrar a la pestaña.
- **Una persona con el mismo nombre y contactos distintos** aparece una sola vez, con los datos de su asignación más reciente. Cambiar sus datos en un edificio no los cambia en los demás.
- **Los textos «60%» y «25%» están en `ROLES_DE_TRABAJO` (`roles.ts`):** son los de la Tarea. El significado de esos porcentajes está pendiente de confirmación por MAICON.
- **Si no se puede leer la terna de un edificio, no se muestra su formulario:** guardar uno vacío borraría la asignación. Aparece el error con `Reintentar`.
- **Los errores de validación se muestran como los devuelve la API** (por ejemplo, `rtCalle necesita al menos un dato de contacto (telefono o email)`), igual que en el alta de consorcios.
- **Cantidad de consultas:** la pantalla hace un `GET` de roles por edificio al abrirse. No se midió con un padrón real de edificios.
- **Pantalla angosta:** a 390 px la pestaña nueva se ordena en una columna, pero la página tiene 96 px de scroll horizontal. Lo causa la barra principal de `App.tsx`, que se comporta igual en `Portal Firmante (RT Legal)`. No se tocó porque es de otra pantalla y no hay Tarea que lo cubra.
- **Fuera de alcance:** el criterio 2 de la Historia (actualizar la vista de ruteo y firma) sigue pendiente: `FirmanteService` no lee estas ternas.
- **Sin autenticación:** igual que el resto de `/api/consorcios`.
- **Regresión:** la tarea no tiene módulo (`moduleId` vacío). Se corrió la integración completa con la base real: 21/21.

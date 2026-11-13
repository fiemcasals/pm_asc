# HU-04 · RF-02 · Entrega — Mapa de la Secretaría con el semáforo de edificios y reasignación del RT de Calle

- **Tarea:** HU-04 / RF-02 — `REQ-1791910395476`
- **Rama:** `feature/hu-04-hu-04-semaforo-de-control-mens/req-1791910395476-mapa-de-la-secretaria-con-el-semaforo-de`
- **Depende de:** HU-04 RF-01 (`GET /api/semaforo`), integrada y certificada
- **Fuente de las reglas:** definiciones del cliente P2.a (sin técnicos en vivo, opción A) y P2.d (se sugiere al RT con menos pendientes y la Secretaría confirma)
- **Guía visual, con capturas:** [RF-02-semaforo-secretaria.md](RF-02-semaforo-secretaria.md)
- **Script del flujo integrado:** [RF-02-entrega.sh](RF-02-entrega.sh) · **Datos de demostración:** [RF-02-datos-demo.sh](RF-02-datos-demo.sh)

## 1. Qué quedó implementado

**Pantalla** (`apps/web/src/semaforo/`): una pestaña nueva `Semáforo` dentro de la Secretaría con:
- el **mapa de CABA con un pin por edificio, del color de su semáforo**, y una **leyenda** visible de los tres colores;
- los totales por color y una lista ordenada por urgencia (rojos primero);
- el botón `Reasignar` en cada edificio en rojo (o un clic en su pin), que abre un panel con el RT actual, el **RT sugerido** y el selector;
- `Confirmar reasignación` / `Cancelar`, y el historial `Reasignaciones registradas` del edificio;
- un selector `Ver el semáforo al día` (ver §5).

El mapa es el SVG de CABA que ya existía (`MapaUbicacionConsorcio`), extendido de forma compatible con props opcionales (color del pin, pin elegible por clic o teclado). Los edificios sin ubicación no se pueden dibujar: se avisa en pantalla y siguen en la lista.

**Backend** (`apps/api/src/semaforo/` y migración `012_reasignaciones_rt`), tres rutas nuevas **que exigen sesión de Secretaría o Administrador** (sin sesión 401, otro rol 403):

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/semaforo/:consorcioId/reasignacion/sugerencia` | El RT con menos edificios pendientes del mes, sin contar al actual, y todos los candidatos con su carga. **Sólo sugiere: no cambia nada** |
| `POST` | `/api/semaforo/:consorcioId/reasignacion` | Aplica la reasignación `{ rtAnterior, rtNuevo }` y la registra. `201` con el registro |
| `GET` | `/api/semaforo/:consorcioId/reasignaciones` | El registro de reasignaciones del edificio, la más reciente primero |

**Reglas:**
- **Sugerencia (criterio 3):** candidatos = usuarios **activos con rol `rt_calle`**. La carga de cada uno = edificios suyos **pendientes** en el mes (un edificio ya inspeccionado no pesa). Gana el de menos; el desempate es por nombre de usuario, siempre igual. Sólo se ofrece para edificios **en rojo** (el servidor lo exige: `409` si está en otro color).
- **Confirmación (criterio 4):** se aplica **recién en el `POST`**, y se rechaza si el RT que la Secretaría vio ya no es el actual (`409`), si el RT nuevo es el mismo o no es un RT de Calle activo (`400`), o si el edificio no está en rojo o no tiene terna (`409`).
- **Registro (criterio 4):** tabla `reasignaciones_rt` con **usuario** (sale de la sesión, **nunca del cuerpo**), **fecha** (la pone el servidor), **RT anterior** y **RT nuevo**. Cambio y registro se escriben **en la misma transacción**: o ocurren los dos o ninguno.
- **El registro es sólo de agregado.** La tabla tiene RLS por ECA con políticas de lectura y de alta, y ninguna de modificación ni de borrado: el rol que usa la API no puede editar ni borrar un registro (se probó contra la base).
- **Efecto real sobre el acceso.** El RLS reconoce al RT de un edificio por su nombre de usuario en la terna, así que al reasignar **el RT anterior deja de ver el edificio y el nuevo lo ve en el acto** (se probó leyendo `GET /api/consorcios/:id` con cada uno).
- **Dos confirmaciones simultáneas** del mismo edificio: se bloquea la fila de la terna (`FOR UPDATE`); la primera se aplica y la segunda da `409`.

**Cambios en archivos compartidos** (todos aditivos):
- `database.service.ts`: la lista de tablas con RLS que revisa el diagnóstico de seguridad pasó a una constante `TABLAS_CON_RLS`, con `reasignaciones_rt` incluida. Estaba repetida en dos consultas y **la tabla nueva quedaba fuera del control sin avisar**.
- `rls-eca.int-spec.ts`: la lista esperada suma `reasignaciones_rt`.
- `create-test-app.ts`: el semáforo en memoria suma la reasignación.

## 2. Cómo se levanta y se prueba

Igual que HU-04 RF-01 (`npm install`, `npm run db:up`, `npm run dev`), con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas. Para ver la pantalla hace falta un usuario con rol Secretaría; siguiendo la [guía](RF-02-semaforo-secretaria.md).

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run verify` | Tipos OK. API: **352 tests, 352 en verde** (Jest; 42 nuevos: `reasignacion.logic.spec` 13, `semaforo-reasignacion.e2e-spec` 29). Web: **139 en verde** (Vitest; 16 nuevos: `semaforo.test`) |
| `npm run test:int` (con la base y las variables de arriba) | **65 tests, 65 en verde** contra PostGIS real: los 50 anteriores y 15 nuevos (`semaforo-reasignacion.int-spec`) |
| `BASE_URL=http://127.0.0.1:3050 bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-entrega.sh` | 14 verificaciones, 14 OK. No deja datos |
| `… RF-02-entrega.sh --carga 200` | 200 sugerencias con 5 edificios y 4 RT: 0 fallidas · promedio 11 ms · p95 26 ms · la más lenta 34 ms (13/11/2026, máquina de desarrollo con Windows 11) |
| Navegador (Chromium con Playwright), `https://localhost:8050` | Flujo completo de la guía: login como Secretaría, semáforo al 25/11, `Reasignar`, sugerencia, `Confirmar reasignación`, historial. Capturas en la guía. Consola sin errores ni avisos |

**Lo que se vio en el navegador y se confirmó en la base:** antes de confirmar, con la sugerencia a la vista, la base seguía con el RT anterior y 0 registros. Al confirmar quedó el registro `demo.secretaria · rt.ana → rt.diego` con la hora del servidor, y el edificio con el RT nuevo (y los contactos del anterior vaciados).

**Comprobado que las pruebas miden lo que dicen** (se rompió el código a propósito):

| Mutación | unit + e2e | integración |
|---|---|---|
| La sugerencia elige al **más** cargado | 5 fallan | 2 fallan |
| Los edificios ya inspeccionados cuentan como carga | 4 fallan | 2 fallan |
| Puede sugerir al RT actual | 9 fallan | 2 fallan |
| La reasignación no bloquea la fila (carrera) | pasan | **1 falla** (ver nota) |
| La base no verifica que el RT siga siendo el que se vio | pasan | **1 falla** |
| El RT nuevo hereda el teléfono y el email del anterior | pasan | **1 falla** |
| Se puede reasignar un edificio que no está en rojo | 2 fallan | 3 fallan |
| El registro se puede modificar y borrar (se agregan políticas en la base real) | — | **1 falla** |

**Dos mutaciones no valieron la primera vez y se corrigieron:** la de la carrera **sobrevivió** (la prueba de concurrencia pasaba con el código roto, porque dos pedidos casi nunca se pisan); se rehízo de forma determinista —una transacción aparte sostiene el bloqueo mientras las dos confirmaciones se ponen en cola— y ahora la detecta. La de "no rojo" estaba mal armada (ni compilaba) y se rehízo.

**Defectos encontrados al probar en el navegador, ya corregidos:** la tabla de la lista se cortaba a la derecha y no se veía el botón `Reasignar` en pantallas angostas; y la tabla del historial se cortaba dentro del panel.

## 3. Qué datos hacen falta

Para la pantalla, los de la guía. El script crea 1 Secretaría, 4 RT (`RF02-ent-<pid>-a..d`) y 5 edificios, y los borra al terminar; `semaforo-reasignacion.int-spec` hace lo mismo con los suyos (`RF02-int…`).

## 4. Endpoints y pantallas

Tres rutas nuevas (arriba) y una pestaña nueva: `Semáforo` en la Secretaría. `GET /api/semaforo` (RF-01) sigue sin pedir sesión.

## 4.5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-entrega.sh              # condiciones 3 y 4: 14 verificaciones
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-entrega.sh --carga 200  # 200 sugerencias, con tiempos
```

Las **condiciones 1 y 2 son de pantalla** y no se pueden recorrer con `curl`: se verifican con la guía. Hace falta docker para crear los usuarios y fechar las inspecciones de prueba.

## 5. Qué quedó afuera y qué se asumió

- **«RT de Calle» = usuario activo con rol `rt_calle`.** La terna de un edificio guarda al RT como texto y el RLS lo reconoce por **nombre de usuario**; por eso al reasignar se escribe el **nombre de usuario** del RT nuevo en la terna (la pantalla muestra, por ejemplo, `rt.diego`, no un nombre completo). No hay otra fuente de «quiénes son los RT».
- **Al reasignar se vacían el teléfono y el email de la terna**, porque eran del RT anterior y dejárselos al nuevo sería un dato falso. Consecuencia: el edificio queda con un RT **sin contacto cargado**, algo que la validación de `PUT /roles` no permite crear a mano. Falta un lugar donde el RT tenga sus datos de contacto (hoy no existe en `usuarios`); conviene resolverlo en HU-02.
- **La carga de cada RT cuenta sólo los edificios que ve la ECA de la petición** (RLS). Un RT que trabaja para varias ECAs puede estar subcontado.
- **Sólo se reasigna un edificio en rojo**, y el servidor lo exige. El parámetro `fecha` que usa la pantalla (`Ver el semáforo al día`) también se acepta en el `POST` para poder probar en rojo antes del día 21; es una regla de negocio, no una frontera de seguridad: la Secretaría ya puede cambiar el RT por `PUT /roles`.
- **`Ver el semáforo al día` no estaba en la tarjeta.** Se agregó para poder verificar los tres colores sin esperar al calendario; se puede quitar sin tocar nada más.
- **El mapa es el SVG esquemático que ya existía**, no un mapa con calles reales. Con edificios muy cercanos, los rótulos se pisan (se ve en la captura con Rivadavia y Corrientes).
- **La reasignación no avisa a nadie** (ni al RT que sale ni al que entra), y **no se puede deshacer** desde la pantalla: se corrige con otra reasignación, que queda registrada.
- **Los componentes de React no tienen pruebas propias** (el proyecto no usa jsdom): lo que se prueba con `vitest` es la lógica y el cliente de la API; la pantalla se verificó en el navegador.
- **Por lectura del código, no probado:** `EcaContextMiddleware` toma la ECA de `req.user`, pero el guard de sesión escribe `req.usuario` y corre después, así que la ECA del usuario logueado probablemente no llega al RLS y todo cae en la ECA de desarrollo. Está así desde HU-15 y no se tocó.
- **Regresión:** esta tarjeta no pertenece a ningún módulo (`moduleId` vacío). Se corrió la batería completa: 352 de API, 139 de web y 65 de integración en verde, incluidas las de RLS, roles, consorcios, checklist y semáforo.

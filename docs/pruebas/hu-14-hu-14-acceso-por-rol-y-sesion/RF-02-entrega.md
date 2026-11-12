# HU-14 / RF-02 · Entrega — Pantalla de ingreso

- **Tarea:** RF-02 — `REQ-1794493998996`
- **Rama:** `feature/hu-14-hu-14-acceso-por-rol-y-sesion/req-1794493998996-pantalla-de-ingreso`
- **Guía con capturas:** [RF-02-pantalla-de-ingreso.md](RF-02-pantalla-de-ingreso.md)
- **Script:** [RF-02-entrega.sh](RF-02-entrega.sh)
- **Depende de:** RF-01, API de autenticación y roles (`REQ-1794493998753`), en `merged_dev`.

## 1. Qué quedó implementado

- **Pantalla de ingreso** (`apps/web/src/auth/Login.tsx`), pensada primero para el celular:
  - logo `MAICON S.R.L.` (provisorio hasta que MAICON mande el oficial);
  - campos `Usuario / Email` y `Contraseña`;
  - botón `Ver` / `Ocultar`;
  - botón `Ingresar al Sistema`.
  - Los campos tienen 16 px y 44 px de alto, así el celular no hace zoom y se tocan cómodos.
- **Puerta de entrada** (`App.tsx`): sin sesión se ve la pantalla de ingreso; con sesión, la pantalla inicial del rol.
  - **RT de Calle:** `Mapa del RT`, y no ve los portales de oficina.
  - **Firmante:** su portal.
  - **ECA:** su portal.
  - **Secretaría y Administrador:** `Secretaría (Edificios y Máquinas)`.
- **Sesión en el dispositivo** (`apps/web/src/auth/sesion.ts`):
  - El token de acceso queda **solo en memoria**. En `localStorage` va únicamente el perfil (id, usuario, nombre, rol), nunca el token ni la contraseña.
  - Al reabrir la app se renueva el token con la cookie httpOnly. **Sin red**, o con el servidor caído (5xx), la sesión sigue con el perfil guardado y se muestra un aviso. Si el servidor la rechaza (401: venció o la revocaron), se pide ingresar de nuevo.
  - Si varios pedidos de renovación coinciden, se manda uno solo (ver la sección 5).
- **Cerrar sesión**: borra el perfil y el token, y avisa al servidor. Sin señal, igual cierra en el dispositivo.

## 2. Cómo se levanta y cómo se prueba

Igual que RF-01: `npm run db:up` y `npm run dev`, con el `.env` de `.env.example`. Los usuarios de prueba se crean como indica la [guía](RF-02-pantalla-de-ingreso.md#condiciones-previas).

| Prueba | Resultado (12/11/2026) |
|---|---|
| `npm run verify` | Tipos OK. API: 199 en verde. Web: 97 en verde; `auth/sesion.test.ts` suma 15 |
| Navegador, Chrome 157 (Playwright) a 360 × 740 | Ver la tabla de abajo; capturas en la [guía](RF-02-pantalla-de-ingreso.md) |
| `bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-02-entrega.sh` | 16 verificaciones, 16 OK |
| `… RF-02-entrega.sh --carga 100` | 100 cargas de la pantalla, 0 fallidas · promedio 172 ms · p95 197 ms |

Qué se vio en el navegador:

| Condición | Resultado |
|---|---|
| 360 px | `scrollWidth` = `clientWidth` = 360 en el ingreso, con el error y en la vista del RT |
| `Ver` | Cambia el campo de `password` a `text` |
| Credenciales inválidas | Mensaje en pantalla y no navega |
| RT | Entra a `Mapa del RT` |
| Secretaría | Entra a `Secretaría (Edificios y Máquinas)` y sigue logueada después de 3 recargas |
| Cerrar sesión | Vuelve al ingreso, el perfil queda en `null` y el refresco da `401` |
| Sin red (build de producción) | La vista del RT abre con el aviso `Sin señal` |

## 3. Qué datos hacen falta

- El Administrador inicial, que se crea solo desde el `.env`.
- Un RT de Calle de prueba (`rt.aliado1` / `Clave-Prueba-2026` en la guía), creado con `POST /api/usuarios`. El script crea y borra los suyos.

## 4. Endpoints y pantallas

| Tipo | Ruta | Qué hace |
|---|---|---|
| Pantalla | `https://localhost:8050/` sin sesión | Pantalla de ingreso |
| Pantalla | `https://localhost:8050/` con sesión | Pantalla inicial del rol |
| `POST` | `/api/auth/login` | RF-01. La pantalla manda `{usuario, password}` |
| `POST` | `/api/auth/refresh` | RF-01. Se llama al abrir la app |
| `POST` | `/api/auth/logout` | RF-01. Se llama al cerrar sesión |

## 4.5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-02-entrega.sh             # textos, login, rol, error, refresco y cierre
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-02-entrega.sh --carga 100 # GET / 100 veces, con tiempos
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-01-entrega.sh             # regresión del módulo: RF-01
```

**Regresión:** RF-01 sigue con 22 de 22 verificaciones, y la suite completa sigue en verde.

## 5. Qué quedó afuera y qué se asumió

- **El mapa del RT no está.** Es la tarea "Mapa del RT con pines por horario" (HU-16). Por ahora `Mapa del RT` muestra el saludo y ese aviso: la condición 2 se cumple en cuanto a la navegación, y el contenido llega con esa tarea.
- **El logo es provisorio.** MAICON tiene que mandar el oficial (P13.a); se cambia solo el componente `LogoMaicon`.
- **Las rutas de la API todavía no exigen sesión** (ver RF-01). Las pantallas de oficina siguen llamando a la API sin token. Cuando cada controlador tenga su `@Roles`, la web tiene que mandar `Authorization: Bearer` con el token de `getAccessToken()`.
- **Una sola renovación a la vez.** React monta la app dos veces en desarrollo (StrictMode) y mandaba dos refrescos con la misma cookie. Como cada cookie sirve una sola vez, el segundo recibía 401 y cerraba la sesión. Se corrigió compartiendo el pedido en curso, y hay un test que lo cubre. **Dos pestañas abiertas a la vez** todavía pueden pisarse; en el celular del RT es poco probable.
- **Sin señal se sigue con el perfil guardado, sin un token válido.** Alcanza para ver la app; los envíos de datos sin señal son la tarea "Cola de sincronización del celular" (HU-18).
- **La prueba sin señal usa el build de producción**, porque en desarrollo el service worker no guarda la app completa.

# HU-14 / RNF-01 · Entrega — Consentimiento de ubicación y revocación de sesiones

- **Tarea:** RNF-01 — `REQ-1794493999191`
- **Rama:** `feature/hu-14-hu-14-acceso-por-rol-y-sesion/req-1794493999191-consentimiento-de-ubicacion-y-revocacion`
- **Guía con capturas:** [RNF-01-consentimiento-y-revocacion.md](RNF-01-consentimiento-y-revocacion.md)
- **Script:** [RNF-01-entrega.sh](RNF-01-entrega.sh)
- **Depende de:** RF-01 (`REQ-1794493998753`) y RF-02 (`REQ-1794493998996`), las dos en `merged_dev`.

## 1. Qué quedó implementado

**API**
- **Aviso de ubicación con versión** (`apps/api/src/auth/consentimiento.ts`).
  - `GET /api/consentimientos/ubicacion` devuelve el texto vigente y su versión.
  - `POST /api/consentimientos/ubicacion` registra la aceptación con usuario, versión y fecha. Rechaza con 400 una versión que no sea la vigente, y conserva la fecha de la primera aceptación.
- **Pendiente en la sesión:** el login, el refresco y `/me` traen `consentimientoUbicacionPendiente`. Es `true` solo para el RT de Calle que no aceptó la versión vigente.
- **Revocación** con `POST /api/usuarios/:id/revocar-sesiones`, solo para el Administrador: 204, o 404 si el usuario no existe.
  - Marca la hora en el usuario y en todas sus sesiones.
  - Las sesiones revocadas no se borran, para poder informar el motivo.
- **El guard consulta la base en cada pedido protegido.** El token de acceso dura 15 minutos sin tocar la base, así que sin esto una revocación tardaría hasta 15 minutos en valer. Ahora un token emitido antes de la revocación responde **401** con `motivo: "revocada"` de inmediato. Lo mismo pasa con el refresco con la cookie revocada, y con un usuario desactivado.
- **Migración `006_consentimiento_y_revocacion`:** tabla `consentimientos_ubicacion`, y las columnas `usuarios.sesiones_revocadas_en` y `sesiones.revocada_en`.

**Web**
- **Pantalla `Uso de tu ubicación`** (`ConsentimientoUbicacion.tsx`): el RT de Calle con el aviso pendiente no pasa de ahí hasta tocar `Acepto`. La otra opción es `Cerrar sesión`.
- **`tomarUbicacion(motivo)`** (`auth/ubicacion.ts`): el único lugar donde se lee la ubicación. Admite solo `inicio-inspeccion` o `visita-fallida`, hace una lectura fresca con `getCurrentPosition` y nunca usa `watchPosition`. Un test lo garantiza recorriendo todo `src/`.
- **`fetchConSesion`** (`auth/sesion.ts`): agrega el token a cada pedido.
  - Si el token venció, lo renueva una vez y reintenta.
  - Si el servidor dice `revocada`, cierra la sesión, avisa a la app y **no reenvía** el pedido.
  - Lo pendiente del dispositivo no se toca, así que queda para después de un nuevo ingreso.
- **Volver al ingreso** con el aviso `Tu sesión fue cerrada por un Administrador. Volvé a ingresar.`, tanto al reabrir la app como en medio de un envío.

## 2. Cómo se levanta y cómo se prueba

| Prueba | Resultado (12/11/2026) |
|---|---|
| `npm run verify` | Tipos OK. API: 209 en verde; `auth-consentimiento-revocacion.e2e-spec` suma 10. Web: 108 en verde; `sesion.test` suma 6 y `ubicacion.test` suma 5 |
| `npm run test:int` | 30 en verde, entre ellos 2 nuevos contra PostgreSQL real: consentimiento guardado con versión y fecha, y revocación marcada en el usuario y la sesión con 401 en token y refresco |
| `bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RNF-01-entrega.sh` | 23 verificaciones, 23 OK |
| `… RNF-01-entrega.sh --carga 200` | 200 `GET /api/auth/me`, cada uno con la consulta extra del guard: 0 fallidas · promedio 170 ms · p95 210 ms · la más lenta 279 ms |
| Chrome 157 (Playwright) a 360 × 740 | Ver la tabla de abajo; capturas en la [guía](RNF-01-consentimiento-y-revocacion.md) |
| Regresión del módulo | `RF-01-entrega.sh` 22/22 y `RF-02-entrega.sh` 16/16 |

Qué se vio en el navegador:

| Situación | Resultado |
|---|---|
| Ingreso de un RT nuevo | Aparece el aviso; al recargar sigue ahí |
| `Acepto` | Entra a `Mapa del RT`, y al recargar el aviso ya no aparece |
| Revocación y la app se reabre | Ingreso con el aviso y perfil borrado |
| Revocación durante un envío | Un solo pedido y vuelta al ingreso con el aviso |
| Nuevo ingreso después de la revocación | Funciona |
| Ancho | 360 px sin desplazamiento horizontal |

## 3. Qué datos hacen falta

- El Administrador inicial, que se crea desde el `.env`.
- Un RT de Calle nuevo para ver el aviso; quien ya lo aceptó no lo vuelve a ver.
- El script crea y borra sus propios usuarios, con el prefijo `rnf01-entrega-`.

## 4. Endpoints y pantallas

| Tipo | Ruta | Acceso | Qué hace |
|---|---|---|---|
| `GET` | `/api/consentimientos/ubicacion` | Pública | `{version, titulo, parrafos[]}` |
| `POST` | `/api/consentimientos/ubicacion` | Cualquier rol | Cuerpo `{version}`. **201** `{version, aceptadoEn}`; **400** si la versión no es la vigente; **401** sin sesión o revocada |
| `POST` | `/api/usuarios/:id/revocar-sesiones` | `administrador` | **204**; **404** si el usuario no existe; **401** sin sesión; **403** con otro rol |
| `POST` | `/api/auth/login`, `/refresh` y `GET /me` | — | Ahora traen `usuario.consentimientoUbicacionPendiente`. Con la sesión revocada, `/refresh` y `/me` dan 401 con `motivo: "revocada"` |
| Pantalla | `Uso de tu ubicación` | RT de Calle con el aviso pendiente | `Acepto` / `Cerrar sesión` |
| Pantalla | Ingreso con aviso | Después de una revocación | `Tu sesión fue cerrada por un Administrador. Volvé a ingresar.` |

## 4.5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RNF-01-entrega.sh             # condiciones 1, 2 y 3 (la 4 es en el navegador)
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RNF-01-entrega.sh --carga 200 # costo del control de revocación en el guard
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-01-entrega.sh              # regresión del módulo
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-02-entrega.sh
```

## 5. Qué quedó afuera y qué se asumió

- **El texto del aviso es provisorio.** MAICON tiene que revisarlo con sus textos legales (P13.a). Cambiar el texto obliga a cambiar `VERSION_CONSENTIMIENTO_UBICACION`, y cada RT lo vuelve a aceptar.
- **No hay pantalla de administración de usuarios.** La revocación se hace por API, con el token del Administrador. Una pantalla de "Usuarios" (alta, baja, revocar) no está en el backlog; conviene sumarla.
- **La condición 2 queda garantizada en el código, sin pantalla todavía.** Los botones que toman la ubicación llegan con HU-16 ("Tarjeta del edificio y validación de presencia a 30 m") y con la constancia de visita fallida (HU-07), y tienen que usar `tomarUbicacion`. El test impide leerla de otra forma.
- **"Lo pendiente no se envía"** se cumple porque `fetchConSesion` no reenvía y no se borra nada del dispositivo. La cola de envíos sin señal todavía no existe ("Cola de sincronización del celular", HU-18), y tiene que usar `fetchConSesion`.
- **Revocación al segundo:** un token emitido en el mismo segundo de la revocación también se rechaza. Si el RT vuelve a ingresar dentro de ese mismo segundo, tiene que ingresar de nuevo. Es muy improbable y nunca deja pasar un token viejo.
- **La API todavía no exige el consentimiento para recibir ubicaciones.** `POST /api/visitas-fallidas` sigue público (ver RF-01). Cuando se proteja con `@Roles('rt_calle')`, conviene rechazar también al RT con el aviso pendiente.
- **Una corrida intermitente:** en una de cuatro corridas de `npm run verify`, `texto-invalido.e2e-spec` y `visitas-fallidas-persistencia.e2e-spec` fallaron. Esos dos archivos no se tocaron; ese día tardaron 43 s porque la máquina tenía corriendo además `npm run dev`, el navegador de pruebas y bcrypt de costo 12 en paralelo. Aislados pasan 16/16, y las otras tres corridas completas dieron 209/209. Si se repite, conviene subir su timeout como en `auth.e2e-spec`.
- **Costo del guard:** una consulta por clave primaria en cada pedido protegido. En la carga de 200 pedidos el p95 quedó en 210 ms, contra 189 ms sin la consulta.

# HU-14 / RF-01 · Entrega — API de autenticación y roles

- **Tarea:** RF-01 — `REQ-1794493998753`
- **Rama:** `feature/hu-14-hu-14-acceso-por-rol-y-sesion/req-1794493998753-api-de-autenticacion-y-roles`
- **Script del flujo integrado:** [RF-01-entrega.sh](RF-01-entrega.sh)
- **Guía visual:** no aplica. Es una tarea de API sin pantalla; la pantalla de ingreso es RF-02 de esta misma Historia.

## 1. Qué quedó implementado

- **Login** con usuario y contraseña (`POST /api/auth/login`). Responde lo mismo exista o no el usuario, y el nombre de usuario no distingue mayúsculas.
- **Contraseñas con bcrypt de costo 12** (`bcryptjs`). En la base solo queda el hash, y la contraseña no se escribe en ningún log.
- **Dos tokens:**
  - **acceso:** JWT HS256 de **15 minutos**, que va en `Authorization: Bearer …`;
  - **refresco:** 256 bits al azar, en la cookie `mant_refresh` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`) y con 30 días de vida. En la base solo se guarda su hash SHA-256, y **se rota en cada uso**: una cookie ya usada deja de servir.
- **Control por rol:** un guard global con el decorador `@Roles(...)`.
  - Sin sesión responde **401**; con un rol distinto, **403**.
  - Los roles son `rt_calle`, `secretaria`, `firmante`, `eca` y `administrador`.
  - Una ruta sin `@Roles` sigue siendo pública.
- **Alta de usuarios** (`POST /api/usuarios`), solo para el Administrador. Es la ruta con rol requerido de la condición 4.
- **Bloqueo por intentos:** 5 intentos fallidos seguidos dan **429 durante 15 minutos**, con `Retry-After`.
  - Se cuenta por nombre de usuario, aunque la cuenta no exista, para no revelar qué usuarios existen.
  - Un ingreso correcto reinicia el contador.
- **Administrador inicial:** se crea al arrancar desde `ADMIN_INICIAL_USUARIO` / `ADMIN_INICIAL_PASSWORD`, solo si todavía no hay ninguno.
- **Migración `005_usuarios_y_sesiones`:** tablas `usuarios`, `sesiones` e `intentos_login`.

## 2. Cómo se levanta y cómo se prueba

Igual que el resto del proyecto (`npm run db:up` y `npm run dev`), con estas variables nuevas en el `.env`:

| Variable | Valor de desarrollo | Para qué |
|---|---|---|
| `AUTH_JWT_SECRET` | 48 bytes al azar (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) | Firma de los tokens de acceso. Si queda vacío, la API genera uno en cada arranque y lo avisa en el log; si tiene menos de 32 caracteres, la API no arranca |
| `ADMIN_INICIAL_USUARIO` | `admin` | Primer Administrador |
| `ADMIN_INICIAL_PASSWORD` | `Admin-Desarrollo-2026` | Solo para desarrollo |

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run verify` | Tipos OK. API: 199 tests, 199 en verde. Web: 82 en verde. Lo nuevo: `auth-tokens.spec` (7) y `auth.e2e-spec` (22) |
| `npm run test:int` | 28 en verde, de los cuales `auth.int-spec` (4) corre contra PostgreSQL real: tablas creadas, hash `$2b$12$`, sesión guardada como hash y rotada, bloqueo guardado en la base |
| `bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-01-entrega.sh` | 22 verificaciones, 22 OK (12/11/2026, contra `https://localhost:8050`) |
| `… RF-01-entrega.sh --carga 200` | 200 `GET /api/auth/me`, 0 fallidas · promedio 153 ms · p95 189 ms · la más lenta 258 ms |

El vencimiento a los 15 minutos y el fin del bloqueo a los 15 minutos se prueban sin esperar, con un reloj de prueba que se adelanta a mano (`auth.e2e-spec.ts`, condiciones 3 y 5). El script en vivo verifica que el token dure 900 s (`exp - iat`) y que `Retry-After` sea de 900 s.

## 3. Qué datos hacen falta

- El **Administrador inicial**, que se crea solo al arrancar con las variables de arriba.
- Los demás usuarios se crean con `POST /api/usuarios` y el token del Administrador. El script crea y borra los suyos, todos con el prefijo `rf01-entrega-`.

## 4. Endpoints

| Método | Ruta | Acceso | Respuesta |
|---|---|---|---|
| `POST` | `/api/auth/login` | Pública | Cuerpo `{"usuario","password"}`. **200** `{"accessToken","tokenType":"Bearer","expiresIn":900,"usuario":{id,usuario,nombre,rol}}` más la cookie `mant_refresh`; **401** `Usuario o contraseña incorrectos.`; **429** con `Retry-After`; **400** si falta un campo |
| `POST` | `/api/auth/refresh` | Cookie `mant_refresh` | **200** con el mismo cuerpo que el login y una cookie nueva; **401** si falta, venció o ya se usó |
| `POST` | `/api/auth/logout` | Cookie `mant_refresh` | **204**: borra la sesión y la cookie |
| `GET` | `/api/auth/me` | Cualquier rol | **200** con los datos públicos del usuario; **401** sin token o con un token vencido |
| `POST` | `/api/usuarios` | `administrador` | Cuerpo `{"usuario","nombre","rol","password"}` (contraseña de 10 a 72 bytes). **201**; **400** si los datos son inválidos; **409** si el usuario ya existe; **401** sin sesión; **403** con otro rol |

## 4.5. Cómo se corre integrado

Con `npm run db:up` y `npm run dev` levantados, y el `.env` con las variables de la sección 2:

```bash
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-01-entrega.sh             # las 5 condiciones
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-01-entrega.sh --carga 200 # GET /api/auth/me, 200 veces, con tiempos
```

**Regresión:** la suite completa (`npm run verify` y `npm run test:int`) sigue en verde. Las rutas existentes no cambiaron de comportamiento, porque siguen públicas.

## 5. Qué quedó afuera y qué se asumió

- **Las rutas existentes (consorcios, firmante, ECA, fallas, visitas fallidas, WhatsApp) siguen públicas.** Ponerles rol ahora rompería la web, que todavía no tiene login. El mecanismo queda listo: alcanza con agregar `@Roles(...)` a cada controlador. Conviene hacerlo con la pantalla de ingreso (RF-02).
- **La revocación de sesiones por un Administrador** es la tarea RNF-01 de esta Historia ("Consentimiento de ubicación y revocación de sesiones"). La base ya la soporta: revocar es borrar las filas de `sesiones` del usuario.
- **El JWT está implementado a mano** (HS256 con `node:crypto`), sin librería: firma con `timingSafeEqual`, cabecera fija (rechaza `alg: none` y cualquier otro algoritmo) y control de vencimiento. Son unas 60 líneas, cubiertas por `auth-tokens.spec.ts`.
- **El refresco dura 30 días** y se renueva en cada uso, porque el RT trabaja varios días en la calle sin volver a ingresar. Las condiciones no fijaban ese plazo.
- **`Secure` en la cookie** exige HTTPS. En desarrollo la web ya corre con HTTPS (mkcert); si se le pega a la API directo por `http://127.0.0.1:3050`, el navegador no devuelve la cookie.

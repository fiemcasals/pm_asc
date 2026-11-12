# HU-15 / RF-01 · Entrega — Asociar la ECA al usuario y exponerla en la sesión

- **Tarea:** RF-01 — `REQ-1794500686999`
- **Rama:** `feature/hu-15-hu-15-aislamiento-de-datos-ent/req-1794500686999-asociar-la-eca-al-usuario-y-exponerla-en`
- **Script del flujo integrado:** [RF-01-entrega.sh](RF-01-entrega.sh)
- **Guía visual:** no aplica. Es una tarea de API, sin pantalla.
- **Depende de:** HU-14 RF-01 (API de autenticación), en `tested`. Destraba la tarea `RNF-03`, "Tomar la ECA y el rol del RLS desde la sesión del usuario", de Gonzalo.

## 1. Qué quedó implementado

Un usuario con rol `eca` no sabía a qué Empresa Conservadora pertenece, así que el RLS no podía tomar la ECA de la sesión y la leía de headers que cualquier cliente puede mandar. Ahora el usuario tiene su ECA.

- **Alta con ECA:** `POST /api/usuarios` pide el campo `eca` (el nombre de la ECA) cuando el rol es `eca`.
  - Sin `eca`, o con `eca` vacía, de solo espacios, que no sea texto o de más de 120 caracteres: **400**.
  - Se guarda sin espacios sobrantes.
  - Con cualquier otro rol (`rt_calle`, `firmante`, `secretaria`, `administrador`), mandar una `eca` también da **400**. Sin ella, o con `eca` vacía o nula, el alta funciona y la ECA queda en `null`.
- **La sesión la devuelve:** el login, el refresco y `GET /api/auth/me` incluyen `eca` (el nombre, o `null`).
- **El guard la deja en la petición:** `req.usuario.eca`, que el decorador `@UsuarioActual()` entrega a los controladores. Sale de la base **en cada pedido**, no del token, así que cambiar la ECA de un usuario vale desde el pedido siguiente, sin esperar a que el token de 15 minutos venza.
- **Migración `011_eca_en_usuarios`:** agrega `usuarios.eca` (texto, admite `NULL`) y dos restricciones:
  - `usuarios_eca_solo_rol_eca`: solo el rol `eca` puede tener una ECA.
  - `usuarios_eca_no_vacia`: la ECA no puede ser vacía ni de solo espacios.
  - Los usuarios que ya existían quedan con `NULL` y siguen funcionando.
- **Se quitó `AuthService.verificar()`**, que no usaba nadie. Validaba solo el token, sin consultar la base, y no podía devolver la ECA. Dejarlo invitaba a saltearse el control de revocación y de ECA.

## 2. Cómo se levanta y cómo se prueba

Igual que HU-14. Con el RLS que ya está en `dev`, el `.env` necesita además `DATABASE_APP_PASSWORD` (figura en `.env.example`). **Sin esa variable la API arranca, pero no puede conectarse como `ascensores_app`, y todo responde 503.**

| Prueba | Resultado (12/11/2026) |
|---|---|
| Línea base de `dev`, antes de tocar nada | API 215/215, web 111/111, `test:int` 34/34. Después se rebasó sobre el checklist de Gonzalo, ya mergeado, y se repitió todo: lo que sigue es de esa corrida |
| `npm run verify` | Tipos OK. API: 246 en verde, de los cuales 20 son nuevos (`auth-eca-usuario.e2e-spec`). Web: 123 en verde |
| `npm run test:int` | 37 en verde, de los cuales 2 son nuevos en `auth.int-spec`: la migración y las restricciones contra PostgreSQL real, y el alta con login, refresco, `/me` y cambio de ECA en la base |
| `bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RF-01-entrega.sh` | 28 verificaciones, 28 OK |
| `… RF-01-entrega.sh --carga 200` | 200 `GET /api/auth/me`, 0 fallidas · promedio 155 ms · p95 186 ms. Antes de rebasar, con la máquina cargada, había dado p95 de 257 y 303 ms; en esa misma corrida `/api/health`, que no toca nada de esto, tardaba 361 ms de promedio |
| Regresión de HU-14 | `RF-01-entrega.sh` 22/22, `RF-02-entrega.sh` 16/16, `RNF-01-entrega.sh` 23/23 |

## 3. Qué datos hacen falta

- El Administrador inicial, que se crea solo desde el `.env`.
- El script crea y borra sus propios usuarios, con el prefijo `hu15rf01-entrega-`.

## 4. Endpoints

| Método | Ruta | Cambio |
|---|---|---|
| `POST` | `/api/usuarios` | Cuerpo `{usuario, nombre, rol, password, eca?}`. `eca` es obligatoria para `rol: "eca"` y prohibida para los demás. **201** devuelve también `eca`; **400** por los casos de arriba |
| `POST` | `/api/auth/login`, `/api/auth/refresh` | `usuario.eca`: el nombre de la ECA, o `null` |
| `GET` | `/api/auth/me` | `eca`: el nombre de la ECA, o `null` |

## 4.5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RF-01-entrega.sh             # las 4 condiciones
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RF-01-entrega.sh --carga 200
bash docs/pruebas/hu-14-hu-14-acceso-por-rol-y-sesion/RF-01-entrega.sh              # regresión del módulo de autenticación
```

**Regresión:** el módulo de autenticación (HU-14) sigue con sus 3 scripts y todos sus tests en verde, con el RLS de Gonzalo ya integrado en `dev`.

## 5. Qué quedó afuera y qué se asumió

- **La ECA es texto libre.** No se valida contra los edificios, porque hoy no hay un catálogo de ECA: es el mismo nombre que figura en `consorcios.eca_nombre`. Un error de tipeo al crear el usuario deja al usuario sin ver nada. Conviene un catálogo cuando se arme la pantalla de usuarios.
- **No hay forma de cambiar la ECA de un usuario por API.** Solo se fija en el alta. Cambiarla hoy es un `UPDATE` en la base (así lo prueban el script y el test de integración). Un `PATCH /api/usuarios/:id` y la pantalla de usuarios no están en el backlog.
- **Los usuarios `eca` que ya existían quedan con `eca` `NULL`.** No hay nada que migrar: no había ninguno de verdad, solo los de prueba. Si hubiera, habría que cargarles la ECA a mano.
- **La migración se llama `011`.** `dev` ya tenía una `010` (`010_checklist_inspecciones`, del checklist), así que esta tarea se renumeró al rebasar. Quien haya aplicado antes la versión `010_eca_en_usuarios` (solo la base local de quien desarrolló esta tarea) tiene que renombrar su registro: `update schema_migrations set id = '011_eca_en_usuarios' where id = '010_eca_en_usuarios'`. Si no, la API intenta crear la columna otra vez, falla y no aplica nada más.
- **El RLS todavía lee los headers.** Esta tarea solo pone la ECA en la sesión; que el contexto del RLS salga de ahí es `RNF-03`, de Gonzalo, que ahora está destrabada.
- **Se corrigió el script de entrega de HU-14 (`RF-01-entrega.sh`)**, que daba de alta un usuario `eca` sin ECA y ahora recibiría 400. También se actualizaron dos tests viejos de `auth.e2e-spec.ts` por lo mismo.
- **`auth.int-spec.ts` ahora sube el timeout a 60 s.** Es el hallazgo de QA de HU-14: bcrypt de costo 12 hace que, con la máquina cargada, 5 s no alcance.
- **Un detalle de Windows en el script:** el cuerpo del alta viaja desde un archivo. Git Bash pasa los acentos de la ECA (`ó`, `ñ`) en la codificación de la consola y no en UTF-8, y la ECA se guardaba con caracteres de reemplazo. La API recibe UTF-8 correctamente cuando el cliente lo manda bien, y los tests de Node lo verifican.

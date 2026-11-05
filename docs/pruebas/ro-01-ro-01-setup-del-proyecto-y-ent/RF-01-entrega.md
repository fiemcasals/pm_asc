# RO-01 · Entrega — Setup del proyecto y entorno de desarrollo verificable

- **Tarea:** RO-01 / RF-01 — `REQ-1791560828605`
- **Rama:** `feature/ro-01-ro-01-setup-del-proyecto-y-ent/req-1791560828605-ro-01-setup-del-proyecto-y-entorno-de-de`
- **Guía con capturas:** [RF-01-setup-entorno.md](RF-01-setup-entorno.md)
- **Script del flujo integrado:** [RF-01-entrega.sh](RF-01-entrega.sh)

## 1. Qué quedó implementado

El proyecto ya se puede levantar y verificar de punta a punta en una máquina de desarrollo:

- una **app web instalable (PWA)** en `https://localhost:8050`, que registra su service worker y muestra el estado del sistema;
- una **API** (NestJS) con `GET /api/health`, que informa el estado de la API, de la base y la versión de PostGIS;
- una **base PostgreSQL 16 + PostGIS 3.4** que se levanta con Docker;
- **CORS** que autoriza solamente el origen de Scrum Master AI y solo fuera de producción, para que los Tests de "Verificación en vivo" puedan leer las respuestas.

## 2. Cómo se levanta y cómo se prueba

Requisitos: Node.js 22 o superior, Docker Desktop abierto y mkcert (`winget install FiloSottile.mkcert`).

```bash
npm install
cp .env.example .env
npm run certs          # genera certs/localhost.pem y certs/localhost-key.pem
mkcert -install        # una vez por máquina, para que el navegador confíe en el certificado
npm run db:up          # PostgreSQL + PostGIS en 127.0.0.1:5433
npm run dev            # API :3050 + web https://localhost:8050
```

Variables (`.env`, con valores de ejemplo en `.env.example`):

| Variable | Valor de desarrollo | Para qué |
|---|---|---|
| `NODE_ENV` | `development` | Con `production`, CORS se desactiva |
| `WEB_PORT` | `8050` | Puerto HTTPS de la web |
| `API_PORT` | `3050` | Puerto de la API (sólo escucha en 127.0.0.1) |
| `DATABASE_URL` | `postgres://ascensores:ascensores_dev@localhost:5433/ascensores` | Conexión a la base |
| `CORS_ORIGINS` | `https://scrum.nuestrocamino.cloud` | Orígenes autorizados por CORS (nunca `*`) |

**CORS (sólo en desarrollo):** está configurado en `apps/api/src/config.ts` y `apps/api/src/app.setup.ts`. Autoriza únicamente los orígenes de `CORS_ORIGINS`, rechaza `*` al arrancar y no se aplica con `NODE_ENV=production`. El servidor de Vite tiene su propio CORS desactivado (`cors: false`), así que la política la decide siempre la API, también cuando la petición pasa por el proxy `/api`.

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run verify` | Tipos OK. API: 15 tests, 15 en verde (Jest: `config`, `env-file`, `health`, `cors`). Web: 4 tests, 4 en verde (Vitest: `health`) |
| `npm run test:int` | 1 test, 1 en verde: `/api/health` contra PostGIS real informa `3.4.3` |
| `bash docs/pruebas/ro-01-ro-01-setup-del-proyecto-y-ent/RF-01-entrega.sh` | 9 verificaciones, 9 OK |
| Navegador (Chrome 156, Playwright) en `https://localhost:8050` | Sin aviso de certificado; `Service worker: Registrado`; 1 registro `dev-sw.js?dev-sw` en estado `activated`. Capturas en la [guía](RF-01-setup-entorno.md) |
| `… RF-01-entrega.sh --carga 200` | 200 corridas, 0 fallidas · promedio 76 ms · p95 126 ms · la más lenta 225 ms (05/11/2026, máquina de desarrollo con Windows 11) |

## 3. Qué datos hacen falta

Ninguno. No hay usuarios ni registros de negocio todavía. La base se crea vacía, con la extensión PostGIS.

## 4. Endpoints y pantallas

| Tipo | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/health` | 200 `{"status":"ok","api":"ok","db":{"status":"ok","postgis":"3.4.3"}}`. Si no hay base: **503** con `db.status: "error"` |
| `OPTIONS` | `/api/*` | Preflight CORS: 204 con `Access-Control-Allow-Origin` sólo para los orígenes autorizados |
| Pantalla | `https://localhost:8050/` | Título `Inspecciones de Ascensores`, tarjeta `Estado del sistema` con `API`, `Base de datos` y `Service worker` |
| Archivo | `/manifest.webmanifest` | Manifiesto de la PWA |

## 4.5. Cómo se corre integrado

Con `npm run db:up` y `npm run dev` levantados:

```bash
bash docs/pruebas/ro-01-ro-01-setup-del-proyecto-y-ent/RF-01-entrega.sh             # las 5 condiciones
bash docs/pruebas/ro-01-ro-01-setup-del-proyecto-y-ent/RF-01-entrega.sh --carga 200 # mismo GET, 200 veces, con tiempos
```

El script no deja datos. Para la condición 3 levanta una API en modo producción en el puerto 3051 y la apaga al terminar.

## 5. Qué quedó afuera y qué se asumió

- **El origen autorizado es el de Scrum, no `localhost:8050`.** La primera versión de la tarea pedía CORS "para https://localhost:8050", pero esa es la URL de la app. El origen que hay que autorizar es el de quien prueba desde el navegador, o sea Scrum Master AI. El PM corrigió la descripción antes de empezar.
- **La API escucha solo en `127.0.0.1:3050`.** Desde afuera se entra únicamente por la web (`https://localhost:8050/api/...`, a través del proxy de Vite).
- **HTTPS local con mkcert.** Cada máquina que pruebe tiene que correr `npm run certs` y `mkcert -install`. Sin el segundo paso, el navegador rechaza el certificado y los Tests de "Verificación en vivo" no llegan a la API.
- **El service worker se registra también en desarrollo** (`devOptions.enabled` de vite-plugin-pwa) para poder verificar la condición 5. Todavía no guarda nada para uso sin conexión: eso corresponde a las tareas del recorrido del RT.
- **Producción no está resuelta acá.** Falta definir cómo se sirven la web y la API (dominio, certificado, proxy). Es una tarea operacional aparte.
- **No hay ORM ni migraciones todavía.** La API usa `pg` directamente para el health check. Elegir y configurar las migraciones corresponde a la primera tarea con modelo de datos (HU-01, "API y Modelo de Datos de Consorcios y Máquinas").
- **Regresión:** RO-01 no pertenece a ningún módulo y no hay otras tareas integradas en `dev`, así que no hay batería de integración previa para correr.

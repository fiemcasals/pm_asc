# mant_asc — Inspecciones de Ascensores (CABA)

Monorepo del sistema de inspecciones: PWA para el RT en calle, portal web y API.

| Carpeta | Qué es | Tecnología |
|---|---|---|
| `apps/web` | App web instalable (PWA), funciona sin conexión | React + Vite + vite-plugin-pwa |
| `apps/api` | API REST, todas las rutas bajo `/api` | NestJS (Node.js) |
| `docker-compose.yml` | Base de datos de desarrollo | PostgreSQL 16 + PostGIS 3.4 |

## Requisitos

- Node.js 22 o superior y npm
- Docker Desktop (abierto)
- mkcert — Windows: `winget install FiloSottile.mkcert`

## Primera vez

```bash
npm install
cp .env.example .env      # valores de desarrollo
npm run certs             # certificado HTTPS para https://localhost:8050
mkcert -install           # una sola vez por máquina: hace que el navegador confíe en el certificado
```

## Día a día

```bash
npm run db:up    # levanta PostgreSQL + PostGIS (puerto 5433, sólo local)
npm run dev      # API en :3050 y web en https://localhost:8050 (redirige /api a la API)
```

Abrir https://localhost:8050 → muestra el estado de la API, la base y el service worker.

## Pruebas

```bash
npm run verify     # tipos + tests de API (Jest) y web (Vitest)
npm run test:int   # integración contra la base real (requiere npm run db:up)
```

## CORS (sólo desarrollo)

Los Tests de "Verificación en vivo" de Scrum Master AI los corre el navegador desde
`https://scrum.nuestrocamino.cloud`. Para que pueda leer las respuestas, la API autoriza
**ese origen y ningún otro** (`CORS_ORIGINS` en `.env`). Con `NODE_ENV=production` CORS
queda deshabilitado aunque la variable esté cargada. Nunca se usa `*`.

## Entregas y pruebas por tarea

Cada tarea deja su entrega en `docs/pruebas/<historia>/`: documento, script y guía con capturas.

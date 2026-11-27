import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const repoRoot = resolve(import.meta.dirname, '..', '..');

/** Certificado local generado con `npm run certs` (mkcert). */
function localHttps() {
  const key = resolve(repoRoot, 'certs', 'localhost-key.pem');
  const cert = resolve(repoRoot, 'certs', 'localhost.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    throw new Error(
      'Falta el certificado HTTPS local (certs/localhost.pem). Corré `npm run certs` en la raíz del repo.',
    );
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const webPort = Number(env.WEB_PORT ?? 8050);
  const apiPort = Number(env.API_PORT ?? 3050);
  // Vitest también carga este archivo, pero no levanta el servidor: ahí no hace falta HTTPS.
  const isDevServer = command === 'serve' && !process.env.VITEST;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false, // se registra explícitamente en src/main.tsx
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'Inspecciones de Ascensores',
          short_name: 'Inspecciones',
          description: 'Inspección de ascensores en CABA: recorrido del RT, checklist y firma.',
          lang: 'es-AR',
          theme_color: '#1d4ed8',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        },
        // En desarrollo también se registra el service worker, para poder verificarlo.
        devOptions: { enabled: true, type: 'module' },
        workbox: {
          // Al tocar un aviso del chat (HU-19 RF-10) se abre la conversación: lo hace public/sw-chat.js, que el service worker carga acá.
          importScripts: ['sw-chat.js'],
          // El mapa (HU-16 RF-03): sus tipografías (.pbf) y los íconos (.json) se guardan con la app. El archivo de
          // calles (caba.pmtiles, ~11 MB) NO: se baja a pedido con «Descargar mapa para usar sin señal».
          globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}', 'mapa/**/*.{pbf,json}'],
          navigateFallback: 'index.html',
          // /api es del servidor y /manual es el manual de uso (HTML servido aparte): el
          // service worker no los puede responder con el index de la app.
          navigateFallbackDenylist: [/^\/api\//, /^\/manual/],
          runtimeCaching: [
            {
              urlPattern: /\/api\/checklist\/config/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'checklist-config-v1',
                networkTimeoutSeconds: 3,
              },
            },
          ],
        },
      }),
    ],
    server: {
      port: webPort,
      strictPort: true,
      https: isDevServer ? localHttps() : undefined,
      // La política CORS la decide la API (apps/api/src/app.setup.ts), no el servidor de Vite.
      cors: false,
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
      https: !process.env.VITEST ? localHttps() : undefined,
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
      },
    },
  };
});

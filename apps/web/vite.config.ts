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
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
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

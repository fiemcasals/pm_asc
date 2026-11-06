// Genera el certificado HTTPS local para https://localhost:8050 con mkcert.
// Requiere mkcert instalado (Windows: `winget install FiloSottile.mkcert`).
// Para que el navegador confíe en el certificado, correr UNA vez: `mkcert -install`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '..', 'certs');
const cert = resolve(dir, 'localhost.pem');
const key = resolve(dir, 'localhost-key.pem');

mkdirSync(dir, { recursive: true });

const result = spawnSync(
  'mkcert',
  ['-cert-file', cert, '-key-file', key, 'localhost', '127.0.0.1', '::1'],
  { stdio: 'inherit' },
);

if (result.status !== 0 || !existsSync(cert) || !existsSync(key)) {
  console.error(
    '\nNo se pudo generar el certificado. Instalá mkcert ' +
      '(Windows: winget install FiloSottile.mkcert) y volvé a correr `npm run certs`.',
  );
  process.exit(1);
}

console.log(`\nCertificado listo en ${dir}`);
console.log('Si el navegador no confía en https://localhost:8050, corré una vez: mkcert -install');

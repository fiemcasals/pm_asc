import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/** El .env de desarrollo vive en la raíz del repo (dos niveles arriba de apps/api). */
export const ROOT_ENV_FILE = resolve(__dirname, '..', '..', '..', '.env');

/**
 * Carga las variables de un archivo .env en `target` sin pisar las que ya existen
 * (lo que viene del entorno real manda). Si el archivo no existe, no hace nada.
 *
 * No usa process.loadEnvFile() porque escribe sobre el process.env global, y en
 * entornos aislados (Jest) el objeto `process.env` visible es otro.
 */
export function loadEnvFileInto(target: NodeJS.ProcessEnv, file = ROOT_ENV_FILE): void {
  if (!existsSync(file)) return;
  const values = parseEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (target[key] === undefined) target[key] = value;
  }
}

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFileInto } from '../src/env-file';

describe('loadEnvFileInto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-file-'));
  const file = join(dir, '.env');
  writeFileSync(file, '# comentario\nDATABASE_URL=postgres://a@b:5433/c\nAPI_PORT=3050\n');

  it('carga las variables del archivo en el objeto indicado', () => {
    const target: NodeJS.ProcessEnv = {};
    loadEnvFileInto(target, file);
    expect(target).toEqual({ DATABASE_URL: 'postgres://a@b:5433/c', API_PORT: '3050' });
  });

  it('no pisa una variable que ya viene del entorno', () => {
    const target: NodeJS.ProcessEnv = { API_PORT: '9999' };
    loadEnvFileInto(target, file);
    expect(target.API_PORT).toBe('9999');
  });

  it('si el archivo no existe no hace nada', () => {
    const target: NodeJS.ProcessEnv = {};
    loadEnvFileInto(target, join(dir, 'no-existe.env'));
    expect(target).toEqual({});
  });
});

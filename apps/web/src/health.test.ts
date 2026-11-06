import { describe, expect, it } from 'vitest';
import { fetchHealth } from './health';

function respond(status: number, body: unknown): typeof fetch {
  return async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

describe('fetchHealth', () => {
  it('con API y base en orden devuelve la versión de PostGIS', async () => {
    const fetchFn = respond(200, { status: 'ok', api: 'ok', db: { status: 'ok', postgis: '3.4.3' } });
    expect(await fetchHealth(fetchFn)).toEqual({ kind: 'ok', postgis: '3.4.3' });
  });

  it('con la base caída (503) informa el error de base', async () => {
    const fetchFn = respond(503, {
      status: 'error',
      api: 'ok',
      db: { status: 'error', postgis: null, error: 'No se pudo conectar a la base de datos' },
    });
    expect(await fetchHealth(fetchFn)).toEqual({
      kind: 'db-error',
      message: 'No se pudo conectar a la base de datos',
    });
  });

  it('si la API no responde informa error de API', async () => {
    const fetchFn: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await fetchHealth(fetchFn)).toEqual({ kind: 'api-error', message: 'No se pudo contactar a la API' });
  });

  it('si la respuesta no es JSON informa error de API con el código', async () => {
    const fetchFn = respond(502, '<html>Bad Gateway</html>');
    expect(await fetchHealth(fetchFn)).toEqual({
      kind: 'api-error',
      message: 'La API respondió 502 sin un cuerpo válido',
    });
  });
});

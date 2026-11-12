import { APP_RLS_ROLE, deriveAppDatabaseUrl } from '../src/database/database.service';
import { getRlsContext, runWithEcaContext } from '../src/database/rls-context';

describe('Contexto RLS y usuario de aplicación (HU-15 RNF-01)', () => {
  it('deriva la URL de conexión con el rol runtime sin privilegios ni BYPASSRLS usando DATABASE_APP_PASSWORD', () => {
    const derived = deriveAppDatabaseUrl(
      'postgres://ascensores:ascensores_dev@localhost:5433/ascensores',
      undefined,
      'clave_app_env',
    );
    const url = new URL(derived);
    expect(url.username).toBe(APP_RLS_ROLE);
    expect(url.password).toBe('clave_app_env');
    expect(url.password).not.toBe('ascensores_dev');
    expect(url.pathname).toBe('/ascensores');
  });

  it('respeta DATABASE_APP_URL explícita y soporta cadena vacía sin fallar', () => {
    expect(deriveAppDatabaseUrl('postgres://a:b@localhost/db', 'postgres://custom:pw@localhost/db')).toBe(
      'postgres://custom:pw@localhost/db',
    );
    expect(deriveAppDatabaseUrl('')).toBe('');
  });

  it('aisla el contexto de ECA por invocación asíncrona con AsyncLocalStorage', async () => {
    expect(getRlsContext()).toBeUndefined();

    const resultados = await Promise.all([
      runWithEcaContext('ECA-ALPHA', async () => {
        await new Promise((r) => setTimeout(r, 15));
        return getRlsContext()?.eca;
      }),
      runWithEcaContext('ECA-BETA', async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRlsContext()?.eca;
      }),
      runWithEcaContext(null, async () => getRlsContext()?.eca),
    ]);

    expect(resultados).toEqual(['ECA-ALPHA', 'ECA-BETA', null]);
    expect(getRlsContext()).toBeUndefined();
  });
});

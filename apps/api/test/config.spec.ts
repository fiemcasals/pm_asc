import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  const SCRUM = 'https://scrum.nuestrocamino.cloud';

  it('en desarrollo toma los orígenes CORS de CORS_ORIGINS', () => {
    const config = loadConfig({ NODE_ENV: 'development', CORS_ORIGINS: `${SCRUM}, https://otro.local` });
    expect(config.corsOrigins).toEqual([SCRUM, 'https://otro.local']);
  });

  it('sin NODE_ENV asume desarrollo', () => {
    expect(loadConfig({ CORS_ORIGINS: SCRUM }).corsOrigins).toEqual([SCRUM]);
  });

  it('en producción ignora CORS_ORIGINS: no hay orígenes autorizados', () => {
    const config = loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: SCRUM });
    expect(config.corsOrigins).toEqual([]);
  });

  it('rechaza el comodín "*"', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', CORS_ORIGINS: '*' })).toThrow(/no admite/);
  });

  it('usa el puerto 3050 por defecto', () => {
    expect(loadConfig({}).port).toBe(3050);
  });
});

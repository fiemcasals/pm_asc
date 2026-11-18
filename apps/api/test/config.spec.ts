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

  describe('CANAL_FALLAS_VIGENCIA_SEG (HU-06 RF-07)', () => {
    it('sin configurar, el canal en tiempo real de fallas críticas dura 5 minutos', () => {
      expect(loadConfig({}).canalFallasVigenciaMs).toBe(300_000);
      expect(loadConfig({ CANAL_FALLAS_VIGENCIA_SEG: '  ' }).canalFallasVigenciaMs).toBe(300_000);
    });

    it.each([['1', 1_000], ['60', 60_000], ['900', 900_000]])('%s segundos → %i ms', (valor, ms) => {
      expect(loadConfig({ CANAL_FALLAS_VIGENCIA_SEG: valor }).canalFallasVigenciaMs).toBe(ms);
    });

    it.each([['0'], ['-5'], ['901'], ['1.5'], ['mucho'], ['3600']])('rechaza «%s»: tiene que ser un entero de segundos entre 1 y 900', (valor) => {
      expect(() => loadConfig({ CANAL_FALLAS_VIGENCIA_SEG: valor })).toThrow(/CANAL_FALLAS_VIGENCIA_SEG/);
    });
  });
});

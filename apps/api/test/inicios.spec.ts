import { distanciaMetros, evaluarPresencia } from '../src/inicios-inspeccion/inicios.logic';

// HU-16 RF-02: distancia al edificio y regla de presencia a 30 m.
const EDIFICIO = { latitud: -34.6118, longitud: -58.396 };
const al_norte = (grados: number) => ({ latitud: EDIFICIO.latitud + grados, longitud: EDIFICIO.longitud });
const gps = (p: { latitud: number; longitud: number }, precision = 5) => ({ ...p, precision });

describe('distanciaMetros', () => {
  it('el mismo punto está a 0 m y un grado de latitud son unos 111,2 km', () => {
    expect(distanciaMetros(EDIFICIO, EDIFICIO)).toBe(0);
    expect(distanciaMetros({ latitud: 0, longitud: 0 }, { latitud: 1, longitud: 0 })).toBeCloseTo(111_195, -1);
  });
  it('es simétrica y mide también hacia el este (la longitud se acorta con la latitud)', () => {
    const este = { latitud: EDIFICIO.latitud, longitud: EDIFICIO.longitud + 0.0003 };

    expect(distanciaMetros(EDIFICIO, este)).toBeCloseTo(distanciaMetros(este, EDIFICIO), 6);
    expect(distanciaMetros(EDIFICIO, este)).toBeCloseTo(0.0003 * 111_195 * Math.cos((34.6118 * Math.PI) / 180), 0);
  });
  it('0,00025° al norte son unos 27,8 m y 0,0003° unos 33,4 m', () => {
    expect(distanciaMetros(EDIFICIO, al_norte(0.00025))).toBeCloseTo(27.8, 0);
    expect(distanciaMetros(EDIFICIO, al_norte(0.0003))).toBeCloseTo(33.4, 0);
  });
});

describe('evaluarPresencia (criterio 2: iniciar a 30 m o menos)', () => {
  it('buena señal y a 27,8 m → puede iniciar, con la distancia', () => {
    expect(evaluarPresencia(gps(al_norte(0.00025)), EDIFICIO, 30, 30)).toEqual({ resultado: 'puede_iniciar', distanciaM: 27.8 });
  });
  it('buena señal y a 33,4 m → lejos, con la distancia', () => {
    expect(evaluarPresencia(gps(al_norte(0.0003)), EDIFICIO, 30, 30)).toEqual({ resultado: 'lejos', distanciaM: 33.4 });
  });
  it('encima del edificio (0 m) puede iniciar', () => {
    expect(evaluarPresencia(gps(EDIFICIO), EDIFICIO, 30, 30)).toEqual({ resultado: 'puede_iniciar', distanciaM: 0 });
  });
  it('el borde cuenta: a exactamente el radio todavía puede iniciar y 0,1 m más ya no', () => {
    const d = (evaluarPresencia(gps(al_norte(0.00025)), EDIFICIO, 30, 30) as { distanciaM: number }).distanciaM;

    expect(evaluarPresencia(gps(al_norte(0.00025)), EDIFICIO, d, 30).resultado).toBe('puede_iniciar');
    expect(evaluarPresencia(gps(al_norte(0.00025)), EDIFICIO, d - 0.1, 30).resultado).toBe('lejos');
  });
  it('criterio 3: con precisión peor que la máxima → sin buena señal, esté cerca o lejos', () => {
    expect(evaluarPresencia(gps(al_norte(0.00025), 45), EDIFICIO, 30, 30)).toEqual({ resultado: 'sin_buena_senal', distanciaM: 27.8 });
    expect(evaluarPresencia(gps(al_norte(0.01), 45), EDIFICIO, 30, 30).resultado).toBe('sin_buena_senal');
  });
  it('la precisión justo en el máximo todavía es buena señal; 0,1 m peor ya no', () => {
    expect(evaluarPresencia(gps(EDIFICIO, 30), EDIFICIO, 30, 30).resultado).toBe('puede_iniciar');
    expect(evaluarPresencia(gps(EDIFICIO, 30.1), EDIFICIO, 30, 30).resultado).toBe('sin_buena_senal');
  });
  it('un edificio sin punto en el mapa no se puede verificar: sin buena señal con distancia null', () => {
    expect(evaluarPresencia(gps(EDIFICIO), null, 30, 30)).toEqual({ resultado: 'sin_buena_senal', distanciaM: null });
  });
});

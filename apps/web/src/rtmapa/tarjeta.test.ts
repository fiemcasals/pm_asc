import { describe, expect, it, vi } from 'vitest';
import {
  cuerpoInicio, distanciaMetros, enlaceComoLlegar, enlaceLlamada, enviarInicio, evaluarPresencia, mostrarBotonesDeInicio, puedeSeguirSinSenal, type Presencia,
} from './tarjeta';

// HU-16 RF-02: tarjeta del edificio, llamar, cómo llegar y presencia a 30 m.
const PUNTO = { latitud: -34.6118, longitud: -58.396 };
const edificio = { ubicacion: PUNTO, direccion: 'Av. Rivadavia 1234, CABA' };
const gps = (dLat: number, precision = 6) => ({ motivo: 'inicio-inspeccion' as const, latitud: PUNTO.latitud + dLat, longitud: PUNTO.longitud, precision, tomadaEn: '2026-11-17T13:00:00.000Z' });
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 400, status, json: async () => cuerpo }) as Response;
const MALA = { foto: null, justificacion: '' };
const BUENA = { foto: 'data:image/jpeg;base64,AAAA', justificacion: 'Entre edificios altos no mejora' };

describe('enlaceLlamada (criterio 1: el botón abre el marcador con el teléfono del encargado)', () => {
  it('arma tel: con el teléfono limpio, conservando el + inicial', () => {
    expect(enlaceLlamada('11 4444-5555')).toBe('tel:1144445555');
    expect(enlaceLlamada('+54 9 11 4444-5555')).toBe('tel:+5491144445555');
    expect(enlaceLlamada('(011) 4444 5555')).toBe('tel:01144445555');
  });
  it('sin teléfono o con algo que no lo es → null (no se muestra el botón)', () => {
    expect(enlaceLlamada(null)).toBeNull();
    expect(enlaceLlamada('')).toBeNull();
    expect(enlaceLlamada('   ')).toBeNull();
    expect(enlaceLlamada('sin teléfono')).toBeNull();
    expect(enlaceLlamada('123')).toBeNull();
  });
});

describe('enlaceComoLlegar (criterio 1: abre Google Maps con destino en el edificio)', () => {
  it('con punto en el mapa usa sus coordenadas', () => {
    expect(enlaceComoLlegar(edificio)).toBe('https://www.google.com/maps/dir/?api=1&destination=-34.6118%2C-58.396&travelmode=driving');
  });
  it('sin punto usa la dirección, codificada', () => {
    expect(enlaceComoLlegar({ ubicacion: null, direccion: 'Av. Rivadavia 1234, CABA' })).toBe('https://www.google.com/maps/dir/?api=1&destination=Av.%20Rivadavia%201234%2C%20CABA&travelmode=driving');
  });
});

describe('distanciaMetros', () => {
  it('es la misma que la de la API: 0,00025° al norte son unos 27,8 m', () => {
    expect(distanciaMetros(PUNTO, gps(0.00025))).toBeCloseTo(27.8, 0);
    expect(distanciaMetros(PUNTO, PUNTO)).toBe(0);
  });
});

describe('evaluarPresencia (criterio 2: a 30 m o menos aparecen los botones; más lejos no)', () => {
  it('a 27,8 m con buena señal → puede iniciar', () => {
    expect(evaluarPresencia(gps(0.00025), edificio)).toEqual({ resultado: 'puede_iniciar', distanciaM: 27.8 });
  });
  it('a 33,4 m con buena señal → lejos', () => {
    expect(evaluarPresencia(gps(0.0003), edificio)).toEqual({ resultado: 'lejos', distanciaM: 33.4 });
  });
  it('el borde: con el radio igual a la distancia todavía puede iniciar, 0,1 m menos ya no', () => {
    expect(evaluarPresencia(gps(0.00025), edificio, { radioM: 27.8, precisionMaxM: 30 }).resultado).toBe('puede_iniciar');
    expect(evaluarPresencia(gps(0.00025), edificio, { radioM: 27.7, precisionMaxM: 30 }).resultado).toBe('lejos');
  });
  it('usa las reglas que manda la API (radio de 50 m: a 33,4 m ya puede iniciar)', () => {
    expect(evaluarPresencia(gps(0.0003), edificio, { radioM: 50, precisionMaxM: 30 }).resultado).toBe('puede_iniciar');
  });
  it('criterio 3: con precisión peor que la máxima → sin buena señal, cerca o lejos; en el máximo justo es buena señal', () => {
    expect(evaluarPresencia(gps(0.00025, 45), edificio).resultado).toBe('sin_buena_senal');
    expect(evaluarPresencia(gps(0.01, 45), edificio).resultado).toBe('sin_buena_senal');
    expect(evaluarPresencia(gps(0, 30), edificio).resultado).toBe('puede_iniciar');
    expect(evaluarPresencia(gps(0, 30.1), edificio).resultado).toBe('sin_buena_senal');
  });
  it('un edificio sin punto no se puede verificar: sin buena señal', () => {
    expect(evaluarPresencia(gps(0), { ubicacion: null })).toEqual({ resultado: 'sin_buena_senal', distanciaM: null });
  });
});

describe('puedeSeguirSinSenal y mostrarBotonesDeInicio (criterio 3)', () => {
  const cerca: Presencia = { resultado: 'puede_iniciar', distanciaM: 20 };
  const lejos: Presencia = { resultado: 'lejos', distanciaM: 200 };
  const sin: Presencia = { resultado: 'sin_buena_senal', distanciaM: null };

  it('con mala señal hacen falta la foto Y una justificación de al menos 10 caracteres', () => {
    expect(puedeSeguirSinSenal(BUENA)).toBe(true);
    expect(puedeSeguirSinSenal({ foto: null, justificacion: BUENA.justificacion })).toBe(false);
    expect(puedeSeguirSinSenal({ foto: '', justificacion: BUENA.justificacion })).toBe(false);
    expect(puedeSeguirSinSenal({ foto: BUENA.foto, justificacion: '' })).toBe(false);
    expect(puedeSeguirSinSenal({ foto: BUENA.foto, justificacion: '         ' })).toBe(false);
    expect(puedeSeguirSinSenal({ foto: BUENA.foto, justificacion: 'no anda' })).toBe(false);
    expect(puedeSeguirSinSenal({ foto: BUENA.foto, justificacion: '  1234567890  ' })).toBe(true);
    expect(puedeSeguirSinSenal({ foto: BUENA.foto, justificacion: '123456789' })).toBe(false);
  });
  it('los botones aparecen a 30 m con buena señal, no más lejos, y con mala señal sólo con foto y justificación', () => {
    expect(mostrarBotonesDeInicio(null, MALA)).toBe(false);
    expect(mostrarBotonesDeInicio(cerca, MALA)).toBe(true);
    expect(mostrarBotonesDeInicio(lejos, BUENA)).toBe(false); // lejos con buena señal: ni con foto
    expect(mostrarBotonesDeInicio(sin, MALA)).toBe(false);
    expect(mostrarBotonesDeInicio(sin, BUENA)).toBe(true);
  });
});

describe('cuerpoInicio (criterio 4: coordenadas, precisión y hora del dispositivo; la hora del servidor la pone la API)', () => {
  const ahora = new Date('2026-11-17T13:00:30Z');
  it('con buena señal manda GPS, precisión, hora del GPS y hora del dispositivo, sin foto ni justificación', () => {
    const c = cuerpoInicio('e1', gps(0.00025), { resultado: 'puede_iniciar', distanciaM: 27.8 }, BUENA, ahora);

    expect(c).toEqual({
      consorcioId: 'e1',
      gps: { latitud: PUNTO.latitud + 0.00025, longitud: PUNTO.longitud, precision: 6, timestamp: '2026-11-17T13:00:00.000Z' },
      horaDispositivo: '2026-11-17T13:00:30.000Z',
    });
    expect(c).not.toHaveProperty('horaServidor');
    expect(c).not.toHaveProperty('distanciaM');
    expect(c).not.toHaveProperty('usuario');
  });
  it('sin buena señal agrega la foto y la justificación (sin espacios en los bordes)', () => {
    const c = cuerpoInicio('e1', gps(0, 90), { resultado: 'sin_buena_senal', distanciaM: null }, { foto: BUENA.foto, justificacion: '  Entre edificios altos  ' }, ahora);

    expect(c).toMatchObject({ fotoFrenteUrl: BUENA.foto, justificacion: 'Entre edificios altos' });
  });
});

describe('enviarInicio', () => {
  it('registra y devuelve el inicio', async () => {
    const enviar = vi.fn().mockResolvedValue(respuesta(201, { id: 'i1', distanciaM: 27.8, sinBuenaSenal: false, revision: 'no_requiere' }));

    const r = await enviarInicio('e1', gps(0.00025), { resultado: 'puede_iniciar', distanciaM: 27.8 }, MALA, enviar);

    expect(r).toEqual({ ok: true, inicio: { id: 'i1', distanciaM: 27.8, sinBuenaSenal: false, revision: 'no_requiere' } });
    expect(enviar).toHaveBeenCalledWith('/api/inicios-inspeccion', expect.objectContaining({ method: 'POST' }));
  });
  it('si la API rechaza devuelve su motivo (409 de distancia, 400 de datos); un corte de red también', async () => {
    const lejos = await enviarInicio('e1', gps(0.0003), { resultado: 'puede_iniciar', distanciaM: 20 }, MALA, vi.fn().mockResolvedValue(respuesta(409, { message: 'Estás a 33 m del edificio: tenés que estar a 30 m o menos.' })));
    expect(lejos).toEqual({ ok: false, error: 'Estás a 33 m del edificio: tenés que estar a 30 m o menos.' });
    const faltan = await enviarInicio('e1', gps(0, 90), { resultado: 'sin_buena_senal', distanciaM: null }, MALA, vi.fn().mockResolvedValue(respuesta(400, { message: 'Datos inválidos', errores: ['Sin buena señal GPS: hace falta la foto'] })));
    expect(faltan).toEqual({ ok: false, error: 'Sin buena señal GPS: hace falta la foto' });
    expect(await enviarInicio('e1', gps(0), { resultado: 'puede_iniciar', distanciaM: 0 }, MALA, vi.fn().mockRejectedValue(new Error('Sin conexión')))).toEqual({ ok: false, error: 'Sin conexión' });
  });
});

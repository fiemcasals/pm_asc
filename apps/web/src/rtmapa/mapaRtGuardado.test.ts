import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_MAPA_RT, SesionRevocadaError, cerrarSesion } from '../auth/sesion';
import { type MapaRt, borrarMapaRtGuardado, cargarMapaRtConRespaldo, guardarMapaRt, horaDeLosDatos, leerMapaRtGuardado } from './mapaRt';

const mapa: MapaRt = {
  rt: { nombre: 'rt.carla', zona: 'Zona Norte' },
  ahora: '2026-11-21T17:30:00.000Z',
  feriados: [],
  presencia: { radioM: 30, precisionMaxM: 50 },
  edificios: [
    { id: 'e1', nombre: 'DEMO Santa Fe 3200', direccion: 'Av. Santa Fe 3200', ubicacion: { latitud: -34.59, longitud: -58.41 }, aCoordinar: false, franjas: {}, encargado: { nombre: 'Ana', telefono: null } },
  ],
};

function almacenFalso(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  };
}

const respuesta = (ok: boolean, cuerpo: unknown = {}) => ({ ok, status: ok ? 200 : 500, json: async () => cuerpo }) as Response;
const AHORA = new Date('2026-11-21T17:30:00.000Z');

describe('datos guardados del Mapa del RT (HU-16 RF-05, criterio 3)', () => {
  it('guardar y leer devuelve el mapa y cuándo se descargó', () => {
    const almacen = almacenFalso();
    guardarMapaRt(mapa, AHORA, almacen);

    expect(leerMapaRtGuardado(almacen)).toEqual({ mapa, descargadoEn: '2026-11-21T17:30:00.000Z' });
  });

  it('sin datos, o con datos dañados o de otra forma, devuelve null', () => {
    expect(leerMapaRtGuardado(almacenFalso())).toBeNull();
    expect(leerMapaRtGuardado(almacenFalso({ [CLAVE_MAPA_RT]: 'no es json' }))).toBeNull();
    expect(leerMapaRtGuardado(almacenFalso({ [CLAVE_MAPA_RT]: JSON.stringify({ mapa: { edificios: 'x' }, descargadoEn: 'ayer' }) }))).toBeNull();
    expect(leerMapaRtGuardado(almacenFalso({ [CLAVE_MAPA_RT]: JSON.stringify({ mapa, descargadoEn: 'no es una fecha' }) }))).toBeNull();
  });

  it('si el almacenamiento falla (lleno o bloqueado) no rompe nada', () => {
    const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); }, removeItem: () => { throw new Error('x'); } };

    expect(() => guardarMapaRt(mapa, AHORA, roto)).not.toThrow();
    expect(leerMapaRtGuardado(roto)).toBeNull();
    expect(() => borrarMapaRtGuardado(roto)).not.toThrow();
  });

  it('borrarMapaRtGuardado deja el almacenamiento sin esos datos', () => {
    const almacen = almacenFalso();
    guardarMapaRt(mapa, AHORA, almacen);
    borrarMapaRtGuardado(almacen);

    expect(leerMapaRtGuardado(almacen)).toBeNull();
  });
});

describe('cargarMapaRtConRespaldo', () => {
  it('con conexión devuelve el mapa del servidor y lo deja guardado', async () => {
    const almacen = almacenFalso();
    const r = await cargarMapaRtConRespaldo(vi.fn().mockResolvedValue(respuesta(true, mapa)), almacen, () => AHORA);

    expect(r).toEqual({ origen: 'servidor', mapa });
    expect(leerMapaRtGuardado(almacen)?.descargadoEn).toBe('2026-11-21T17:30:00.000Z');
  });

  it('sin conexión devuelve los últimos datos guardados y la hora en que se bajaron', async () => {
    const almacen = almacenFalso();
    guardarMapaRt(mapa, AHORA, almacen);
    const r = await cargarMapaRtConRespaldo(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')), almacen);

    expect(r).toEqual({ origen: 'guardado', mapa, descargadoEn: '2026-11-21T17:30:00.000Z' });
  });

  it('sin conexión y sin datos guardados devuelve null', async () => {
    expect(await cargarMapaRtConRespaldo(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')), almacenFalso())).toBeNull();
  });

  it('un error del servidor no se tapa con datos viejos', async () => {
    const almacen = almacenFalso();
    guardarMapaRt(mapa, AHORA, almacen);

    expect(await cargarMapaRtConRespaldo(vi.fn().mockResolvedValue(respuesta(false)), almacen)).toBeNull();
  });

  it('una sesión revocada tampoco: no se muestran edificios a quien ya no tiene sesión', async () => {
    const almacen = almacenFalso();
    guardarMapaRt(mapa, AHORA, almacen);

    expect(await cargarMapaRtConRespaldo(vi.fn().mockRejectedValue(new SesionRevocadaError()), almacen)).toBeNull();
  });

  it('una descarga que falla no pisa los datos guardados', async () => {
    const almacen = almacenFalso();
    guardarMapaRt(mapa, AHORA, almacen);
    await cargarMapaRtConRespaldo(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')), almacen, () => new Date('2026-11-22T10:00:00Z'));

    expect(leerMapaRtGuardado(almacen)?.descargadoEn).toBe('2026-11-21T17:30:00.000Z');
  });
});

describe('horaDeLosDatos', () => {
  it('dice la hora y la fecha de Buenos Aires: «las 14:30 del 21/11/2026»', () => {
    expect(horaDeLosDatos('2026-11-21T17:30:00.000Z')).toBe('las 14:30 del 21/11/2026');
  });

  it('pasa al día anterior si en Buenos Aires todavía no cambió la fecha', () => {
    expect(horaDeLosDatos('2026-11-22T01:05:00.000Z')).toBe('las 22:05 del 21/11/2026');
  });
});

describe('cerrar sesión borra los datos guardados', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('los edificios del RT no quedan en el celular después de cerrar sesión', async () => {
    const almacen = almacenFalso();
    guardarMapaRt(mapa, AHORA, almacen);
    vi.stubGlobal('localStorage', almacen);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('sin señal')));

    await cerrarSesion();

    expect(almacen.datos.has(CLAVE_MAPA_RT)).toBe(false);
  });
});

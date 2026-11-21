import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_RECORRIDO_RT, SesionRevocadaError, cerrarSesion } from '../auth/sesion';
import {
  type EdificioRecorrido,
  cargarRecorridoConRespaldo,
  leerRecorridoGuardado,
  sacarDelRecorridoGuardado,
} from './constanciaVisita';

/** La lista «Edificios pendientes de hoy» sin conexión (HU-07 RF-07). */

const EDIFICIOS: EdificioRecorrido[] = [
  { id: 'a', nombre: 'DEMO Cabildo 1540', direccion: 'Av. Cabildo 1540, CABA', bloqueado: false, visitaFallidaHoy: false },
  { id: 'b', nombre: 'DEMO Corrientes 100', direccion: 'Av. Corrientes 100, CABA', bloqueado: false, visitaFallidaHoy: false },
] as EdificioRecorrido[];
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 400, status, json: async () => cuerpo }) as Response;
const sinRed = () => vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
const HORA = new Date('2026-11-21T18:15:00.000Z'); // 15:15 en Buenos Aires

function almacen() {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  };
}

describe('cargarRecorridoConRespaldo (HU-07 RF-07)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('con conexión devuelve la lista y la guarda con su usuario y su hora', async () => {
    const a = almacen();
    const r = await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, EDIFICIOS)), 'rt.beto', a, () => HORA);
    expect(r).toEqual({ tipo: 'servidor', edificios: EDIFICIOS });
    expect(leerRecorridoGuardado('rt.beto', a)).toEqual({ usuario: 'rt.beto', edificios: EDIFICIOS, descargadoEn: HORA.toISOString() });
  });

  it('criterio 1: sin conexión y sin lista guardada devuelve sin_conexion (nunca se queda cargando)', async () => {
    expect(await cargarRecorridoConRespaldo(sinRed(), 'rt.beto', almacen())).toEqual({ tipo: 'sin_conexion' });
  });

  it('criterio 2: sin conexión devuelve la última lista guardada con la hora de la descarga', async () => {
    const a = almacen();
    await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, EDIFICIOS)), 'rt.beto', a, () => HORA);
    expect(await cargarRecorridoConRespaldo(sinRed(), 'rt.beto', a)).toEqual({ tipo: 'guardado', edificios: EDIFICIOS, descargadoEn: HORA.toISOString() });
  });

  it('criterio 3: al volver la conexión, el siguiente intento trae la lista nueva y reemplaza la guardada', async () => {
    const a = almacen();
    await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, EDIFICIOS)), 'rt.beto', a, () => HORA);
    const nueva = [EDIFICIOS[1]];
    const luego = new Date('2026-11-21T19:00:00.000Z');
    expect(await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, nueva)), 'rt.beto', a, () => luego)).toEqual({ tipo: 'servidor', edificios: nueva });
    expect(leerRecorridoGuardado('rt.beto', a)?.descargadoEn).toBe(luego.toISOString());
  });

  it('criterio 4: un error del servidor devuelve error y no se tapa con la lista vieja', async () => {
    const a = almacen();
    await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, EDIFICIOS)), 'rt.beto', a, () => HORA);
    expect(await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(500, {})), 'rt.beto', a)).toEqual({ tipo: 'error' });
    expect(await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, { no: 'es una lista' })), 'rt.beto', a)).toEqual({ tipo: 'error' });
  });

  it('una sesión revocada devuelve error, no la lista guardada', async () => {
    const a = almacen();
    await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, EDIFICIOS)), 'rt.beto', a, () => HORA);
    expect(await cargarRecorridoConRespaldo(vi.fn().mockRejectedValue(new SesionRevocadaError()), 'rt.beto', a)).toEqual({ tipo: 'error' });
  });

  it('criterio 5: otro usuario en el mismo celular no ve la lista guardada', async () => {
    const a = almacen();
    await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, EDIFICIOS)), 'rt.beto', a, () => HORA);
    expect(await cargarRecorridoConRespaldo(sinRed(), 'rt.ana', a)).toEqual({ tipo: 'sin_conexion' });
    expect(await cargarRecorridoConRespaldo(sinRed(), null, a)).toEqual({ tipo: 'sin_conexion' });
  });

  it('criterio 5: al cerrar sesión se borra la lista guardada', async () => {
    vi.stubGlobal('localStorage', almacen()); // las pruebas corren en Node, sin navegador
    await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, EDIFICIOS)), 'rt.beto', localStorage, () => HORA);
    expect(localStorage.getItem(CLAVE_RECORRIDO_RT)).not.toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await cerrarSesion();
    expect(localStorage.getItem(CLAVE_RECORRIDO_RT)).toBeNull();
  });

  it('una lista guardada dañada se ignora', async () => {
    const a = almacen();
    a.setItem(CLAVE_RECORRIDO_RT, '{roto');
    expect(await cargarRecorridoConRespaldo(sinRed(), 'rt.beto', a)).toEqual({ tipo: 'sin_conexion' });
    a.setItem(CLAVE_RECORRIDO_RT, JSON.stringify({ usuario: 'rt.beto', edificios: 'x', descargadoEn: 'ayer' }));
    expect(leerRecorridoGuardado('rt.beto', a)).toBeNull();
  });

  it('si no hay lugar para guardar, la lista igual se muestra', async () => {
    const lleno = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => undefined };
    expect(await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, EDIFICIOS)), 'rt.beto', lleno)).toEqual({ tipo: 'servidor', edificios: EDIFICIOS });
  });

  it('al guardar una constancia, el edificio sale también de la lista guardada sin cambiar la hora', async () => {
    const a = almacen();
    await cargarRecorridoConRespaldo(vi.fn().mockResolvedValue(respuesta(200, EDIFICIOS)), 'rt.beto', a, () => HORA);
    sacarDelRecorridoGuardado('rt.beto', 'a', a);
    expect(leerRecorridoGuardado('rt.beto', a)).toEqual({ usuario: 'rt.beto', edificios: [EDIFICIOS[1]], descargadoEn: HORA.toISOString() });
  });
});

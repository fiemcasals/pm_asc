import { describe, expect, it, vi } from 'vitest';
import { CLAVE_INSPECCION_RT, cerrarSesion } from '../auth/sesion';
import { type EdificioInspeccion, guardarEdificioEnInspeccion, leerEdificioEnInspeccion } from './navegacion';

/** HU-17 RF-10: la Inspección Técnica trabaja sobre el edificio cuya visita inició el RT, aunque se recargue la página sin señal. */

const EDIFICIO: EdificioInspeccion = {
  consorcioId: 'c-cabildo',
  nombre: 'DEMO Cabildo 1540',
  equipos: [{ maquinaId: 'm-1', firmanteMaquinaId: 'MAQ-c-cabildo-m-1', referenciaAgc: 'M1', descripcion: '', tipo: 'traccion', salaCompartidaId: null }],
  pisos: ['PB', '1'],
};

function almacen() {
  const datos = new Map<string, string>();
  return { datos, getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v), removeItem: (k: string) => void datos.delete(k) };
}

describe('edificio en inspección (HU-17 RF-10)', () => {
  it('el edificio cuya visita inició el RT se guarda y se recupera con sus equipos (sobrevive a una recarga)', () => {
    const a = almacen();
    guardarEdificioEnInspeccion('rt.beto', EDIFICIO, a);
    expect(leerEdificioEnInspeccion('rt.beto', a)).toEqual(EDIFICIO);
  });

  it('otro usuario en el mismo celular no recibe el edificio del anterior', () => {
    const a = almacen();
    guardarEdificioEnInspeccion('rt.beto', EDIFICIO, a);
    expect(leerEdificioEnInspeccion('rt.ana', a)).toBeNull();
  });

  it('sin nada guardado o con un dato dañado no hay edificio (la pantalla explica cómo iniciar la visita)', () => {
    const a = almacen();
    expect(leerEdificioEnInspeccion('rt.beto', a)).toBeNull();
    a.setItem(CLAVE_INSPECCION_RT, '{roto');
    expect(leerEdificioEnInspeccion('rt.beto', a)).toBeNull();
    a.setItem(CLAVE_INSPECCION_RT, JSON.stringify({ usuario: 'rt.beto', edificio: { nombre: 'x' } }));
    expect(leerEdificioEnInspeccion('rt.beto', a)).toBeNull();
  });

  it('guardar null lo borra; si el almacenamiento está lleno no rompe', () => {
    const a = almacen();
    guardarEdificioEnInspeccion('rt.beto', EDIFICIO, a);
    guardarEdificioEnInspeccion('rt.beto', null, a);
    expect(leerEdificioEnInspeccion('rt.beto', a)).toBeNull();
    const lleno = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => undefined };
    expect(() => guardarEdificioEnInspeccion('rt.beto', EDIFICIO, lleno)).not.toThrow();
  });

  it('cerrar sesión borra el edificio en inspección', async () => {
    const a = almacen();
    vi.stubGlobal('localStorage', a);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    guardarEdificioEnInspeccion('rt.beto', EDIFICIO);
    await cerrarSesion();
    expect(a.getItem(CLAVE_INSPECCION_RT)).toBeNull();
    vi.unstubAllGlobals();
  });
});

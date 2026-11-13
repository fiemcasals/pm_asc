import { describe, expect, it, vi } from 'vitest';

// Las llamadas a la API llevan la sesión (fetchConSesion): acá delega en el fetch simulado de cada prueba.
vi.mock('../auth/sesion', () => ({
  fetchConSesion: (url: string, init?: RequestInit) =>
    init === undefined ? (globalThis.fetch as typeof fetch)(url) : (globalThis.fetch as typeof fetch)(url, init),
}));
import {
  FormularioRoles,
  ROLES_DE_TRABAJO,
  RolesEdificio,
  directorioPorRol,
  fetchRoles,
  formularioDesdeRoles,
  guardarRoles,
  marcarCambiosSinGuardar,
  mismoNombre,
  puedeSalir,
  ternaAsignada,
} from './roles';

const ID = '11111111-1111-1111-1111-111111111111';

const sinTerna: RolesEdificio = {
  consorcioId: ID,
  rtCalle: null,
  firmante: null,
  eca: null,
  actualizadoEn: null,
};

const conTerna: RolesEdificio = {
  consorcioId: ID,
  rtCalle: { nombre: 'Laura Gómez', telefono: '11 4000-1000', email: null, porcentaje: 60 },
  firmante: { nombre: 'Ing. Pablo Ruiz', telefono: null, email: 'pablo@maicon.test', porcentaje: 25 },
  eca: { nombre: 'Conservación Porteña', telefono: null, email: 'eca@maicon.test', porcentaje: null },
  actualizadoEn: '2026-11-06T10:00:00.000Z',
};

const formulario: FormularioRoles = {
  rtCalle: { nombre: '  Laura Gómez ', telefono: ' 11 4000-1000 ', email: '  ' },
  firmante: { nombre: 'Ing. Pablo Ruiz', telefono: '', email: 'pablo@maicon.test' },
  eca: { nombre: 'Conservación Porteña', telefono: '', email: 'eca@maicon.test' },
};

describe('roles de trabajo', () => {
  it('presenta los tres roles con los porcentajes definidos', () => {
    expect(ROLES_DE_TRABAJO.map((r) => r.etiqueta)).toEqual([
      'RT Calle (60%)',
      'Firmante AGC (25%)',
      'ECA Responsable',
    ]);
  });

  describe('formularioDesdeRoles', () => {
    it('deja los campos vacíos cuando no hay terna', () => {
      expect(formularioDesdeRoles(sinTerna).rtCalle).toEqual({ nombre: '', telefono: '', email: '' });
    });

    it('convierte los contactos ausentes en texto vacío', () => {
      expect(formularioDesdeRoles(conTerna).rtCalle).toEqual({
        nombre: 'Laura Gómez',
        telefono: '11 4000-1000',
        email: '',
      });
    });
  });

  describe('ternaAsignada', () => {
    it('distingue un edificio con terna de uno sin terna o sin datos', () => {
      expect(ternaAsignada(conTerna)).toBe(true);
      expect(ternaAsignada(sinTerna)).toBe(false);
      expect(ternaAsignada(undefined)).toBe(false);
    });
  });

  describe('mismoNombre', () => {
    it('ignora mayúsculas y espacios de los extremos', () => {
      expect(mismoNombre(' LAURA GÓMEZ ', 'Laura Gómez')).toBe(true);
      expect(mismoNombre('Laura Gómez', 'Laura Gomez')).toBe(false);
    });
  });

  describe('puedeSalir', () => {
    it('no pregunta si no hay cambios', () => {
      const confirm = vi.fn();
      vi.stubGlobal('window', { confirm });
      marcarCambiosSinGuardar(false);
      expect(puedeSalir()).toBe(true);
      expect(confirm).not.toHaveBeenCalled();
    });

    it('frena la salida si se rechaza y mantiene el aviso', () => {
      const confirm = vi.fn().mockReturnValue(false);
      vi.stubGlobal('window', { confirm });
      marcarCambiosSinGuardar(true);
      expect(puedeSalir()).toBe(false);
      expect(puedeSalir()).toBe(false);
      expect(confirm).toHaveBeenCalledTimes(2);
    });

    it('permite salir si se confirma y no vuelve a preguntar', () => {
      const confirm = vi.fn().mockReturnValue(true);
      vi.stubGlobal('window', { confirm });
      marcarCambiosSinGuardar(true);
      expect(puedeSalir()).toBe(true);
      expect(puedeSalir()).toBe(true);
      expect(confirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('directorioPorRol', () => {
    it('ofrece en cada selector sólo a quienes ocupan ese rol', () => {
      const directorio = directorioPorRol([sinTerna, conTerna]);
      expect(directorio.rtCalle.map((p) => p.nombre)).toEqual(['Laura Gómez']);
      expect(directorio.eca.map((p) => p.nombre)).toEqual(['Conservación Porteña']);
    });

    it('no repite un nombre y conserva el contacto de la asignación más reciente', () => {
      const anterior: RolesEdificio = {
        ...conTerna,
        consorcioId: 'otro',
        rtCalle: { nombre: 'LAURA GÓMEZ', telefono: 'viejo', email: null, porcentaje: 60 },
        actualizadoEn: '2026-01-01T10:00:00.000Z',
      };
      const directorio = directorioPorRol([anterior, conTerna]);
      expect(directorio.rtCalle).toEqual([
        { nombre: 'Laura Gómez', telefono: '11 4000-1000', email: '' },
      ]);
    });
  });

  describe('fetchRoles', () => {
    it('devuelve la terna del edificio', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => conTerna } as Response);
      const res = await fetchRoles(ID);
      expect(res.data).toEqual(conTerna);
      expect(global.fetch).toHaveBeenCalledWith(`/api/consorcios/${ID}/roles`);
    });

    it('informa el error sin inventar una terna vacía', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
      const res = await fetchRoles(ID);
      expect(res.ok).toBe(false);
      expect(res.data).toBeUndefined();
    });
  });

  describe('guardarRoles', () => {
    it('manda la terna completa, recortada y con los contactos vacíos en null', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => conTerna } as Response);
      const res = await guardarRoles(ID, formulario);
      expect(res.data).toEqual(conTerna);

      const [url, opciones] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`/api/consorcios/${ID}/roles`);
      expect(opciones.method).toBe('PUT');
      expect(JSON.parse(opciones.body as string).rtCalle).toEqual({
        nombre: 'Laura Gómez',
        telefono: '11 4000-1000',
        email: null,
      });
    });

    it('devuelve los errores de validación de la API', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'Datos inválidos', errores: ['rtCalle.nombre es obligatorio'] }),
      } as Response);
      const res = await guardarRoles(ID, formulario);
      expect(res.ok).toBe(false);
      expect(res.errores).toEqual(['rtCalle.nombre es obligatorio']);
    });

    it('informa la falta de conexión', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Sin red'));
      const res = await guardarRoles(ID, formulario);
      expect(res).toEqual({ ok: false, error: 'Sin red' });
    });
  });
});

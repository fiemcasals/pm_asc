import { describe, expect, it, vi } from 'vitest';
import {
  CAUSA_POR_DEFECTO,
  cargarCausas,
  causaInicial,
  cuerpoConstancia,
  enviarConstancia,
  puedeGuardarAdvertencia,
  type BorradorConstancia,
} from './constanciaVisita';

const UBICACION = { motivo: 'visita-fallida' as const, latitud: -34.6, longitud: -58.4, precision: 9.5, tomadaEn: '2026-11-16T10:00:01.000Z' };
const FOTO = 'data:image/jpeg;base64,AAAA';
const LISTA = { causas: [CAUSA_POR_DEFECTO, 'Consorcio cerrado'], porDefecto: CAUSA_POR_DEFECTO };
const completo: BorradorConstancia = { causa: CAUSA_POR_DEFECTO, foto: FOTO, ubicacion: UBICACION };
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 400, status, json: async () => cuerpo }) as Response;

describe('causaInicial (HU-07 RF-06, criterio 1)', () => {
  it('arranca con la causa por defecto de la configuración', () => {
    expect(causaInicial(LISTA)).toBe(CAUSA_POR_DEFECTO);
    expect(causaInicial({ causas: ['A', 'B'], porDefecto: 'B' })).toBe('B');
  });
  it('si la de por defecto no está en la lista usa la primera; sin lista, «Encargado o responsable ausente»', () => {
    expect(causaInicial({ causas: ['A', 'B'], porDefecto: 'Z' })).toBe('A');
    expect(causaInicial(null)).toBe(CAUSA_POR_DEFECTO);
  });
});

describe('puedeGuardarAdvertencia (criterio 2: deshabilitado hasta tener causa y foto)', () => {
  it('con causa, foto y ubicación se habilita', () => {
    expect(puedeGuardarAdvertencia(completo, LISTA)).toBe(true);
  });
  it.each([
    ['sin causa', { ...completo, causa: '' }],
    ['causa de espacios', { ...completo, causa: '   ' }],
    ['una causa que no está en la lista', { ...completo, causa: 'Otra' }],
    ['sin foto', { ...completo, foto: null }],
    ['foto vacía', { ...completo, foto: '' }],
    ['sin ubicación', { ...completo, ubicacion: null }],
  ])('%s → deshabilitado', (_n, borrador) => {
    expect(puedeGuardarAdvertencia(borrador, LISTA)).toBe(false);
  });
  it('sin lista cargada sólo vale la causa por defecto', () => {
    expect(puedeGuardarAdvertencia(completo, null)).toBe(true);
    expect(puedeGuardarAdvertencia({ ...completo, causa: 'Consorcio cerrado' }, null)).toBe(false);
  });
});

describe('cuerpoConstancia (criterio 3: GPS, precisión y hora del dispositivo, sin campos editables)', () => {
  it('manda coordenadas, precisión y hora del GPS, la hora del dispositivo y la causa; no manda la hora del servidor', () => {
    const c = cuerpoConstancia('edif-1', completo, new Date('2026-11-16T10:00:30Z'));

    expect(c).toEqual({
      consorcioId: 'edif-1',
      causa: CAUSA_POR_DEFECTO,
      fotoFrenteUrl: FOTO,
      gps: { latitud: -34.6, longitud: -58.4, precision: 9.5, timestamp: '2026-11-16T10:00:01.000Z' },
      horaDispositivo: '2026-11-16T10:00:30.000Z',
    });
    expect(c).not.toHaveProperty('fechaHora');
    expect(c).not.toHaveProperty('inspector');
  });
  it('sin foto o sin ubicación no arma el cuerpo', () => {
    expect(() => cuerpoConstancia('e', { ...completo, foto: null })).toThrow();
    expect(() => cuerpoConstancia('e', { ...completo, ubicacion: null })).toThrow();
  });
});

describe('enviarConstancia (criterio 4)', () => {
  it('guarda y devuelve el número de advertencia', async () => {
    const enviar = vi.fn().mockResolvedValue(respuesta(201, { id: 'VF-1', numeroAdvertencia: 2 }));

    const r = await enviarConstancia('edif-1', completo, enviar, new Date('2026-11-16T10:00:30Z'));

    expect(r).toEqual({ ok: true, constancia: { id: 'VF-1', numeroAdvertencia: 2 } });
    expect(enviar).toHaveBeenCalledWith('/api/visitas-fallidas', expect.objectContaining({ method: 'POST' }));
  });
  it('un segundo intento el mismo día (409) devuelve el motivo de la API y lo marca como ya registrada', async () => {
    const enviar = vi.fn().mockResolvedValue(respuesta(409, { message: 'Este edificio ya tiene una visita fallida de hoy: no se sumó ninguna advertencia.' }));

    const r = await enviarConstancia('edif-1', completo, enviar);

    expect(r).toEqual({ ok: false, error: expect.stringContaining('ya tiene una visita fallida de hoy'), yaRegistradaHoy: true });
  });
  it('otros errores devuelven su motivo y no se toman por «ya registrada»; un corte de red también', async () => {
    const r400 = await enviarConstancia('e', completo, vi.fn().mockResolvedValue(respuesta(400, { message: ['Elegí la causa de la visita fallida.'] })));
    expect(r400).toEqual({ ok: false, error: 'Elegí la causa de la visita fallida.', yaRegistradaHoy: false });
    const rRed = await enviarConstancia('e', completo, vi.fn().mockRejectedValue(new Error('Sin conexión')));
    expect(rRed).toEqual({ ok: false, error: 'Sin conexión', yaRegistradaHoy: false });
  });
});

describe('cargarCausas', () => {
  it('devuelven lo que manda la API, o null si falla o viene vacío', async () => {
    expect(await cargarCausas(vi.fn().mockResolvedValue(respuesta(200, LISTA)))).toEqual(LISTA);
    expect(await cargarCausas(vi.fn().mockResolvedValue(respuesta(500, {})))).toBeNull();
    expect(await cargarCausas(vi.fn().mockResolvedValue(respuesta(200, { causas: [], porDefecto: '' })))).toBeNull();
    expect(await cargarCausas(vi.fn().mockRejectedValue(new Error('x')))).toBeNull();
  });
});

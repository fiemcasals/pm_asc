import { describe, expect, it, vi } from 'vitest';
import { borradorDesde, cargarHorarios, cuerpoHorarios, guardarHorarios, resumenDia, validarBorrador, type Borrador } from './horarios';

const DOS = [{ desde: '08:00', hasta: '12:00' }, { desde: '17:00', hasta: '20:00' }];
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 400, status, json: async () => cuerpo }) as Response;
const conDia = (b: Borrador, dia: keyof Borrador['dias'], filas: [{ desde: string; hasta: string }, { desde: string; hasta: string }]): Borrador => ({ ...b, dias: { ...b.dias, [dia]: filas } });
const base = borradorDesde({ aCoordinar: false, franjas: { lunes: DOS } });
const V = { desde: '', hasta: '' };

describe('borradorDesde y cuerpoHorarios (HU-01 RF-04)', () => {
  it('arma 2 filas por día, con las franjas existentes primero y vacías las demás', () => {
    expect(base.dias.lunes).toEqual(DOS);
    expect(base.dias.martes).toEqual([V, V]);
    expect(Object.keys(base.dias)).toHaveLength(7);
  });
  it('el cuerpo manda sólo las filas completas y deja sin entrada los días vacíos', () => {
    const b = conDia(conDia(base, 'martes', [{ desde: '09:00', hasta: '13:00' }, V]), 'lunes', [V, V]);

    expect(cuerpoHorarios(b)).toEqual({ aCoordinar: false, franjas: { martes: [{ desde: '09:00', hasta: '13:00' }] } });
  });
  it('«A coordinar» manda sólo aCoordinar, sin franjas', () => {
    expect(cuerpoHorarios({ ...base, aCoordinar: true })).toEqual({ aCoordinar: true });
  });
});

describe('validarBorrador', () => {
  it('lo válido no tiene errores y los días vacíos están bien', () => {
    expect(validarBorrador(base)).toEqual([]);
  });
  it('con «A coordinar» no valida las franjas', () => {
    expect(validarBorrador({ ...conDia(base, 'lunes', [{ desde: '12:00', hasta: '08:00' }, V]), aCoordinar: true })).toEqual([]);
  });
  it('fin anterior o igual al inicio, hora incompleta y franjas superpuestas dan error con el día', () => {
    expect(validarBorrador(conDia(base, 'martes', [{ desde: '12:00', hasta: '08:00' }, V]))).toEqual([expect.stringMatching(/Martes: el fin \(08:00\) tiene que ser posterior/)]);
    expect(validarBorrador(conDia(base, 'martes', [{ desde: '08:00', hasta: '08:00' }, V]))).toHaveLength(1);
    expect(validarBorrador(conDia(base, 'jueves', [{ desde: '08:00', hasta: '' }, V]))).toEqual([expect.stringMatching(/Jueves: completá desde y hasta/)]);
    expect(validarBorrador(conDia(base, 'viernes', [{ desde: '08:00', hasta: '12:00' }, { desde: '11:00', hasta: '14:00' }]))).toEqual([expect.stringMatching(/Viernes: las dos franjas se superponen/)]);
    expect(validarBorrador(conDia(base, 'viernes', [{ desde: '08:00', hasta: '12:00' }, { desde: '12:00', hasta: '14:00' }]))).toHaveLength(1);
  });
  it('dos franjas desordenadas que no se pisan son válidas', () => {
    expect(validarBorrador(conDia(base, 'sabado', [{ desde: '17:00', hasta: '20:00' }, { desde: '08:00', hasta: '12:00' }]))).toEqual([]);
  });
});

describe('resumenDia', () => {
  it('muestra las franjas o «Cerrado»', () => {
    expect(resumenDia(DOS)).toBe('08:00–12:00 · 17:00–20:00');
    expect(resumenDia([])).toBe('Cerrado');
    expect(resumenDia(undefined)).toBe('Cerrado');
  });
});

describe('cargarHorarios y guardarHorarios', () => {
  it('cargar devuelve los horarios o null si falla', async () => {
    const h = { consorcioId: 'c1', aCoordinar: false, franjas: {}, porDefecto: true, actualizadoEn: null, actualizadoPor: null };
    expect(await cargarHorarios('c1', vi.fn().mockResolvedValue(respuesta(200, h)))).toEqual(h);
    expect(await cargarHorarios('c1', vi.fn().mockResolvedValue(respuesta(404, {})))).toBeNull();
    expect(await cargarHorarios('c1', vi.fn().mockRejectedValue(new Error('x')))).toBeNull();
  });
  it('guardar hace PUT con el cuerpo y devuelve los horarios guardados', async () => {
    const enviar = vi.fn().mockResolvedValue(respuesta(200, { consorcioId: 'c1', aCoordinar: false, franjas: { lunes: DOS }, porDefecto: false, actualizadoEn: 'x', actualizadoPor: 'sec' }));

    const r = await guardarHorarios('c1', base, enviar);

    expect(r).toMatchObject({ ok: true, horarios: { porDefecto: false } });
    expect(enviar).toHaveBeenCalledWith('/api/consorcios/c1/horarios', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ aCoordinar: false, franjas: { lunes: DOS } }) }));
  });
  it('si la API rechaza devuelve los motivos (errores o mensaje); un corte de red también', async () => {
    expect(await guardarHorarios('c1', base, vi.fn().mockResolvedValue(respuesta(400, { message: 'Horarios inválidos', errores: ['lunes: …'] })))).toEqual({ ok: false, errores: ['lunes: …'] });
    expect(await guardarHorarios('c1', base, vi.fn().mockResolvedValue(respuesta(403, { message: 'Tu rol no tiene acceso a este recurso.' })))).toEqual({ ok: false, errores: ['Tu rol no tiene acceso a este recurso.'] });
    expect(await guardarHorarios('c1', base, vi.fn().mockRejectedValue(new Error('Sin conexión')))).toEqual({ ok: false, errores: ['Sin conexión'] });
  });
});

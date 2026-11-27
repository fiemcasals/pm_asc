import { afterEach, describe, expect, it, vi } from 'vitest';
import { conSeparadores, diaAnterior, etiquetaDeDia, horaOFecha } from './dias';

// HU-19 RF-08 — el día de cada mensaje: «Hoy», «Ayer» o la fecha, y la hora de la lista de chats.
// Todas las horas de Buenos Aires (UTC-3) están escritas en UTC.
const AHORA = '2026-11-27T15:30:00.000Z'; // viernes 27/11/2026 12:30
const HOY_MANANA = '2026-11-27T12:05:00.000Z'; // 09:05 de hoy
const HOY_TARDE = '2026-11-27T18:15:00.000Z'; // 15:15 de hoy (más tarde que «ahora»: el reloj no importa, el día sí)
const AYER = '2026-11-26T22:40:00.000Z'; // 19:40 de ayer
const ANTEAYER = '2026-11-25T18:15:00.000Z'; // 15:15 del 25
const MES_ANTERIOR = '2026-10-31T15:00:00.000Z';

describe('diaAnterior', () => {
  it.each([
    ['2026-11-27', '2026-11-26'],
    ['2026-11-01', '2026-10-31'],
    ['2026-03-01', '2026-02-28'],
    ['2028-03-01', '2028-02-29'], // año bisiesto
    ['2027-01-01', '2026-12-31'],
    ['2026-11-10', '2026-11-09'], // el día anterior de un solo dígito lleva su cero
    ['2026-10-02', '2026-10-01'],
    ['2026-02-10', '2026-02-09'],
    ['2026-10-01', '2026-09-30'],
  ])('el día anterior a %s es %s', (clave, esperado) => expect(diaAnterior(clave)).toBe(esperado));
});

describe('etiquetaDeDia (criterio 2)', () => {
  it('un mensaje de hoy dice «Hoy»', () => {
    expect(etiquetaDeDia(HOY_MANANA, AHORA)).toBe('Hoy');
    expect(etiquetaDeDia(HOY_TARDE, AHORA)).toBe('Hoy');
  });
  it('uno de ayer dice «Ayer»', () => expect(etiquetaDeDia(AYER, AHORA)).toBe('Ayer'));
  it('uno más viejo dice la fecha completa', () => {
    expect(etiquetaDeDia(ANTEAYER, AHORA)).toBe('25/11/2026');
    expect(etiquetaDeDia(MES_ANTERIOR, AHORA)).toBe('31/10/2026');
    expect(etiquetaDeDia('2025-12-31T15:00:00.000Z', AHORA)).toBe('31/12/2025');
  });
  it('«ayer» también cuando el día anterior es de un solo dígito', () => {
    expect(etiquetaDeDia('2026-11-09T15:00:00.000Z', '2026-11-10T15:00:00.000Z')).toBe('Ayer');
    expect(etiquetaDeDia('2026-10-01T15:00:00.000Z', '2026-10-02T15:00:00.000Z')).toBe('Ayer');
    expect(etiquetaDeDia('2026-03-09T15:00:00.000Z', '2026-03-10T15:00:00.000Z')).toBe('Ayer');
  });
  it('«ayer» cruza el fin de mes y de año', () => {
    expect(etiquetaDeDia('2026-10-31T15:00:00.000Z', '2026-11-01T15:00:00.000Z')).toBe('Ayer');
    expect(etiquetaDeDia('2026-12-31T15:00:00.000Z', '2027-01-01T15:00:00.000Z')).toBe('Ayer');
  });
  it('el día lo marca la medianoche de Buenos Aires (03:00 UTC), no la de UTC', () => {
    const ahora = '2026-11-27T02:00:00.000Z'; // 23:00 del 26 en Buenos Aires
    expect(etiquetaDeDia('2026-11-27T01:00:00.000Z', ahora)).toBe('Hoy'); // 22:00 del 26
    expect(etiquetaDeDia('2026-11-26T01:00:00.000Z', ahora)).toBe('Ayer'); // 22:00 del 25
    expect(etiquetaDeDia('2026-11-27T03:00:00.000Z', '2026-11-27T04:00:00.000Z')).toBe('Hoy');
  });
  it('un mensaje del futuro (reloj distinto) dice la fecha, no «Hoy» ni «Ayer»', () => {
    expect(etiquetaDeDia('2026-11-29T15:00:00.000Z', AHORA)).toBe('29/11/2026');
  });
  it('un valor vacío o inválido da texto vacío', () => {
    for (const v of [null, undefined, '', 'ayer', Number.NaN]) expect(etiquetaDeDia(v, AHORA)).toBe('');
    expect(etiquetaDeDia(AYER, 'no es una fecha')).toBe('');
  });
  it('sin «ahora» usa el reloj de verdad', () => {
    expect(etiquetaDeDia(new Date())).toBe('Hoy');
    expect(etiquetaDeDia(new Date(Date.now() - 24 * 3600 * 1000))).not.toBe('Hoy');
  });
});

describe('horaOFecha: lo que dice la lista de chats (criterio 1)', () => {
  it('un mensaje de hoy dice la hora en 24 horas', () => {
    expect(horaOFecha(HOY_MANANA, AHORA)).toBe('09:05');
    expect(horaOFecha(HOY_TARDE, AHORA)).toBe('15:15');
    expect(horaOFecha(HOY_TARDE, AHORA)).not.toMatch(/(a|p)\. ?m\.|03:15/i);
  });
  it('la medianoche es 00:xx y nunca 24:xx', () => {
    expect(horaOFecha('2026-11-27T03:05:00.000Z', '2026-11-27T12:00:00.000Z')).toBe('00:05');
  });
  it('uno de ayer dice «Ayer» y uno más viejo, la fecha', () => {
    expect(horaOFecha(AYER, AHORA)).toBe('Ayer');
    expect(horaOFecha(ANTEAYER, AHORA)).toBe('25/11/2026');
  });
  it('vacío o inválido da texto vacío', () => {
    expect(horaOFecha(null, AHORA)).toBe('');
    expect(horaOFecha('ayer', AHORA)).toBe('');
  });
});

describe('conSeparadores (criterio 2)', () => {
  const m = (id: string, creadoEn: string) => ({ id, creadoEn });
  const forma = (lista: ReturnType<typeof conSeparadores<{ id: string; creadoEn: string }>>) => lista.map((e) => (e.tipo === 'dia' ? `[${e.etiqueta}]` : e.mensaje.id));

  it('pone el día delante del primer mensaje de cada día', () => {
    const r = conSeparadores([m('a', ANTEAYER), m('b', '2026-11-25T23:00:00.000Z'), m('c', AYER), m('d', HOY_MANANA), m('e', HOY_TARDE)], AHORA);
    expect(forma(r)).toEqual(['[25/11/2026]', 'a', 'b', '[Ayer]', 'c', '[Hoy]', 'd', 'e']);
  });
  it('mensajes de un solo día: un solo separador, al principio', () => {
    expect(forma(conSeparadores([m('a', HOY_MANANA), m('b', HOY_TARDE)], AHORA))).toEqual(['[Hoy]', 'a', 'b']);
    expect(forma(conSeparadores([m('a', ANTEAYER), m('b', ANTEAYER)], AHORA))).toEqual(['[25/11/2026]', 'a', 'b']);
  });
  it('los mensajes que cruzan la medianoche de Buenos Aires cambian de día ahí', () => {
    const r = conSeparadores([m('a', '2026-11-27T02:59:00.000Z'), m('b', '2026-11-27T03:01:00.000Z')], '2026-11-27T15:00:00.000Z');
    expect(forma(r)).toEqual(['[Ayer]', 'a', '[Hoy]', 'b']);
  });
  it('cada separador trae su clave de día y los mensajes quedan en el mismo orden', () => {
    const r = conSeparadores([m('a', ANTEAYER), m('b', AYER)], AHORA);
    expect(r.filter((e) => e.tipo === 'dia').map((e) => (e.tipo === 'dia' ? e.clave : ''))).toEqual(['2026-11-25', '2026-11-26']);
    expect(r.filter((e) => e.tipo === 'mensaje').map((e) => (e.tipo === 'mensaje' ? e.mensaje.id : ''))).toEqual(['a', 'b']);
  });
  it('una lista vacía queda vacía', () => expect(conSeparadores([], AHORA)).toEqual([]));
  it('un mensaje sin fecha válida se muestra sin cambiar el día', () => {
    expect(forma(conSeparadores([m('a', AYER), m('roto', 'no es fecha'), m('b', AYER)], AHORA))).toEqual(['[Ayer]', 'a', 'roto', 'b']);
  });
  it('no modifica los mensajes que recibe', () => {
    const lista = [m('a', AYER)];
    conSeparadores(lista, AHORA);
    expect(lista).toEqual([{ id: 'a', creadoEn: AYER }]);
  });
  it('los mismos mensajes salen con otro día según «ahora» (a las 00:01 de mañana, hoy pasa a «Ayer»)', () => {
    const lista = [m('a', HOY_MANANA)];
    expect(forma(conSeparadores(lista, AHORA))).toEqual(['[Hoy]', 'a']);
    expect(forma(conSeparadores(lista, '2026-11-28T15:00:00.000Z'))).toEqual(['[Ayer]', 'a']);
  });
});

describe('desde un navegador en otra zona horaria y con otro idioma', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('los días y las horas son los de Buenos Aires', async () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    vi.resetModules();
    const { etiquetaDeDia: enTokio, horaOFecha: horaEnTokio } = await import('./dias');
    expect(enTokio(HOY_TARDE, AHORA)).toBe('Hoy'); // en Tokio ya sería el 28
    expect(horaEnTokio(HOY_TARDE, AHORA)).toBe('15:15');
    expect(enTokio(AYER, AHORA)).toBe('Ayer');
  });
});

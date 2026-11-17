import { describe, expect, it, vi } from 'vitest';
import { ahoraCorregido, colorDePin, COLOR_HEX, desfaseDeReloj, encabezadoRt, enBuenosAires, LEYENDA, type HorarioEdificio } from './colorPin';
import { cargarMapaRt } from './mapaRt';

// HU-16 RF-01: el color de cada pin y el encabezado de la pantalla del RT.
const DOS = [{ desde: '08:00', hasta: '12:00' }, { desde: '17:00', hasta: '20:00' }];
const normal: HorarioEdificio = { aCoordinar: false, franjas: { lunes: DOS, martes: DOS, miercoles: DOS, jueves: DOS, viernes: DOS } };
const FERIADOS = ['2026-11-23'];
// 2026-11-17 es martes. Buenos Aires está 3 h atrás de UTC: la hora local pasada a UTC.
const aBA = (fecha: string, hora: string) => new Date(Date.parse(`${fecha}T${hora}:00Z`) + 3 * 3600 * 1000);
const color = (h: HorarioEdificio, fecha: string, hora: string, feriados: readonly string[] | ReadonlySet<string> = FERIADOS) => colorDePin(h, feriados, aBA(fecha, hora));

describe('colorDePin (criterio 2: verde abierto, rojo cerrado, amarillo «A coordinar»)', () => {
  it('dentro de franja → verde (martes 10:00 y 18:00)', () => {
    expect(color(normal, '2026-11-17', '10:00')).toBe('verde');
    expect(color(normal, '2026-11-17', '18:00')).toBe('verde');
  });

  it('fuera de franja → rojo (martes 07:00, 13:00 y 21:00)', () => {
    for (const h of ['07:00', '13:00', '21:00', '00:00']) expect(color(normal, '2026-11-17', h)).toBe('rojo');
  });

  it.each([
    ['07:59', 'rojo'], ['08:00', 'verde'], ['11:59', 'verde'], ['12:00', 'rojo'], ['16:59', 'rojo'], ['17:00', 'verde'], ['19:59', 'verde'], ['20:00', 'rojo'],
  ])('el borde de la franja: a las %s es %s (el inicio cuenta como abierto y el fin no)', (hora, esperado) => {
    expect(color(normal, '2026-11-17', hora)).toBe(esperado);
  });

  it('un día sin franjas (sábado) → rojo', () => {
    expect(color(normal, '2026-11-21', '10:00')).toBe('rojo');
  });

  it('feriado → rojo aunque ese día de la semana tenga franjas (lunes 23/11/2026 a las 10:00)', () => {
    expect(color(normal, '2026-11-23', '10:00')).toBe('rojo');
    expect(color(normal, '2026-11-30', '10:00')).toBe('verde'); // el lunes siguiente no es feriado
  });

  it('acepta los feriados como Set o como lista', () => {
    expect(color(normal, '2026-11-23', '10:00', new Set(FERIADOS))).toBe('rojo');
    expect(color(normal, '2026-11-23', '10:00', [])).toBe('verde');
  });

  it('«A coordinar» → amarillo, dentro o fuera de franja y también en un feriado', () => {
    const coordinar: HorarioEdificio = { aCoordinar: true, franjas: {} };

    expect(color(coordinar, '2026-11-17', '10:00')).toBe('amarillo');
    expect(color(coordinar, '2026-11-17', '23:00')).toBe('amarillo');
    expect(color(coordinar, '2026-11-23', '10:00')).toBe('amarillo');
    expect(color({ aCoordinar: true, franjas: normal.franjas }, '2026-11-17', '10:00')).toBe('amarillo');
  });

  it('franjas distintas según el día: el sábado de 09:00 a 13:00 está verde a las 10:00 y el martes sin franja, rojo', () => {
    const h: HorarioEdificio = { aCoordinar: false, franjas: { sabado: [{ desde: '09:00', hasta: '13:00' }] } };

    expect(color(h, '2026-11-21', '10:00')).toBe('verde');
    expect(color(h, '2026-11-17', '10:00')).toBe('rojo');
  });

  it('se evalúa en hora de Buenos Aires, no en la del celular ni en UTC (02:00 UTC del miércoles es martes 23:00 allá)', () => {
    expect(colorDePin(normal, FERIADOS, new Date('2026-11-18T02:00:00Z'))).toBe('rojo');
    expect(colorDePin(normal, FERIADOS, new Date('2026-11-17T13:00:00Z'))).toBe('verde'); // 10:00 en Buenos Aires
    expect(colorDePin(normal, FERIADOS, new Date('2026-11-24T02:30:00Z'))).toBe('rojo'); // 23:30 del feriado 23/11
  });
});

describe('criterio 3: el color cambia solo al cruzar una franja horaria', () => {
  it('recorriendo el día minuto a minuto el pin pasa rojo → verde → rojo → verde → rojo en 08:00, 12:00, 17:00 y 20:00', () => {
    const cambios: string[] = [];
    let anterior = '';
    for (let min = 0; min < 24 * 60; min++) {
      const hora = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
      const c = color(normal, '2026-11-17', hora);
      if (c !== anterior) cambios.push(`${hora}=${c}`);
      anterior = c;
    }

    expect(cambios).toEqual(['00:00=rojo', '08:00=verde', '12:00=rojo', '17:00=verde', '20:00=rojo']);
  });

  it('el mismo horario da otro color un minuto después, sin recargar nada (función pura del reloj)', () => {
    expect(color(normal, '2026-11-17', '11:59')).toBe('verde');
    expect(color(normal, '2026-11-17', '12:00')).toBe('rojo');
  });
});

describe('encabezadoRt (criterio 1)', () => {
  it('«Hola Ing. Aliado 1 | Zona Norte | 11:30 hs»', () => {
    expect(encabezadoRt('Ing. Aliado 1', 'Norte', aBA('2026-11-17', '11:30'))).toBe('Hola Ing. Aliado 1 | Zona Norte | 11:30 hs');
  });
  it('sin zona no inventa una', () => {
    expect(encabezadoRt('Ing. Aliado 1', null, aBA('2026-11-17', '09:05'))).toBe('Hola Ing. Aliado 1 | 09:05 hs');
    expect(encabezadoRt('Ana', '', aBA('2026-11-17', '09:05'))).toBe('Hola Ana | 09:05 hs');
  });
  it('la hora es la de Buenos Aires con 24 h (medianoche 00:00, tarde 18:45)', () => {
    expect(encabezadoRt('Ana', 'Sur', new Date('2026-11-17T03:00:00Z'))).toBe('Hola Ana | Zona Sur | 00:00 hs');
    expect(encabezadoRt('Ana', 'Sur', aBA('2026-11-17', '18:45'))).toBe('Hola Ana | Zona Sur | 18:45 hs');
  });
});

describe('reloj del servidor', () => {
  it('corrige un celular atrasado o adelantado', () => {
    const servidor = '2026-11-17T13:00:00.000Z';
    const celularAtrasado = Date.parse('2026-11-17T12:50:00.000Z');
    const d = desfaseDeReloj(servidor, celularAtrasado);

    expect(d).toBe(10 * 60 * 1000);
    expect(ahoraCorregido(celularAtrasado + 5 * 60 * 1000, d).toISOString()).toBe('2026-11-17T13:05:00.000Z');
    expect(desfaseDeReloj(servidor, Date.parse('2026-11-17T13:30:00.000Z'))).toBe(-30 * 60 * 1000);
  });
  it('una hora del servidor que no es una fecha no corrige nada', () => {
    expect(desfaseDeReloj('hoy', 1000)).toBe(0);
  });
});

describe('enBuenosAires y la leyenda (criterio 3)', () => {
  it('da día, fecha y hora de 24 h', () => {
    expect(enBuenosAires(new Date('2026-11-17T03:00:00Z'))).toEqual({ dia: 'martes', fecha: '2026-11-17', hora: '00:00' });
  });
  it('la leyenda explica los tres colores y cada color tiene su tono', () => {
    expect(LEYENDA.map((l) => `${l.color}:${l.texto}`)).toEqual(['verde:Abierto ahora', 'rojo:Cerrado', 'amarillo:A coordinar']);
    expect(new Set(Object.values(COLOR_HEX)).size).toBe(3);
  });
});

describe('cargarMapaRt', () => {
  it('devuelve el mapa o null si la API falla', async () => {
    const mapa = { rt: { nombre: 'Ana', zona: null }, ahora: '2026-11-17T13:00:00Z', feriados: [], presencia: { radioM: 30, precisionMaxM: 30 }, edificios: [] };
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => mapa } as Response);
    expect(await cargarMapaRt(ok)).toEqual(mapa);
    expect(ok).toHaveBeenCalledWith('/api/rt/mapa');
    expect(await cargarMapaRt(vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response))).toBeNull();
    expect(await cargarMapaRt(vi.fn().mockRejectedValue(new Error('x')))).toBeNull();
  });
});

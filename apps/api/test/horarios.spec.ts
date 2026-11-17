import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppConfig } from '../src/config';
import { feriadosDeEntorno, FERIADOS_PROVISORIOS } from '../src/horarios/feriados';
import { enBuenosAires, estadoDeApertura, validarHorarios } from '../src/horarios/horarios.logic';
import { InMemoryHorariosRepository } from '../src/horarios/horarios.repository';
import { HorariosService } from '../src/horarios/horarios.service';
import { FRANJAS_POR_DEFECTO } from '../src/horarios/horarios.types';

// HU-01 RF-04: horarios de atención por edificio, validación de franjas y «¿está abierto?».
const T = (iso: string) => new Date(iso);
const DOS = [{ desde: '08:00', hasta: '12:00' }, { desde: '17:00', hasta: '20:00' }];

describe('validarHorarios (criterio 2: hasta 2 franjas por día, sin fin anterior ni superposición)', () => {
  const errores = (franjas: unknown) => {
    const r = validarHorarios({ franjas });
    return r.ok ? null : r.errores;
  };

  it('acepta hasta 2 franjas por día y días distintos con franjas distintas', () => {
    const r = validarHorarios({ franjas: { lunes: DOS, martes: [{ desde: '09:30', hasta: '13:00' }], sabado: [] } });

    expect(r).toEqual({ ok: true, horarios: { aCoordinar: false, franjas: { lunes: DOS, martes: [{ desde: '09:30', hasta: '13:00' }] } } });
  });

  it('ordena las franjas por hora de inicio', () => {
    const r = validarHorarios({ franjas: { lunes: [DOS[1], DOS[0]] } });

    expect(r.ok && r.horarios.franjas.lunes).toEqual(DOS);
  });

  it('rechaza más de 2 franjas en un día, diciendo cuál', () => {
    const e = errores({ lunes: [...DOS, { desde: '21:00', hasta: '22:00' }] });

    expect(e).toEqual([expect.stringContaining('lunes: como máximo 2 franjas')]);
  });

  it.each([
    ['fin anterior al inicio', { desde: '12:00', hasta: '08:00' }],
    ['fin igual al inicio', { desde: '08:00', hasta: '08:00' }],
  ])('rechaza una franja con %s', (_n, franja) => {
    expect(errores({ martes: [franja] })).toEqual([expect.stringMatching(/martes, franja 1: la hora de fin .* posterior a la de inicio/)]);
  });

  it.each([
    ['se pisan', [{ desde: '08:00', hasta: '12:00' }, { desde: '11:00', hasta: '14:00' }]],
    ['se tocan en el borde', [{ desde: '08:00', hasta: '12:00' }, { desde: '12:00', hasta: '14:00' }]],
    ['una contiene a la otra', [{ desde: '08:00', hasta: '20:00' }, { desde: '10:00', hasta: '11:00' }]],
    ['se pisan y vienen desordenadas', [{ desde: '11:00', hasta: '14:00' }, { desde: '08:00', hasta: '12:00' }]],
  ])('rechaza dos franjas que %s', (_n, franjas) => {
    expect(errores({ jueves: franjas })).toEqual([expect.stringContaining('jueves: las dos franjas se superponen')]);
  });

  it('una franja que empieza justo después de que termina la otra es válida', () => {
    expect(validarHorarios({ franjas: { jueves: [{ desde: '08:00', hasta: '12:00' }, { desde: '12:01', hasta: '14:00' }] } }).ok).toBe(true);
  });

  it.each(['8:00', '24:00', '12:60', '12:5', 'abc', '', '12:00:00', '-1:00'])('rechaza la hora «%s»', (hora) => {
    expect(errores({ lunes: [{ desde: hora, hasta: '20:00' }] })).toEqual([expect.stringContaining('«HH:MM»')]);
    expect(errores({ lunes: [{ desde: '08:00', hasta: hora }] })).toEqual([expect.stringContaining('«HH:MM»')]);
  });

  it('rechaza horas que no son texto, franjas que no son objeto, y días inventados', () => {
    expect(errores({ lunes: [{ desde: 8, hasta: 12 }] })).toEqual([expect.stringContaining('«HH:MM»')]);
    expect(errores({ lunes: [null] })).toEqual([expect.stringContaining('«HH:MM»')]);
    expect(errores({ lunes: 'todo el dia' })).toEqual([expect.stringContaining('lunes: tiene que ser una lista')]);
    expect(errores({ funesto: DOS })).toEqual([expect.stringContaining('«funesto» no es un día válido')]);
  });

  it('junta los errores de varios días en una sola respuesta', () => {
    const e = errores({ lunes: [{ desde: '12:00', hasta: '08:00' }], martes: [...DOS, ...DOS] });

    expect(e).toHaveLength(2);
  });

  it('el cuerpo vacío, sin franjas ni «A coordinar», o con tipos equivocados, se rechaza', () => {
    expect(validarHorarios({}).ok).toBe(false);
    expect(validarHorarios(null).ok).toBe(false);
    expect(validarHorarios([]).ok).toBe(false);
    expect(validarHorarios({ franjas: [] }).ok).toBe(false);
    expect(validarHorarios({ franjas: 'x' }).ok).toBe(false);
    expect(validarHorarios({ aCoordinar: 'si' }).ok).toBe(false);
  });

  it('criterio 3: «A coordinar» reemplaza las franjas', () => {
    expect(validarHorarios({ aCoordinar: true, franjas: { lunes: DOS } })).toEqual({ ok: true, horarios: { aCoordinar: true, franjas: {} } });
    expect(validarHorarios({ aCoordinar: true })).toEqual({ ok: true, horarios: { aCoordinar: true, franjas: {} } });
  });

  it('un día sin franjas queda cerrado: se guarda sin la entrada', () => {
    const r = validarHorarios({ franjas: { lunes: [] } });

    expect(r).toEqual({ ok: true, horarios: { aCoordinar: false, franjas: {} } });
  });
});

describe('estadoDeApertura (criterio 4)', () => {
  const FERIADOS = new Set(['2026-11-23']);
  const normal = { aCoordinar: false, franjas: FRANJAS_POR_DEFECTO };
  const abierto = (iso: string, h = normal, f: ReadonlySet<string> = FERIADOS) => estadoDeApertura('c1', h, f, T(iso));
  // 2026-11-17 es martes; Buenos Aires está 3 h atrás de UTC.

  it('el martes a las 10:00 (13:00 UTC) está abierto, con la franja vigente', () => {
    expect(abierto('2026-11-17T13:00:00Z')).toMatchObject({ abierto: true, motivo: 'dentro_de_franja', franjaVigente: { desde: '08:00', hasta: '12:00' }, diaSemana: 'martes', fechaLocal: '2026-11-17', horaLocal: '10:00' });
  });

  it.each([
    ['07:59', false], ['08:00', true], ['11:59', true], ['12:00', false], ['12:01', false],
    ['16:59', false], ['17:00', true], ['19:59', true], ['20:00', false], ['23:59', false], ['00:00', false],
  ])('a las %s está abierto: %s (el inicio de la franja cuenta, el fin no)', (hora, esperado) => {
    const utc = new Date(Date.parse(`2026-11-17T${hora}:00Z`) + 3 * 3600 * 1000).toISOString(); // la hora de Buenos Aires pasada a UTC
    const r = abierto(utc);

    expect(r.abierto).toBe(esperado);
    expect(r.motivo).toBe(esperado ? 'dentro_de_franja' : 'fuera_de_franja');
  });

  it('un día sin franjas (sábado) está cerrado por «dia_cerrado»', () => {
    expect(abierto('2026-11-21T14:00:00Z')).toMatchObject({ abierto: false, motivo: 'dia_cerrado', diaSemana: 'sabado' });
  });

  it('un feriado cuenta como cerrado aunque ese día de la semana tenga franjas (lunes 23/11/2026)', () => {
    expect(abierto('2026-11-23T14:00:00Z')).toMatchObject({ abierto: false, motivo: 'feriado', diaSemana: 'lunes', fechaLocal: '2026-11-23' });
    expect(abierto('2026-11-30T14:00:00Z').abierto).toBe(true); // el lunes siguiente no es feriado
  });

  it('el feriado se cuenta en hora de Buenos Aires: 23:30 del 23 (02:30 UTC del 24) sigue siendo feriado y 00:00 del 24 ya no', () => {
    expect(abierto('2026-11-24T02:30:00Z')).toMatchObject({ motivo: 'feriado', fechaLocal: '2026-11-23' });
    expect(abierto('2026-11-24T03:00:00Z')).toMatchObject({ fechaLocal: '2026-11-24', motivo: 'fuera_de_franja' });
  });

  it('el día de la semana también se toma en Buenos Aires (02:00 UTC del miércoles es todavía martes a la noche)', () => {
    expect(abierto('2026-11-18T02:00:00Z')).toMatchObject({ diaSemana: 'martes', horaLocal: '23:00' });
  });

  it('«A coordinar» no está abierto, ni dentro de una franja del horario por defecto ni en un feriado', () => {
    const aCoordinar = { aCoordinar: true, franjas: {} };

    expect(abierto('2026-11-17T13:00:00Z', aCoordinar)).toMatchObject({ abierto: false, motivo: 'a_coordinar', franjaVigente: null });
    expect(abierto('2026-11-23T14:00:00Z', aCoordinar).motivo).toBe('a_coordinar');
  });

  it('franjas distintas según el día: el sábado de 09:00 a 13:00 está abierto a las 10:00', () => {
    const h = { aCoordinar: false, franjas: { sabado: [{ desde: '09:00', hasta: '13:00' }] } };

    expect(abierto('2026-11-21T13:00:00Z', h)).toMatchObject({ abierto: true, franjaVigente: { desde: '09:00', hasta: '13:00' } });
    expect(abierto('2026-11-17T13:00:00Z', h).motivo).toBe('dia_cerrado');
  });

  it('el instante se informa tal como se evaluó', () => {
    expect(abierto('2026-11-17T13:00:00-03:00')).toMatchObject({ en: '2026-11-17T16:00:00.000Z', horaLocal: '13:00', abierto: false });
  });
});

describe('enBuenosAires', () => {
  it('da día, fecha y hora de Buenos Aires con hora de 24 h (medianoche es 00:00, no 24:00)', () => {
    expect(enBuenosAires(T('2026-11-17T03:00:00Z'))).toEqual({ dia: 'martes', fecha: '2026-11-17', hora: '00:00' });
    expect(enBuenosAires(T('2026-01-01T02:59:00Z'))).toEqual({ dia: 'miercoles', fecha: '2025-12-31', hora: '23:59' });
  });
});

describe('feriadosDeEntorno', () => {
  it('sin variable devuelve null; con fechas las limpia y sin repetidos; una mal escrita es un error de configuración', () => {
    expect(feriadosDeEntorno(undefined)).toBeNull();
    expect(feriadosDeEntorno('  ')).toBeNull();
    expect(feriadosDeEntorno('2026-12-24, 2026-12-31,2026-12-24')).toEqual(['2026-12-24', '2026-12-31']);
    expect(() => feriadosDeEntorno('2026-12-24,24/12/2026')).toThrow(/FERIADOS/);
    expect(() => feriadosDeEntorno('2026-13-45')).toThrow(/FERIADOS/);
  });

  it('la lista provisoria tiene fechas válidas, sin repetidos y en orden', () => {
    expect(new Set(FERIADOS_PROVISORIOS).size).toBe(FERIADOS_PROVISORIOS.length);
    expect([...FERIADOS_PROVISORIOS].sort()).toEqual([...FERIADOS_PROVISORIOS]);
    expect(feriadosDeEntorno(FERIADOS_PROVISORIOS.join(','))).toHaveLength(FERIADOS_PROVISORIOS.length);
  });
});

describe('HorariosService', () => {
  let repo: InMemoryHorariosRepository;
  let service: HorariosService;
  beforeEach(() => {
    repo = new InMemoryHorariosRepository();
    repo.agregarEdificio('c1');
    service = new HorariosService(repo, { feriados: ['2026-12-24'] } as AppConfig);
  });

  it('criterio 1: un edificio nuevo arranca de lunes a viernes de 08:00 a 12:00 y de 17:00 a 20:00', async () => {
    const h = await service.obtener('c1');

    expect(h).toMatchObject({ aCoordinar: false, porDefecto: true, actualizadoEn: null, actualizadoPor: null });
    for (const dia of ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] as const) expect(h.franjas[dia]).toEqual(DOS);
    expect(h.franjas.sabado).toBeUndefined();
    expect(h.franjas.domingo).toBeUndefined();
  });

  it('el horario por defecto no se comparte entre llamadas (editar la respuesta no cambia el de los demás)', async () => {
    (await service.obtener('c1')).franjas.lunes![0].desde = '01:00';

    expect((await service.obtener('c1')).franjas.lunes![0].desde).toBe('08:00');
  });

  it('guarda con quién y cuándo, y a partir de ahí ya no es el horario por defecto', async () => {
    const h = await service.guardar('c1', { franjas: { lunes: [{ desde: '09:00', hasta: '13:00' }] } }, 'sec1');

    expect(h).toMatchObject({ porDefecto: false, aCoordinar: false, franjas: { lunes: [{ desde: '09:00', hasta: '13:00' }] }, actualizadoPor: 'sec1' });
    expect(Number.isNaN(Date.parse(h.actualizadoEn!))).toBe(false);
    expect(await service.obtener('c1')).toEqual(h);
  });

  it('un horario inválido → 400 con los motivos y no cambia nada', async () => {
    await expect(service.guardar('c1', { franjas: { lunes: [{ desde: '12:00', hasta: '08:00' }] } }, 'sec1')).rejects.toBeInstanceOf(BadRequestException);

    expect((await service.obtener('c1')).porDefecto).toBe(true);
    await expect(service.guardar('c1', { franjas: { lunes: DOS, martes: [...DOS, ...DOS] } }, 'sec1')).rejects.toMatchObject({ response: { errores: [expect.stringContaining('martes')] } });
  });

  it('«A coordinar» reemplaza las franjas y se puede volver a un horario con franjas', async () => {
    await service.guardar('c1', { franjas: { lunes: DOS } }, 'sec1');
    const a = await service.guardar('c1', { aCoordinar: true }, 'sec1');
    expect(a).toMatchObject({ aCoordinar: true, franjas: {} });

    const b = await service.guardar('c1', { aCoordinar: false, franjas: { martes: DOS } }, 'sec1');
    expect(b).toMatchObject({ aCoordinar: false, franjas: { martes: DOS } });
  });

  it('un edificio que no existe → 404 al ver, guardar o consultar', async () => {
    await expect(service.obtener('nada')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.guardar('nada', { aCoordinar: true }, 'sec1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.estaAbierto('nada')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('estaAbierto usa los feriados de la configuración y la fecha pedida', async () => {
    expect(await service.estaAbierto('c1', '2026-12-24T13:00:00Z')).toMatchObject({ abierto: false, motivo: 'feriado' });
    expect(await service.estaAbierto('c1', '2026-11-23T13:00:00Z')).toMatchObject({ abierto: true }); // sin la lista provisoria: la configurada manda
  });

  it('sin configuración usa la lista provisoria de feriados', async () => {
    const s = new HorariosService(repo);

    expect(s.getFeriados()).toEqual([...FERIADOS_PROVISORIOS]);
    expect(await s.estaAbierto('c1', '2026-11-23T13:00:00Z')).toMatchObject({ abierto: false, motivo: 'feriado' });
  });

  it('un «en» que no es una fecha → 400; sin «en» se evalúa ahora', async () => {
    await expect(service.estaAbierto('c1', 'ayer')).rejects.toBeInstanceOf(BadRequestException);

    const r = await service.estaAbierto('c1');
    expect(Math.abs(Date.parse(r.en) - Date.now())).toBeLessThan(5000);
  });
});

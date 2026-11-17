import { BadRequestException } from '@nestjs/common';
import { firmaTrazada, normalizarDni, validarInforme } from '../src/informes/informes.logic';
import { Punto } from '../src/informes/informes.types';

// HU-18 RF-01: el informe consolidado con la firma del encargado o «Sin firma».
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
const TRAZO: Punto[] = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8] as Punto);
const equipo = (extra: Record<string, unknown> = {}) => ({ maquinaId: 'm1', referenciaAgc: 'M1', tipo: 'traccion', estadoEquipo: 'en_uso', respuestas: {}, observaciones: {}, fotos: {}, ...extra });
const firma = (extra: Record<string, unknown> = {}) => ({ nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', imagen: PNG, trazos: [TRAZO], ...extra });
const base = (extra: Record<string, unknown> = {}) => ({ consorcioId: 'c1', horaDispositivo: '2026-11-17T13:00:00Z', equipos: [equipo()], firma: firma(), ...extra });
const errores = (cuerpo: unknown): string[] => {
  try {
    validarInforme(cuerpo);
    return [];
  } catch (e) {
    return ((e as BadRequestException).getResponse() as { errores: string[] }).errores;
  }
};

describe('firmaTrazada (criterio 2: la firma no se acepta vacía)', () => {
  it('un trazo con puntos suficientes y tamaño es una firma', () => {
    expect(firmaTrazada([TRAZO])).toBe(true);
  });
  it('sin trazos, o con un trazo vacío, no', () => {
    expect(firmaTrazada([])).toBe(false);
    expect(firmaTrazada([[]])).toBe(false);
  });
  it('pocos puntos (7) no alcanzan; 8 sí', () => {
    expect(firmaTrazada([TRAZO.slice(0, 7)])).toBe(false);
    expect(firmaTrazada([TRAZO.slice(0, 8)])).toBe(true);
  });
  it('un toque suelto o una raya diminuta (muchos puntos en 5 px) no es una firma', () => {
    const toque: Punto[] = Array.from({ length: 30 }, () => [50, 50] as Punto);
    const raya: Punto[] = Array.from({ length: 30 }, (_, i) => [50 + (i % 5), 50] as Punto);

    expect(firmaTrazada([toque])).toBe(false);
    expect(firmaTrazada([raya])).toBe(false);
  });
  it('el tamaño mínimo es de 15 px en cualquiera de los dos ejes (14 no, 15 sí)', () => {
    const horizontal = (ancho: number): Punto[] => Array.from({ length: 10 }, (_, i) => [i * (ancho / 9), 50] as Punto);
    const vertical = (alto: number): Punto[] => Array.from({ length: 10 }, (_, i) => [50, i * (alto / 9)] as Punto);

    expect(firmaTrazada([horizontal(14)])).toBe(false);
    expect(firmaTrazada([horizontal(15)])).toBe(true);
    expect(firmaTrazada([vertical(14)])).toBe(false);
    expect(firmaTrazada([vertical(15)])).toBe(true);
  });
  it('los puntos se suman entre trazos (varios trazos cortos forman una firma)', () => {
    expect(firmaTrazada([TRAZO.slice(0, 4), TRAZO.slice(4, 8)])).toBe(true);
  });
});

describe('normalizarDni (criterio 3: el DNI es opcional)', () => {
  it('sin DNI (undefined, null, vacío o espacios) está bien y queda null', () => {
    for (const v of [undefined, null, '', '   ']) expect(normalizarDni(v)).toEqual({ ok: true, dni: null });
  });
  it('acepta 7 u 8 dígitos, con puntos y espacios, y guarda sólo los dígitos', () => {
    expect(normalizarDni('12.345.678')).toEqual({ ok: true, dni: '12345678' });
    expect(normalizarDni(' 1234567 ')).toEqual({ ok: true, dni: '1234567' });
    expect(normalizarDni(12345678)).toEqual({ ok: true, dni: '12345678' });
  });
  it('rechaza lo que no es un DNI: 6 o 9 dígitos, letras, símbolos', () => {
    for (const v of ['123456', '123456789', '12a45678', '12-345-678', {}, [], true]) expect(normalizarDni(v)).toEqual({ ok: false });
  });
});

describe('validarInforme', () => {
  it('un informe firmado completo es válido: no requiere revisión y normaliza la hora', () => {
    const i = validarInforme(base({ firma: firma({ dni: '12.345.678', nombre: '  Carlos  ' }) }));

    expect(i).toMatchObject({ consorcioId: 'c1', requiereRevision: false, sinFirma: null, horaDispositivo: '2026-11-17T13:00:00.000Z' });
    expect(i.firma).toMatchObject({ nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', dni: '12345678' });
  });

  describe('criterio 3: nombre, apellido y carácter son obligatorios; el DNI no', () => {
    it.each([
      ['sin nombre', { nombre: '' }, /firma\.nombre/],
      ['nombre de un carácter', { nombre: 'C' }, /firma\.nombre/],
      ['sin apellido', { apellido: '  ' }, /firma\.apellido/],
      ['sin carácter', { caracter: undefined }, /firma\.caracter/],
      ['un carácter que no está en la lista', { caracter: 'Vecino' }, /firma\.caracter/],
      ['un DNI inválido', { dni: '123' }, /firma\.dni/],
    ])('%s → 400', (_n, extra, mensaje) => {
      expect(errores(base({ firma: firma(extra) })).join(' ')).toMatch(mensaje);
    });
    it.each(['Encargado', 'Administrador', 'Propietario'])('el carácter «%s» es válido', (caracter) => {
      expect(errores(base({ firma: firma({ caracter }) }))).toEqual([]);
    });
    it('sin DNI es válido', () => {
      expect(errores(base({ firma: firma({ dni: undefined }) }))).toEqual([]);
    });
  });

  describe('criterio 2: la firma se captura con el dedo y no se acepta vacía', () => {
    it('sin trazos, o con trazos que no son una firma → 400 «La firma está vacía»', () => {
      expect(errores(base({ firma: firma({ trazos: [] }) })).join(' ')).toMatch(/La firma está vacía/);
      expect(errores(base({ firma: firma({ trazos: [[[10, 10], [11, 10]]] }) })).join(' ')).toMatch(/La firma está vacía/);
    });
    it('trazos mal formados → 400', () => {
      for (const trazos of ['x', [[1, 2]], [[['a', 1]]], [[[1, 2, 3]]], null]) expect(errores(base({ firma: firma({ trazos }) })).join(' ')).toMatch(/firma\.trazos/);
    });
    it('la imagen tiene que ser un PNG en data URL (no JPG, no texto, no vacía)', () => {
      for (const imagen of [JPG, 'iVBORw0KGgo=', '', undefined, 'data:image/png;base64,***']) expect(errores(base({ firma: firma({ imagen }) })).join(' ')).toMatch(/firma\.imagen/);
    });
    it('una imagen de más de 400 KB se rechaza', () => {
      expect(errores(base({ firma: firma({ imagen: `data:image/png;base64,${'A'.repeat(400_001)}` }) })).join(' ')).toMatch(/firma\.imagen/);
    });
  });

  describe('criterio 4: «Sin firma» exige motivo y foto y deja el informe marcado para revisión', () => {
    const sin = (extra: Record<string, unknown> = {}) => ({ motivo: 'El encargado no está y no atiende el portero', foto: JPG, ...extra });
    const informeSin = (extra: Record<string, unknown> = {}) => ({ ...base({ firma: undefined, sinFirma: sin(extra) }) });

    it('con motivo y foto es válido, queda marcado para revisión y sin firma', () => {
      const i = validarInforme(informeSin({ motivo: '  El encargado no está  ' }));

      expect(i).toMatchObject({ requiereRevision: true, firma: null, sinFirma: { motivo: 'El encargado no está', foto: JPG } });
    });
    it.each([
      ['sin motivo', { motivo: undefined }, /exige el motivo/],
      ['con un motivo corto (9 caracteres)', { motivo: '123456789' }, /exige el motivo/],
      ['sin foto', { foto: undefined }, /exige una foto/],
      ['con una foto que no es imagen', { foto: 'data:text/html;base64,PGI+' }, /exige una foto/],
      ['con una foto que es una URL', { foto: 'https://x/y.jpg' }, /exige una foto/],
      ['con un motivo de más de 500 caracteres', { motivo: 'x'.repeat(501) }, /no puede superar/],
    ])('%s → 400', (_n, extra, mensaje) => {
      expect(errores(informeSin(extra)).join(' ')).toMatch(mensaje);
    });
    it('un motivo de exactamente 10 caracteres es válido', () => {
      expect(errores(informeSin({ motivo: '1234567890' }))).toEqual([]);
    });
  });

  describe('firma y «Sin firma» son excluyentes', () => {
    it('las dos a la vez → 400', () => {
      expect(errores(base({ sinFirma: { motivo: 'El encargado no está', foto: JPG } })).join(' ')).toMatch(/no las dos/);
    });
    it('ninguna → 400', () => {
      expect(errores(base({ firma: undefined })).join(' ')).toMatch(/Falta la firma del encargado o el cierre «Sin firma»/);
      expect(errores(base({ firma: null, sinFirma: null })).join(' ')).toMatch(/Falta la firma/);
    });
  });

  describe('los equipos y los datos del informe', () => {
    it('sin equipos, o con más de 50 → 400', () => {
      expect(errores(base({ equipos: [] })).join(' ')).toMatch(/al menos un equipo/);
      expect(errores(base({ equipos: undefined })).join(' ')).toMatch(/al menos un equipo/);
      expect(errores(base({ equipos: Array.from({ length: 51 }, () => equipo()) })).join(' ')).toMatch(/hasta 50/);
    });
    it('un equipo mal formado dice cuál', () => {
      const e = errores(base({ equipos: [equipo(), equipo({ tipo: 'volador', estadoEquipo: 'roto', respuestas: [] })] })).join(' ');

      expect(e).toMatch(/equipos\[1\]\.tipo/);
      expect(e).toMatch(/equipos\[1\]\.estadoEquipo/);
      expect(e).toMatch(/equipos\[1\]\.respuestas/);
      expect(e).not.toMatch(/equipos\[0\]/);
    });
    it('un equipo fuera de servicio es válido', () => {
      expect(errores(base({ equipos: [equipo({ estadoEquipo: 'fuera_de_servicio' })] }))).toEqual([]);
    });
    it('sin consorcioId, sin hora o con una hora que no es fecha → 400', () => {
      expect(errores(base({ consorcioId: ' ' })).join(' ')).toMatch(/consorcioId/);
      expect(errores(base({ horaDispositivo: undefined })).join(' ')).toMatch(/horaDispositivo/);
      expect(errores(base({ horaDispositivo: 'ayer' })).join(' ')).toMatch(/horaDispositivo/);
    });
    it('un cuerpo que no es un objeto → 400', () => {
      for (const c of [null, 'x', [], 5]) expect(errores(c).join(' ')).toMatch(/objeto JSON/);
    });
    it('junta los errores en una sola respuesta', () => {
      expect(errores({ equipos: [] }).length).toBeGreaterThanOrEqual(3);
    });
  });
});

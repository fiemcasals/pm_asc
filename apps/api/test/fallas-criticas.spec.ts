import { BadRequestException, NotFoundException } from '@nestjs/common';
import { renderInforme } from '../src/fallas-criticas/fallas-criticas.controller';
import { FallasCriticasService } from '../src/fallas-criticas/fallas-criticas.service';
import { EventoFallaCritica } from '../src/fallas-criticas/fallas-criticas.types';
import { FirmanteService } from '../src/firmante/firmante.service';

const BASE = {
  maquinaId: 'MAQ-CALLAO-M1',
  inspector: 'dev-ma-2',
  cablesDesgastados: false,
  limitadorAnulado: false,
};

describe('FallasCriticasService', () => {
  let service: FallasCriticasService;
  let recibidos: EventoFallaCritica[];

  beforeEach(() => {
    service = new FallasCriticasService(new FirmanteService());
    recibidos = [];
    service.eventos$().subscribe((e) => recibidos.push(e));
  });

  it('con cables desgastados emite un evento con los datos de la máquina y el enlace al informe', () => {
    const res = service.registrarInforme({ ...BASE, cablesDesgastados: true });

    expect(res.eventoEmitido).toBe(true);
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]).toMatchObject({
      tipo: 'falla-critica',
      informeId: res.informe.id,
      maquinaId: 'MAQ-CALLAO-M1',
      codigoAGC: 'M1',
      direccion: 'Av. Callao 850, CABA',
      eca: 'Elevadores San Martín',
      inspector: 'dev-ma-2',
      fallas: ['CABLES_DESGASTADOS'],
      enlaceInforme: `/api/fallas-criticas/informes/${res.informe.id}`,
    });
  });

  it('con el limitador anulado emite el evento', () => {
    service.registrarInforme({ ...BASE, limitadorAnulado: true });
    expect(recibidos.map((e) => e.fallas)).toEqual([['LIMITADOR_ANULADO']]);
  });

  it('con las dos fallas las informa juntas en un único evento', () => {
    service.registrarInforme({ ...BASE, cablesDesgastados: true, limitadorAnulado: true });
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0].fallas).toEqual(['CABLES_DESGASTADOS', 'LIMITADOR_ANULADO']);
  });

  it('un informe sin falla crítica se guarda pero no emite evento', () => {
    const res = service.registrarInforme(BASE);
    expect(res.eventoEmitido).toBe(false);
    expect(res.informe.fallasCriticas).toEqual([]);
    expect(recibidos).toHaveLength(0);
    expect(service.obtenerInforme(res.informe.id).id).toBe(res.informe.id);
  });

  it('rechaza con 400 nombrando cada campo inválido', () => {
    try {
      service.registrarInforme({ maquinaId: '', cablesDesgastados: 'si', fotografias: ['javascript:alert(1)'] });
      fail('debía rechazar');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const mensajes = (e as BadRequestException).getResponse() as { message: string[] };
      expect(mensajes.message).toEqual([
        'maquinaId es obligatorio',
        'inspector es obligatorio',
        'cablesDesgastados tiene que ser true o false',
        'limitadorAnulado tiene que ser true o false',
        'fotografias tiene que ser una lista de URLs http(s)',
      ]);
    }
    expect(recibidos).toHaveLength(0);
  });

  it('rechaza un cuerpo que no es objeto', () => {
    expect(() => service.registrarInforme(null)).toThrow(BadRequestException);
    expect(() => service.registrarInforme([BASE])).toThrow(BadRequestException);
  });

  it('responde 404 si la máquina no existe, sin emitir evento', () => {
    expect(() =>
      service.registrarInforme({ ...BASE, maquinaId: 'MAQ-NO-EXISTE', cablesDesgastados: true }),
    ).toThrow(NotFoundException);
    expect(recibidos).toHaveLength(0);
  });

  it('responde 404 para un informe inexistente', () => {
    expect(() => service.obtenerInforme('INF-nada')).toThrow(NotFoundException);
  });

  it('el informe devuelto es una copia: modificarlo no altera el guardado', () => {
    const res = service.registrarInforme({ ...BASE, cablesDesgastados: true });
    res.informe.inspector = 'otro';
    expect(service.obtenerInforme(res.informe.id).inspector).toBe('dev-ma-2');
  });
});

describe('renderInforme', () => {
  it('escapa el texto cargado por el usuario', () => {
    const service = new FallasCriticasService(new FirmanteService());
    const { informe } = service.registrarInforme({
      ...BASE,
      limitadorAnulado: true,
      observaciones: '<script>alert(1)</script>',
    });
    const html = renderInforme(informe);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Limitador de velocidad anulado');
  });
});

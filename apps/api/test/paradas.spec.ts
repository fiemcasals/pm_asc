import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FirmanteService } from '../src/firmante/firmante.service';
import { ParadasService } from '../src/paradas/paradas.service';

// HU-17 RF-03: el reporte de parada de un equipo fuera de servicio.
const MAQUINA = 'MAQ-CORRIENTES-M1';
const FOTO = 'data:image/jpeg;base64,AAAA';

describe('Reporte de parada (HU-17 RF-03)', () => {
  let firmante: FirmanteService;
  let service: ParadasService;
  beforeEach(() => {
    firmante = new FirmanteService();
    service = new ParadasService(firmante);
  });

  it('criterio 2: al guardar el equipo queda «Fuera de Servicio — Pendiente de confirmación» y se avisa a la Secretaría y al Firmante', async () => {
    const r = await service.registrar({ maquinaId: MAQUINA, causa: '  Cabina trabada en el 3.º  ', fotos: [FOTO] }, 'rt1');

    expect(r).toMatchObject({
      maquinaId: MAQUINA,
      causa: 'Cabina trabada en el 3.º',
      fotos: 1,
      estado: 'Fuera de Servicio — Pendiente de confirmación',
      reportadoPor: 'rt1',
      edificio: 'Consorcio Corrientes 1234',
    });
    expect(r.avisadoA).toEqual(['secretaria', 'firmante:gonza']);
    expect(firmante.getMaquinas().find((m) => m.id === MAQUINA)?.estadoOperativo).toBe('Fuera de Servicio');
    expect(service.listar()).toHaveLength(1);
  });

  it.each([
    ['sin causa', { maquinaId: MAQUINA, fotos: [FOTO] }, 'causa'],
    ['causa en blanco', { maquinaId: MAQUINA, causa: '   ', fotos: [FOTO] }, 'causa'],
    ['sin fotos', { maquinaId: MAQUINA, causa: 'x', fotos: [] }, 'foto'],
    ['fotos vacías', { maquinaId: MAQUINA, causa: 'x', fotos: ['', '  '] }, 'foto'],
    ['sin máquina', { causa: 'x', fotos: [FOTO] }, 'maquinaId'],
  ])('criterio 1: %s → 400 y no cambia nada', async (_n, cuerpo, campo) => {
    await expect(service.registrar(cuerpo, 'rt1')).rejects.toThrow(BadRequestException);
    try {
      await service.registrar(cuerpo, 'rt1');
    } catch (err) {
      expect(JSON.stringify((err as BadRequestException).getResponse())).toContain(campo);
    }
    expect(service.listar()).toEqual([]);
    expect(firmante.getMaquinas().find((m) => m.id === MAQUINA)?.estadoOperativo).not.toBe('Fuera de Servicio');
  });

  it('una máquina que no existe → 404; un equipo con un reporte pendiente → 409', async () => {
    await expect(service.registrar({ maquinaId: 'NO-EXISTE', causa: 'x', fotos: [FOTO] }, 'rt1')).rejects.toThrow(NotFoundException);

    await service.registrar({ maquinaId: MAQUINA, causa: 'x', fotos: [FOTO] }, 'rt1');
    await expect(service.registrar({ maquinaId: MAQUINA, causa: 'otra vez', fotos: [FOTO] }, 'rt1')).rejects.toThrow(ConflictException);
    expect(service.listar()).toHaveLength(1);
  });

  it('la lista no devuelve las imágenes, sólo cuántas hay', async () => {
    await service.registrar({ maquinaId: MAQUINA, causa: 'x', fotos: [FOTO, FOTO] }, 'rt1');

    expect(service.listar()[0].fotos).toBe(2);
    expect(JSON.stringify(service.listar())).not.toContain('base64');
  });
});

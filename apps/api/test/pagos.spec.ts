import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InMemoryPagosRepository } from '../src/pagos/pagos.repository';
import { PagosService } from '../src/pagos/pagos.service';

// HU-02 RF-04: abono mensual y porcentajes de pago por máquina.
const CONSORCIO = 'c1';
const MAQUINA = 'm1';

describe('Pago por máquina (HU-02 RF-04)', () => {
  let repo: InMemoryPagosRepository;
  let service: PagosService;

  beforeEach(() => {
    repo = new InMemoryPagosRepository();
    repo.agregarMaquina(CONSORCIO, MAQUINA);
    service = new PagosService(repo);
  });

  it('una máquina nueva arranca con 60 % para el RT de Calle, 25 % para el Firmante y sin abono', async () => {
    expect(await service.obtener(CONSORCIO, MAQUINA)).toMatchObject({ porcentajeRt: 60, porcentajeFirmante: 25, abonoMensual: null });
  });

  it('guarda el abono y los porcentajes y registra cada cambio con usuario, valor anterior y nuevo', async () => {
    const r = await service.guardar(CONSORCIO, MAQUINA, { abonoMensual: 200000, porcentajeRt: 50, porcentajeFirmante: 30 }, 'admin1');

    expect(r.pago).toMatchObject({ abonoMensual: 200000, porcentajeRt: 50, porcentajeFirmante: 30 });
    expect(r.cambios).toHaveLength(3);
    expect(r.cambios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: 'abono_mensual', valorAnterior: null, valorNuevo: '200000', usuario: 'admin1' }),
        expect.objectContaining({ campo: 'porcentaje_rt', valorAnterior: '60', valorNuevo: '50', usuario: 'admin1' }),
        expect.objectContaining({ campo: 'porcentaje_firmante', valorAnterior: '25', valorNuevo: '30', usuario: 'admin1' }),
      ]),
    );
    expect(await service.historial(CONSORCIO, MAQUINA)).toHaveLength(3);
  });

  it('un valor que no cambia no genera registro', async () => {
    const r = await service.guardar(CONSORCIO, MAQUINA, { porcentajeRt: 60 }, 'admin1');

    expect(r.cambios).toEqual([]);
  });

  it('se puede borrar el abono con null', async () => {
    await service.guardar(CONSORCIO, MAQUINA, { abonoMensual: 1000 }, 'a');
    const r = await service.guardar(CONSORCIO, MAQUINA, { abonoMensual: null }, 'a');

    expect(r.pago.abonoMensual).toBeNull();
    expect(r.cambios[0]).toMatchObject({ valorAnterior: '1000', valorNuevo: null });
  });

  it.each([
    ['porcentaje del RT mayor que 100', { porcentajeRt: 101 }],
    ['porcentaje del RT negativo', { porcentajeRt: -1 }],
    ['porcentaje del Firmante mayor que 100', { porcentajeFirmante: 100.5 }],
    ['porcentaje del Firmante negativo', { porcentajeFirmante: -0.01 }],
    ['suma mayor que 100 (RT)', { porcentajeRt: 80 }], // 80 + 25
    ['suma mayor que 100 (Firmante)', { porcentajeFirmante: 41 }], // 60 + 41
    ['suma mayor que 100 (los dos)', { porcentajeRt: 70, porcentajeFirmante: 40 }],
    ['abono negativo', { abonoMensual: -1 }],
    ['abono que no es número', { abonoMensual: '100' }],
    ['porcentaje que no es número', { porcentajeRt: '60' }],
    ['cuerpo vacío', {}],
  ])('%s → 400 y no cambia nada', async (_n, cuerpo) => {
    await expect(service.guardar(CONSORCIO, MAQUINA, cuerpo, 'admin1')).rejects.toBeInstanceOf(BadRequestException);

    expect(await service.obtener(CONSORCIO, MAQUINA)).toMatchObject({ porcentajeRt: 60, porcentajeFirmante: 25, abonoMensual: null });
    expect(await service.historial(CONSORCIO, MAQUINA)).toEqual([]);
  });

  it('la suma exactamente igual a 100 es válida y 0 también', async () => {
    await expect(service.guardar(CONSORCIO, MAQUINA, { porcentajeRt: 75 }, 'a')).resolves.toBeDefined(); // 75 + 25
    await expect(service.guardar(CONSORCIO, MAQUINA, { porcentajeRt: 0, porcentajeFirmante: 0 }, 'a')).resolves.toBeDefined();
  });

  it('el mensaje de la suma dice cuánto da', async () => {
    await expect(service.guardar(CONSORCIO, MAQUINA, { porcentajeRt: 80 }, 'a')).rejects.toMatchObject({
      response: { errores: [expect.stringContaining('80 + 25 = 105')] },
    });
  });

  it('un porcentaje fuera de rango dice que tiene que estar entre 0 y 100 (no sólo que la suma se pasa)', async () => {
    await expect(service.guardar(CONSORCIO, MAQUINA, { porcentajeRt: 101 }, 'a')).rejects.toMatchObject({
      response: { errores: [expect.stringContaining('entre 0 y 100')] },
    });
    await expect(service.guardar(CONSORCIO, MAQUINA, { porcentajeFirmante: 101 }, 'a')).rejects.toMatchObject({
      response: { errores: [expect.stringContaining('del Firmante tiene que estar entre 0 y 100')] },
    });
  });

  it('una máquina que no existe, o de otro consorcio, da 404', async () => {
    await expect(service.obtener(CONSORCIO, 'nada')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.guardar('otro', MAQUINA, { abonoMensual: 1 }, 'a')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.historial('otro', MAQUINA)).rejects.toBeInstanceOf(NotFoundException);
  });
});

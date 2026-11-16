import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InMemoryVisitasFallidasRepository, MaquinaBasica } from '../src/visitas-fallidas/visitas-fallidas.repository';
import { VisitasFallidasService } from '../src/visitas-fallidas/visitas-fallidas.service';

// HU-07 RF-04: el recargo del 45 % se suma una sola vez por máquina no inspeccionada y un Administrador puede anularlo.
const CONSORCIO = 'consorcio-recargo-unico';

describe('Recargo del 45 % una sola vez por máquina (HU-07 RF-04)', () => {
  let repo: InMemoryVisitasFallidasRepository;
  let service: VisitasFallidasService;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] }).setSystemTime(new Date('2026-11-10T15:00:00Z'));
    repo = new InMemoryVisitasFallidasRepository();
    service = new VisitasFallidasService(repo);
  });
  afterEach(() => jest.useRealTimers());

  const visita = (n = 1) =>
    service.registrarVisitaFallida({ consorcioId: CONSORCIO, fotoFrenteUrl: `https://f/${n}.jpg`, gps: { latitud: -34.6, longitud: -58.4 } });
  const tresVisitas = async () => {
    for (const n of [1, 2, 3]) await visita(n);
  };
  const liquidar = (periodo: string, maquinaId = 'maq-1') =>
    service.liquidarMaquina({ consorcioId: CONSORCIO, maquinaId, referenciaAgc: 'M1', periodo, montoBase: 100000 });

  it('criterio 1: la 3.ª advertencia suma el 45 % en la liquidación de su mes, por cada máquina no inspeccionada', async () => {
    await tresVisitas();

    const m1 = await liquidar('2026-11', 'maq-1');
    const m2 = await liquidar('2026-11', 'maq-2');

    expect(m1).toMatchObject({ recargoAplicado: true, montoRecargo: 45000, montoTotal: 145000, recargoNoAplicadoPor: null });
    expect(m2).toMatchObject({ recargoAplicado: true, montoRecargo: 45000 });
  });

  it('criterio 2: los meses posteriores no vuelven a sumarlo aunque el edificio siga bloqueado (ni el anterior lo lleva)', async () => {
    await tresVisitas();

    for (const periodo of ['2026-12', '2027-01', '2027-06']) {
      const liq = await liquidar(periodo);
      expect(liq).toMatchObject({ bloqueadoPorTerceraVisita: true, recargoAplicado: false, montoRecargo: 0, montoTotal: 100000, recargoNoAplicadoPor: 'otro_periodo' });
      expect(liq.avisoCobro).toBe('Cobro de Tercer Visita Habilitado'); // sigue bloqueado: el aviso no depende del recargo
    }
    expect((await liquidar('2026-10')).recargoAplicado).toBe(false);
  });

  it('liquidar el mismo mes dos veces da lo mismo (no consume el recargo)', async () => {
    await tresVisitas();

    expect((await liquidar('2026-11')).montoRecargo).toBe(45000);
    expect((await liquidar('2026-11')).montoRecargo).toBe(45000);
  });

  it('el mes de la 3.ª advertencia se cuenta en hora de Buenos Aires (la noche del 30/11 ya es diciembre en UTC)', async () => {
    jest.setSystemTime(new Date('2026-12-01T01:30:00Z')); // 30/11 22:30 en Buenos Aires
    await tresVisitas();

    expect((await liquidar('2026-11')).recargoAplicado).toBe(true);
    expect((await liquidar('2026-12')).recargoNoAplicadoPor).toBe('otro_periodo');
  });

  it('una máquina inspeccionada en ese mes no lleva recargo y las demás sí', async () => {
    await tresVisitas();
    repo.inspeccionadas.set(`${CONSORCIO}|2026-11`, ['maq-1']);

    expect(await liquidar('2026-11', 'maq-1')).toMatchObject({ recargoAplicado: false, recargoNoAplicadoPor: 'maquina_inspeccionada' });
    expect((await liquidar('2026-11', 'maq-2')).recargoAplicado).toBe(true);
  });

  it('con menos de 3 advertencias no hay recargo ni motivo', async () => {
    await visita(1);
    await visita(2);

    expect(await liquidar('2026-11')).toMatchObject({ recargoAplicado: false, recargoNoAplicadoPor: null, bloqueadoPorTerceraVisita: false, avisoCobro: null });
  });

  describe('criterio 3: anulación por un Administrador', () => {
    it('la anulación queda registrada con usuario, fecha y motivo, y la liquidación deja de incluir el recargo', async () => {
      await tresVisitas();

      const anulacion = await service.anularRecargo({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: '  Error de la Secretaría  ' }, 'admin1');

      expect(anulacion).toMatchObject({ consorcioId: CONSORCIO, maquinaId: 'maq-1', usuario: 'admin1', motivo: 'Error de la Secretaría' });
      expect(anulacion.fecha).toBe('2026-11-10T15:00:00.000Z');
      expect(repo.anulaciones).toHaveLength(1);
      const liq = await liquidar('2026-11', 'maq-1');
      expect(liq).toMatchObject({ recargoAplicado: false, montoRecargo: 0, recargoNoAplicadoPor: 'anulado' });
      expect(liq.recargoAnulado).toMatchObject({ usuario: 'admin1', motivo: 'Error de la Secretaría' });
      expect(liq.detalleConceptos.map((d) => d.concepto).join('|')).toContain('Recargo 45% anulado por admin1');
      expect((await liquidar('2026-11', 'maq-2')).recargoAplicado).toBe(true); // sólo esa máquina
    });

    it('sin motivo (vacío, sólo espacios o no texto) → 400 con todos los errores y no registra nada', async () => {
      await tresVisitas();

      for (const motivo of ['', '   ', undefined as unknown as string, 5 as unknown as string]) {
        await expect(service.anularRecargo({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo }, 'admin1')).rejects.toThrow(BadRequestException);
      }
      await expect(service.anularRecargo({ consorcioId: '', maquinaId: '', motivo: '' }, 'admin1')).rejects.toMatchObject({
        response: { errores: expect.arrayContaining([expect.stringContaining('consorcioId'), expect.stringContaining('maquinaId'), expect.stringContaining('motivo')]) },
      });
      await expect(service.anularRecargo({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: 'x'.repeat(501) }, 'admin1')).rejects.toThrow(BadRequestException);
      expect(repo.anulaciones).toHaveLength(0);
    });

    it('sólo se anula un recargo que existe: edificio con menos de 3 advertencias → 409', async () => {
      await visita(1);

      await expect(service.anularRecargo({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: 'x' }, 'admin1')).rejects.toThrow(ConflictException);
      expect(repo.anulaciones).toHaveLength(0);
    });

    it('no se anula dos veces el mismo recargo (409) y una máquina que no es del edificio da 404', async () => {
      await tresVisitas();
      await service.anularRecargo({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: 'primera' }, 'admin1');

      await expect(service.anularRecargo({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: 'segunda' }, 'admin2')).rejects.toThrow(ConflictException);
      expect(repo.anulaciones).toHaveLength(1);
      expect(repo.anulaciones[0].usuario).toBe('admin1');

      const maquinas: MaquinaBasica[] = [{ id: 'maq-1', referenciaAgc: 'M1' }];
      jest.spyOn(repo, 'listarMaquinasConsorcio').mockResolvedValue(maquinas);
      await expect(service.anularRecargo({ consorcioId: CONSORCIO, maquinaId: 'maq-de-otro-edificio', motivo: 'x' }, 'admin1')).rejects.toThrow(NotFoundException);
    });
  });
});

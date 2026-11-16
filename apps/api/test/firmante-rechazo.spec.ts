import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FirmanteService } from '../src/firmante/firmante.service';
import { diasHabilesTranscurridos } from '../src/firmante/plazo-habil';

// HU-08 RF-03: el Firmante rechaza un informe (vuelve a la Secretaría) y tiene 5 días hábiles para autorizarlo.
// En los datos de ejemplo: VIS-2026-11-101 es del miércoles 4/11/2026 y los de Santa Fe 3200 (VIS-2026-11-301 y 302) del jueves 5/11/2026.
const VISITA_A = 'VIS-2026-11-101';
const MAQUINA_A = 'MAQ-CORRIENTES-M1';
const DEL_5_NOV = ['MAQ-SANTAFE-M1', 'MAQ-SANTAFE-M2']; // los otros dos informes de los datos de ejemplo: jueves 5/11/2026
const dia = (iso: string) => new Date(`${iso}T15:00:00Z`); // mediodía en Buenos Aires

describe('Días hábiles transcurridos (lunes a viernes, hora de Buenos Aires)', () => {
  it.each([
    ['2026-11-06', '2026-11-06', 0], // el mismo día
    ['2026-11-06', '2026-11-07', 0], // viernes → sábado
    ['2026-11-06', '2026-11-09', 1], // viernes → lunes
    ['2026-11-09', '2026-11-16', 5], // lunes → lunes siguiente
    ['2026-11-09', '2026-11-17', 6], // lunes → martes siguiente: pasó el plazo
    ['2026-11-07', '2026-11-09', 1], // desde un sábado
    ['2026-11-04', '2026-11-11', 5], // miércoles → miércoles
    ['2026-11-04', '2026-11-12', 6],
  ])('de %s a %s: %i', (desde, hasta, esperado) => {
    expect(diasHabilesTranscurridos(dia(desde), dia(hasta))).toBe(esperado);
  });

  it('usa el día de Buenos Aires, no el de UTC: 23:30 del jueves en Buenos Aires ya es viernes en UTC', () => {
    const juevesNoche = new Date('2026-11-06T02:30:00Z'); // jueves 5/11 23:30 en Buenos Aires
    expect(diasHabilesTranscurridos(juevesNoche, dia('2026-11-06'))).toBe(1); // el viernes ya es 1 día hábil después (en UTC serían 0)
    expect(diasHabilesTranscurridos(dia('2026-11-06'), new Date('2026-11-10T02:30:00Z'))).toBe(1); // hasta el lunes 9/11 23:30 BA: sólo el lunes (en UTC ya sería martes: 2)
  });
});

describe('FirmanteService: rechazo del informe y plazo de 5 días hábiles (HU-08 RF-03)', () => {
  let service: FirmanteService;
  beforeEach(() => {
    service = new FirmanteService();
  });

  describe('criterio 1: rechazar con motivo obligatorio', () => {
    it('rechaza el informe con motivo, a nombre del Firmante, y devuelve el rechazo', async () => {
      const res = await service.rechazarInforme({ maquinaId: MAQUINA_A, motivo: '  Falta el protocolo firmado  ' }, 'gonza', dia('2026-11-10'));

      expect(res).toMatchObject({ ok: true, maquinaId: MAQUINA_A, visitaId: VISITA_A });
      expect(res.rechazo).toEqual({ motivo: 'Falta el protocolo firmado', rechazadoPor: 'gonza', fecha: dia('2026-11-10').toISOString() });
    });

    it('también se rechaza por el id de la visita', async () => {
      expect((await service.rechazarInforme({ visitaId: VISITA_A, motivo: 'x' })).maquinaId).toBe(MAQUINA_A);
    });

    it.each([['vacío', ''], ['sólo espacios', '   '], ['sin el campo', undefined], ['no es texto', 5 as unknown as string]])(
      'sin motivo (%s) → 400 y el informe no cambia',
      async (_nombre, motivo) => {
        await expect(service.rechazarInforme({ maquinaId: MAQUINA_A, motivo })).rejects.toThrow(BadRequestException);
        expect(service.getBandejaSecretaria(dia('2026-11-05')).rechazados).toHaveLength(0);
        expect(service.getMaquinas().find((m) => m.id === MAQUINA_A)?.visita?.rechazada).toBeUndefined();
      },
    );

    it('un motivo de más de 500 caracteres → 400', async () => {
      await expect(service.rechazarInforme({ maquinaId: MAQUINA_A, motivo: 'x'.repeat(501) })).rejects.toThrow(BadRequestException);
    });

    it('sin maquinaId ni visitaId → 400; id inexistente → 404', async () => {
      await expect(service.rechazarInforme({ motivo: 'x' })).rejects.toThrow(BadRequestException);
      await expect(service.rechazarInforme({ maquinaId: 'no-existe', motivo: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('un informe que no está recorrido no se rechaza (400) y uno ya autorizado o ya rechazado tampoco (409)', async () => {
      const pendiente = service.getMaquinas().find((m) => m.estado !== 'Recorrida');
      if (pendiente) await expect(service.rechazarInforme({ maquinaId: pendiente.id, motivo: 'x' })).rejects.toThrow(BadRequestException);

      await service.autorizarFirma({ maquinaId: MAQUINA_A });
      await expect(service.rechazarInforme({ maquinaId: MAQUINA_A, motivo: 'tarde' })).rejects.toThrow(ConflictException);

      await service.rechazarInforme({ visitaId: 'VIS-2026-11-302', motivo: 'primera vez' });
      await expect(service.rechazarInforme({ visitaId: 'VIS-2026-11-302', motivo: 'segunda vez' })).rejects.toThrow(ConflictException);
    });

    it('un informe rechazado con datos incompletos (le falta la foto de cables) también da 409 al autorizar, no 400', async () => {
      await service.rechazarInforme({ maquinaId: 'MAQ-SANTAFE-M2', motivo: 'x' });

      await expect(service.autorizarFirma({ maquinaId: 'MAQ-SANTAFE-M2' })).rejects.toThrow(ConflictException);
    });

    it('un informe rechazado ya no se puede autorizar (409)', async () => {
      await service.rechazarInforme({ maquinaId: MAQUINA_A, motivo: 'x' });

      await expect(service.autorizarFirma({ maquinaId: MAQUINA_A })).rejects.toThrow(ConflictException);
      expect(service.getMaquinas().find((m) => m.id === MAQUINA_A)?.visita?.autorizada).toBe(false);
    });
  });

  describe('criterio 2: el informe rechazado aparece en la bandeja de la Secretaría con el motivo', () => {
    it('lista el rechazo con edificio, máquina, motivo, quién y cuándo', async () => {
      await service.rechazarInforme({ maquinaId: MAQUINA_A, motivo: 'Foto de cables ilegible' }, 'gonza', dia('2026-11-06'));

      const { rechazados } = service.getBandejaSecretaria(dia('2026-11-06'));

      expect(rechazados).toEqual([
        {
          maquinaId: MAQUINA_A, codigoAGC: 'M1', edificio: 'Consorcio Corrientes 1234', visitaId: VISITA_A,
          motivo: 'Foto de cables ilegible', rechazadoPor: 'gonza', fecha: dia('2026-11-06').toISOString(),
        },
      ]);
    });

    it('sin rechazos, la bandeja de rechazados está vacía', () => {
      expect(service.getBandejaSecretaria(dia('2026-11-05')).rechazados).toEqual([]);
    });
  });

  describe('criterio 3: más de 5 días hábiles sin autorizar genera un aviso a la Secretaría, una sola vez', () => {
    it('con 5 días hábiles todavía no avisa; con 6 sí (el informe del miércoles 4/11)', () => {
      expect(service.getBandejaSecretaria(dia('2026-11-11')).avisosPlazo).toEqual([]); // miércoles siguiente: 5

      const { avisosPlazo } = service.getBandejaSecretaria(dia('2026-11-12')); // jueves: 6

      expect(avisosPlazo).toHaveLength(1);
      expect(avisosPlazo[0]).toMatchObject({ maquinaId: MAQUINA_A, visitaId: VISITA_A, edificio: 'Consorcio Corrientes 1234', diasHabiles: 6, fechaInforme: '2026-11-04T10:30:00.000Z' });
    });

    it('los fines de semana no cuentan: los informes del jueves 5/11 avisan el viernes 13 (6) y no el jueves 12 (5)', () => {
      const jueves = service.getBandejaSecretaria(dia('2026-11-12')).avisosPlazo.map((a) => a.maquinaId);
      const viernes = service.getBandejaSecretaria(dia('2026-11-13')).avisosPlazo.map((a) => a.maquinaId);

      expect(jueves).toEqual([MAQUINA_A]);
      expect(viernes).toEqual([MAQUINA_A, ...DEL_5_NOV]);
    });

    it('un sábado y un domingo no suman un día hábil: el informe del 4/11 avisa el 12, no antes, y a los fines de semana ya avisado no repite', () => {
      expect(service.getBandejaSecretaria(dia('2026-11-08')).avisosPlazo).toEqual([]); // domingo
      expect(service.getBandejaSecretaria(dia('2026-11-12')).avisosPlazo).toHaveLength(1);
    });

    it('el aviso se genera una sola vez aunque la bandeja se abra muchas veces o más adelante', () => {
      const primera = service.getBandejaSecretaria(dia('2026-11-13')).avisosPlazo;
      const segunda = service.getBandejaSecretaria(dia('2026-11-13')).avisosPlazo;
      const mesDespues = service.getBandejaSecretaria(dia('2026-12-14')).avisosPlazo;

      expect(primera).toHaveLength(3);
      expect(segunda).toEqual(primera);
      expect(mesDespues).toEqual(primera); // sin avisos nuevos ni repetidos, con la fecha del primero
    });
  });

  describe('criterio 4: dentro del plazo (autorizado o rechazado) no hay aviso', () => {
    it('un informe autorizado a tiempo no genera aviso', async () => {
      await service.autorizarFirma({ maquinaId: MAQUINA_A });

      const { avisosPlazo } = service.getBandejaSecretaria(dia('2026-12-01'));

      expect(avisosPlazo.map((a) => a.maquinaId)).toEqual(DEL_5_NOV);
    });

    it('un informe rechazado a tiempo no genera aviso (ya volvió a la Secretaría)', async () => {
      await service.rechazarInforme({ maquinaId: MAQUINA_A, motivo: 'x' }, 'gonza', dia('2026-11-06'));

      const { avisosPlazo, rechazados } = service.getBandejaSecretaria(dia('2026-12-01'));

      expect(avisosPlazo.map((a) => a.maquinaId)).toEqual(DEL_5_NOV);
      expect(rechazados.map((r) => r.maquinaId)).toEqual([MAQUINA_A]);
    });
  });
});

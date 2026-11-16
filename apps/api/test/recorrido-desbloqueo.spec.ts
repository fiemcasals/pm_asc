import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppConfig } from '../src/config';
import { InMemoryVisitasFallidasRepository } from '../src/visitas-fallidas/visitas-fallidas.repository';
import { VisitasFallidasService } from '../src/visitas-fallidas/visitas-fallidas.service';

// HU-07 RF-05 (servicio, con varios días simulados): el edificio bloqueado sale del recorrido del RT hasta que la Secretaría lo
// desbloquea, entre visitas fallidas pasa al menos 1 día, y el contador sólo vuelve a cero con una visita exitosa.
const EDIFICIO = 'edificio-recorrido';
const OTRO = 'edificio-limpio';
const dia = (n: number, hora = '15:00:00') => new Date(`2026-11-${String(n).padStart(2, '0')}T${hora}Z`);

describe('Recorrido del RT, desbloqueo y días entre visitas fallidas (HU-07 RF-05)', () => {
  let repo: InMemoryVisitasFallidasRepository;
  let service: VisitasFallidasService;
  const ir = (n: number, hora?: string) => jest.setSystemTime(dia(n, hora));
  const fallar = (n: number, hora?: string, consorcioId = EDIFICIO) => {
    ir(n, hora);
    return service.registrarVisitaFallida({ consorcioId, fotoFrenteUrl: `https://f/${n}.jpg`, gps: { latitud: -34.6, longitud: -58.4 } });
  };
  const bloquear = async () => {
    await fallar(2);
    await fallar(3);
    await fallar(4);
  };

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
    ir(1);
    repo = new InMemoryVisitasFallidasRepository();
    repo.edificios = [
      { id: EDIFICIO, nombre: 'Edificio A', direccion: 'Calle A 1' },
      { id: OTRO, nombre: 'Edificio B', direccion: 'Calle B 2' },
    ];
    service = new VisitasFallidasService(repo, { visitasFallidasMinDias: 1 } as AppConfig);
  });
  afterEach(() => jest.useRealTimers());

  describe('criterio 3: entre dos visitas fallidas del mismo edificio pasa al menos 1 día', () => {
    it('la segunda visita fallida del mismo día responde 409 y no suma advertencia', async () => {
      await fallar(2, '13:00:00');

      await expect(fallar(2, '20:00:00')).rejects.toThrow(ConflictException);

      expect(repo.registros).toHaveLength(1);
      expect((await service.getHistorialConsorcio(EDIFICIO)).totalAdvertencias).toBe(1);
    });

    it('el mensaje del 409 dice por qué', async () => {
      await fallar(2);
      await expect(fallar(2, '22:00:00')).rejects.toThrow(/ya tiene una visita fallida de hoy/);
    });

    it('al día siguiente sí se registra (aunque pasen menos de 24 horas)', async () => {
      await fallar(2, '23:00:00'); // 20:00 en Buenos Aires
      const siguiente = await fallar(3, '13:00:00'); // 10:00 del día siguiente en Buenos Aires: 14 h después

      expect(siguiente.numeroAdvertencia).toBe(2);
    });

    it('el día se cuenta en hora de Buenos Aires: 22:30 y 23:30 BA son el mismo día aunque en UTC ya sea la fecha siguiente', async () => {
      ir(2, '01:30:00'); // 1/11 22:30 BA
      await service.registrarVisitaFallida({ consorcioId: EDIFICIO, fotoFrenteUrl: 'https://f/a.jpg', gps: { latitud: -34.6, longitud: -58.4 } });

      ir(2, '02:30:00'); // 1/11 23:30 BA: mismo día
      await expect(
        service.registrarVisitaFallida({ consorcioId: EDIFICIO, fotoFrenteUrl: 'https://f/b.jpg', gps: { latitud: -34.6, longitud: -58.4 } }),
      ).rejects.toThrow(ConflictException);
    });

    it('es por edificio: otro edificio puede fallar el mismo día', async () => {
      await fallar(2);

      await expect(fallar(2, '16:00:00', OTRO)).resolves.toMatchObject({ numeroAdvertencia: 1 });
    });

    it('con el mínimo en 0 (configuración) no se exige la separación', async () => {
      service = new VisitasFallidasService(repo, { visitasFallidasMinDias: 0 } as AppConfig);
      await fallar(2, '13:00:00');

      await expect(fallar(2, '14:00:00')).resolves.toMatchObject({ numeroAdvertencia: 2 });
    });
  });

  describe('criterio 4: el contador vuelve a cero solo con una visita exitosa', () => {
    it('sin visita exitosa las advertencias siguen sumando; con una inspección posterior el contador empieza de nuevo', async () => {
      await fallar(2);
      await fallar(3);
      expect((await service.getHistorialConsorcio(EDIFICIO)).totalAdvertencias).toBe(2);

      repo.inspecciones.set(EDIFICIO, dia(3, '18:00:00').toISOString()); // visita exitosa

      expect((await service.getHistorialConsorcio(EDIFICIO)).totalAdvertencias).toBe(0);
      const nueva = await fallar(4);
      expect(nueva.numeroAdvertencia).toBe(1); // otra vez Advertencia 1 y con su email formal
      expect(nueva.emailNotificacion).not.toBeNull();
      expect((await service.getHistorialConsorcio(EDIFICIO)).totalAdvertencias).toBe(1);
    });

    it('una inspección anterior a las fallidas no las borra', async () => {
      repo.inspecciones.set(EDIFICIO, dia(1).toISOString());
      await fallar(2);
      await fallar(3);

      expect((await service.getHistorialConsorcio(EDIFICIO)).totalAdvertencias).toBe(2);
    });

    it('desbloquear NO reinicia el contador: sigue en 3 hasta una visita exitosa', async () => {
      await bloquear();
      await service.desbloquearEdificio(EDIFICIO, { motivo: 'Se coordinó con la administración' }, 'sec1');

      const resumen = await service.getHistorialConsorcio(EDIFICIO);

      expect(resumen.totalAdvertencias).toBe(3);
      expect(resumen.bloqueadoPorTerceraVisita).toBe(false);
    });

    it('un edificio bloqueado que recibe una inspección deja de estar bloqueado y vuelve al recorrido', async () => {
      await bloquear();
      ir(5);
      repo.inspecciones.set(EDIFICIO, dia(5).toISOString());

      expect((await service.getHistorialConsorcio(EDIFICIO)).bloqueadoPorTerceraVisita).toBe(false);
      expect((await service.getRecorrido('rt_calle')).map((e) => e.id)).toContain(EDIFICIO);
    });
  });

  describe('criterio 1: el edificio bloqueado no aparece en la lista de edificios a visitar del RT', () => {
    it('el RT ve los edificios sin bloqueo; el bloqueado sale de su lista', async () => {
      await bloquear();

      const rt = await service.getRecorrido('rt_calle');

      expect(rt.map((e) => e.id)).toEqual([OTRO]);
      expect(rt[0]).toEqual({ id: OTRO, nombre: 'Edificio B', direccion: 'Calle B 2', bloqueado: false, visitaFallidaHoy: false });
    });

    it('con 2 advertencias todavía está en el recorrido', async () => {
      await fallar(2);
      await fallar(3);
      ir(4); // al día siguiente de la última visita fallida el pin vuelve (HU-07 RF-06)

      expect((await service.getRecorrido('rt_calle')).map((e) => e.id)).toEqual([EDIFICIO, OTRO]);
    });

    it('la Secretaría y el Administrador ven todos, con el estado de bloqueo', async () => {
      await bloquear();

      for (const rol of ['secretaria', 'administrador']) {
        const lista = await service.getRecorrido(rol);
        expect(lista.map((e) => `${e.id}:${e.bloqueado}`)).toEqual([`${EDIFICIO}:true`, `${OTRO}:false`]);
      }
    });
  });

  describe('criterio 2: la Secretaría desbloquea con motivo obligatorio; vuelve al recorrido y queda registrado', () => {
    it('desbloquea, queda registrado con usuario, fecha y motivo, y el edificio vuelve a la lista del RT', async () => {
      await bloquear();
      ir(6);

      const registro = await service.desbloquearEdificio(EDIFICIO, { motivo: '  Visita coordinada con el administrador  ' }, 'sec1');

      expect(registro).toMatchObject({ consorcioId: EDIFICIO, usuario: 'sec1', motivo: 'Visita coordinada con el administrador' });
      expect(registro.fecha).toBe(dia(6).toISOString());
      expect(repo.desbloqueos).toHaveLength(1);
      expect((await service.getRecorrido('rt_calle')).map((e) => e.id)).toEqual([EDIFICIO, OTRO]);
      expect((await service.getBloqueoConsorcio(EDIFICIO)).bloqueado).toBe(false);
    });

    it.each([['vacío', ''], ['sólo espacios', '   '], ['no es texto', 5 as unknown as string], ['sin el campo', undefined as unknown as string]])(
      'sin motivo (%s) → 400 y sigue bloqueado',
      async (_nombre, motivo) => {
        await bloquear();

        await expect(service.desbloquearEdificio(EDIFICIO, { motivo }, 'sec1')).rejects.toThrow(BadRequestException);

        expect(repo.desbloqueos).toHaveLength(0);
        expect((await service.getBloqueoConsorcio(EDIFICIO)).bloqueado).toBe(true);
      },
    );

    it('un motivo de más de 500 caracteres → 400', async () => {
      await bloquear();
      await expect(service.desbloquearEdificio(EDIFICIO, { motivo: 'x'.repeat(501) }, 'sec1')).rejects.toThrow(BadRequestException);
    });

    it('un edificio que no está bloqueado → 409; desbloquearlo dos veces → 409', async () => {
      await fallar(2);
      await expect(service.desbloquearEdificio(EDIFICIO, { motivo: 'x' }, 'sec1')).rejects.toThrow(ConflictException);

      await fallar(3);
      await fallar(4);
      await service.desbloquearEdificio(EDIFICIO, { motivo: 'primera' }, 'sec1');
      await expect(service.desbloquearEdificio(EDIFICIO, { motivo: 'segunda' }, 'sec2')).rejects.toThrow(ConflictException);
      expect(repo.desbloqueos).toHaveLength(1);
    });

    it('si el edificio vuelve a fallar después del desbloqueo, se bloquea de nuevo y sale del recorrido; y se puede desbloquear otra vez', async () => {
      await bloquear();
      await service.desbloquearEdificio(EDIFICIO, { motivo: 'primera' }, 'sec1');

      const cuarta = await fallar(6);

      expect(cuarta.numeroAdvertencia).toBe(3); // el tipo de advertencia llega hasta 3
      expect((await service.getBloqueoConsorcio(EDIFICIO)).bloqueado).toBe(true);
      expect((await service.getRecorrido('rt_calle')).map((e) => e.id)).toEqual([OTRO]);
      await service.desbloquearEdificio(EDIFICIO, { motivo: 'segunda' }, 'sec1');
      expect(repo.desbloqueos).toHaveLength(2);
    });

    it('desbloquear no borra el recargo del 45 %: se generó con la 3.ª advertencia', async () => {
      await bloquear();
      await service.desbloquearEdificio(EDIFICIO, { motivo: 'x' }, 'sec1');

      const liquidacion = await service.liquidarMaquina({ consorcioId: EDIFICIO, maquinaId: 'maq-1', referenciaAgc: 'M1', periodo: '2026-11', montoBase: 100000 });

      expect(liquidacion).toMatchObject({ recargoAplicado: true, montoRecargo: 45000 });
    });
  });
});

import { BadRequestException } from '@nestjs/common';
import { AppConfig } from '../src/config';
import { InMemoryVisitasFallidasRepository } from '../src/visitas-fallidas/visitas-fallidas.repository';
import { VisitasFallidasService } from '../src/visitas-fallidas/visitas-fallidas.service';

// HU-07 RF-06 (servicio): la constancia de visita fallida del RT con causa elegida, GPS y hora del dispositivo y del servidor.
const EDIFICIO = 'edificio-constancia';
const OTRO = 'otro-edificio';
const rt = { usuario: 'rt.ana', rol: 'rt_calle' };
const CAUSA = 'Encargado o responsable ausente';

describe('Constancia de visita fallida del RT (HU-07 RF-06)', () => {
  let repo: InMemoryVisitasFallidasRepository;
  let service: VisitasFallidasService;
  const cuerpo = (extra: Record<string, unknown> = {}) => ({
    consorcioId: EDIFICIO,
    causa: CAUSA,
    fotoFrenteUrl: 'data:image/jpeg;base64,AAAA',
    gps: { latitud: -34.6, longitud: -58.4, precision: 8.5 },
    horaDispositivo: '2026-11-16T10:00:00.000Z',
    ...extra,
  });

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
    jest.setSystemTime(new Date('2026-11-16T15:00:00Z'));
    repo = new InMemoryVisitasFallidasRepository();
    repo.edificios = [
      { id: EDIFICIO, nombre: 'Edificio A', direccion: 'Calle A 1' },
      { id: OTRO, nombre: 'Edificio B', direccion: 'Calle B 2' },
    ];
    service = new VisitasFallidasService(repo, { visitasFallidasMinDias: 1, visitasFallidasCausas: [CAUSA, 'Consorcio cerrado'] } as AppConfig);
  });
  afterEach(() => jest.useRealTimers());

  describe('criterio 1: la causa se elige de la lista configurada y la de por defecto es «Encargado o responsable ausente»', () => {
    it('devuelve la lista y la causa por defecto (la primera)', () => {
      expect(service.getCausas()).toEqual({ causas: [CAUSA, 'Consorcio cerrado'], porDefecto: CAUSA });
    });

    it('sin configuración, la única causa es «Encargado o responsable ausente»', () => {
      const sola = new VisitasFallidasService(repo, {} as AppConfig);
      expect(sola.getCausas()).toEqual({ causas: [CAUSA], porDefecto: CAUSA });
    });

    it.each([[undefined], [''], ['   ']])('el RT sin causa (%p) → 400 y no se registra nada', async (causa) => {
      await expect(service.registrarVisitaFallida(cuerpo({ causa }), rt)).rejects.toThrow(BadRequestException);
      expect(repo.registros).toHaveLength(0);
    });

    it('una causa que no está en la lista → 400 con las causas válidas', async () => {
      await expect(service.registrarVisitaFallida(cuerpo({ causa: 'Me dio fiaca' }), rt)).rejects.toThrow(
        /no está entre las configuradas.*Encargado o responsable ausente \/ Consorcio cerrado/,
      );
      expect(repo.registros).toHaveLength(0);
    });

    it('con una causa de la lista queda guardada como motivo', async () => {
      const r = await service.registrarVisitaFallida(cuerpo({ causa: 'Consorcio cerrado' }), rt);
      expect(r.motivo).toBe('Consorcio cerrado');
    });
  });

  describe('criterio 3: se guardan coordenadas, precisión, hora del dispositivo y hora del servidor', () => {
    it('guarda coordenadas, precisión, hora del dispositivo y hora del servidor', async () => {
      const r = await service.registrarVisitaFallida(cuerpo(), rt);

      expect(r.gps).toMatchObject({ latitud: -34.6, longitud: -58.4, precision: 8.5 });
      expect(r.horaDispositivo).toBe('2026-11-16T10:00:00.000Z');
      expect(r.fechaHora).toBe('2026-11-16T15:00:00.000Z'); // la del servidor, no la del celular
    });

    it('la hora del servidor la fija la API aunque el celular mande otra', async () => {
      const r = await service.registrarVisitaFallida(cuerpo({ fechaHora: '2020-01-01T00:00:00Z', horaDispositivo: '2020-01-01T00:00:00Z' }), rt);

      expect(r.fechaHora).toBe('2026-11-16T15:00:00.000Z');
      expect(r.horaDispositivo).toBe('2020-01-01T00:00:00.000Z'); // la del celular se guarda tal cual, aparte
    });

    it('el RT sin hora del dispositivo o con una inválida → 400', async () => {
      await expect(service.registrarVisitaFallida(cuerpo({ horaDispositivo: undefined }), rt)).rejects.toThrow(/hora del dispositivo/);
      await expect(service.registrarVisitaFallida(cuerpo({ horaDispositivo: 'ayer' }), rt)).rejects.toThrow(/horaDispositivo/);
      expect(repo.registros).toHaveLength(0);
    });

    it('el inspector es siempre quien tiene la sesión, no el que dice el cuerpo', async () => {
      const r = await service.registrarVisitaFallida(cuerpo({ inspector: 'otra.persona' }), rt);

      expect(r.inspector).toBe('rt.ana');
    });

    it('la Secretaría puede cargar sin hora del dispositivo ni causa (sigue funcionando como antes)', async () => {
      const r = await service.registrarVisitaFallida(
        { consorcioId: EDIFICIO, fotoFrenteUrl: 'https://f/1.jpg', gps: { latitud: -34.6, longitud: -58.4 }, inspector: 'Carlos' },
        { usuario: 'sec1', rol: 'secretaria' },
      );

      expect(r.horaDispositivo).toBeNull();
      expect(r.inspector).toBe('Carlos');
    });
  });

  describe('criterio 4: suma 1 al contador, el pin desaparece ese día y un segundo intento se rechaza con el motivo', () => {
    it('el contador suma 1 y el edificio sale del recorrido del RT ese día; el otro sigue', async () => {
      expect((await service.getRecorrido('rt_calle')).map((e) => e.id)).toEqual([EDIFICIO, OTRO]);

      const r = await service.registrarVisitaFallida(cuerpo(), rt);

      expect(r.numeroAdvertencia).toBe(1);
      expect((await service.getHistorialConsorcio(EDIFICIO)).totalAdvertencias).toBe(1);
      expect((await service.getRecorrido('rt_calle')).map((e) => e.id)).toEqual([OTRO]);
    });

    it('la Secretaría sigue viéndolo, marcado con visitaFallidaHoy', async () => {
      await service.registrarVisitaFallida(cuerpo(), rt);

      const lista = await service.getRecorrido('secretaria');

      expect(lista.map((e) => `${e.id}:${e.visitaFallidaHoy}`)).toEqual([`${EDIFICIO}:true`, `${OTRO}:false`]);
    });

    it('un segundo intento el mismo día → 409 con el motivo y no suma', async () => {
      await service.registrarVisitaFallida(cuerpo(), rt);
      jest.setSystemTime(new Date('2026-11-16T22:00:00Z'));

      await expect(service.registrarVisitaFallida(cuerpo(), rt)).rejects.toThrow(/ya tiene una visita fallida de hoy/);

      expect((await service.getHistorialConsorcio(EDIFICIO)).totalAdvertencias).toBe(1);
    });

    it('al día siguiente el pin vuelve y se puede registrar de nuevo', async () => {
      await service.registrarVisitaFallida(cuerpo(), rt);
      jest.setSystemTime(new Date('2026-11-17T15:00:00Z'));

      expect((await service.getRecorrido('rt_calle')).map((e) => e.id)).toContain(EDIFICIO);
      expect((await service.registrarVisitaFallida(cuerpo(), rt)).numeroAdvertencia).toBe(2);
    });

    it('el día se cuenta en hora de Buenos Aires: 23:30 y 00:30 de allá son días distintos aunque en UTC sea el mismo', async () => {
      jest.setSystemTime(new Date('2026-11-17T02:30:00Z')); // 23:30 del 16 en Buenos Aires
      await service.registrarVisitaFallida(cuerpo(), rt);
      jest.setSystemTime(new Date('2026-11-17T03:30:00Z')); // 00:30 del 17 en Buenos Aires

      expect((await service.getRecorrido('rt_calle')).map((e) => e.id)).toContain(EDIFICIO);
    });
  });
});

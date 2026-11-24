import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { contenidoSellado, hashInforme, validarInforme } from '../src/informes/informes.logic';
import { InMemoryInformesRepository } from '../src/informes/informes.repository';
import { InformesService } from '../src/informes/informes.service';
import { fotosObligatorias } from './fotos-obligatorias';

// HU-18 RNF-02 (servidor): reenviar el mismo informe no lo duplica, gracias al identificador generado en el celular.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=';
const TRAZO = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  consorcioId: 'c1', horaDispositivo: '2026-11-17T13:00:00.000Z',
  equipos: [{ maquinaId: 'm1', referenciaAgc: 'M1', tipo: 'traccion', estadoEquipo: 'en_uso', respuestas: {}, observaciones: {}, fotos: fotosObligatorias() }],
  firma: { nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', imagen: PNG, trazos: [TRAZO] }, ...extra,
});
const ID = '3f2b8a4e-5c1d-4e7a-9b60-1d2c3e4f5a6b';

describe('clientReportId: validación (criterio 3)', () => {
  const errores = (valor: unknown): string[] => {
    try {
      validarInforme(cuerpo({ clientReportId: valor }));
      return [];
    } catch (e) {
      return ((e as BadRequestException).getResponse() as { errores: string[] }).errores;
    }
  };

  it('es opcional: sin identificador el informe es válido y queda null', () => {
    expect(validarInforme(cuerpo()).clientReportId).toBeNull();
    expect(validarInforme(cuerpo({ clientReportId: null })).clientReportId).toBeNull();
  });
  it('un UUID y otros identificadores de 8 a 100 caracteres (letras, números, - y _) son válidos', () => {
    expect(validarInforme(cuerpo({ clientReportId: ID })).clientReportId).toBe(ID);
    for (const ok of ['abcdefgh', 'A1_b-2c3', 'x'.repeat(100)]) expect(errores(ok)).toEqual([]);
  });
  it.each([['muy corto', 'abc1234'], ['muy largo', 'x'.repeat(101)], ['con espacios', 'abcd efgh1'], ['con símbolos', 'abcdefgh!'], ['vacío', ''], ['un número', 12345678], ['un objeto', {}]])('un identificador %s → 400', (_n, valor) => {
    expect(errores(valor).join(' ')).toMatch(/clientReportId/);
  });
});

describe('InformesService: reenvío sin duplicar (criterio 3)', () => {
  let repo: InMemoryInformesRepository;
  let service: InformesService;

  beforeEach(() => {
    repo = new InMemoryInformesRepository();
    repo.edificios.add('c1');
    service = new InformesService(repo);
  });

  it('el primer envío crea el informe (creado: true) y guarda el identificador del celular', async () => {
    const r = await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');

    expect(r.creado).toBe(true);
    expect(r.informe.clientReportId).toBe(ID);
    expect(repo.informes).toHaveLength(1);
  });

  it('reenviar el mismo informe devuelve el original (creado: false), con el mismo id, hash y hora, y no crea otro', async () => {
    const primero = await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');
    const segundo = await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');

    expect(segundo.creado).toBe(false);
    expect(segundo.informe).toEqual(primero.informe);
    expect(repo.informes).toHaveLength(1);
  });

  it('reenviar varias veces sigue sin duplicar', async () => {
    for (let i = 0; i < 5; i++) await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');

    expect(repo.informes).toHaveLength(1);
  });

  it('con otro contenido pero el mismo identificador se devuelve el original (el celular reintenta el mismo informe)', async () => {
    const primero = await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');
    const otro = cuerpo({ clientReportId: ID });
    otro.equipos[0].observaciones = { cabina: 'distinto' } as never;

    const r = await service.crearIdempotente(otro, 'rt1');

    expect(r.informe.id).toBe(primero.informe.id);
    expect(r.informe.equipos[0].observaciones).toEqual({});
  });

  it('identificadores distintos son informes distintos; sin identificador cada envío crea el suyo', async () => {
    await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');
    await service.crearIdempotente(cuerpo({ clientReportId: 'otro-identificador-1' }), 'rt1');
    await service.crearIdempotente(cuerpo(), 'rt1');
    await service.crearIdempotente(cuerpo(), 'rt1');

    expect(repo.informes).toHaveLength(4);
  });

  it('un identificador que ya usó otro usuario → 409 y no se devuelve su informe', async () => {
    await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');

    await expect(service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt2')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.informes).toHaveLength(1);
  });

  it('dos envíos simultáneos con el mismo identificador crean un solo informe y los dos reciben el mismo', async () => {
    const [a, b] = await Promise.all([service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1'), service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1')]);

    expect(repo.informes).toHaveLength(1);
    expect(a.informe.id).toBe(b.informe.id);
    expect([a.creado, b.creado].sort()).toEqual([false, true]);
  });

  it('el reenvío de un informe ya creado no necesita que el edificio siga siendo visible (devuelve el original)', async () => {
    await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');
    repo.edificios.clear();

    expect((await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1')).creado).toBe(false);
  });

  it('un edificio que no existe sigue dando 404 (y no consume el identificador)', async () => {
    await expect(service.crearIdempotente(cuerpo({ clientReportId: ID, consorcioId: 'nada' }), 'rt1')).rejects.toBeInstanceOf(NotFoundException);

    repo.edificios.add('c1');
    expect((await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1')).creado).toBe(true);
  });

  it('el identificador no forma parte del sello: no está en el contenido sellado y el hash no cambia si es otro', async () => {
    const r = await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');

    expect(Object.keys(contenidoSellado(r.informe))).not.toContain('clientReportId');
    expect(hashInforme(contenidoSellado({ ...r.informe, clientReportId: 'otro-identificador-1' }))).toBe(r.informe.hashSha256);
    expect(hashInforme(contenidoSellado({ ...r.informe, clientReportId: null }))).toBe(r.informe.hashSha256);
  });

  it('el informe reenviado sigue sellado: la verificación coincide', async () => {
    const r = await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');
    await service.crearIdempotente(cuerpo({ clientReportId: ID }), 'rt1');

    const v = await service.verificar(r.informe.id, { usuario: 'sec1', rol: 'secretaria' });

    expect(v.coincide).toBe(true);
  });

  it('crear() sigue devolviendo el informe (compatibilidad)', async () => {
    const i = await service.crear(cuerpo({ clientReportId: ID }), 'rt1');
    const j = await service.crear(cuerpo({ clientReportId: ID }), 'rt1');

    expect(j.id).toBe(i.id);
  });
});

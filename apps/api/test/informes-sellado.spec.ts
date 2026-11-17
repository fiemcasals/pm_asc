import { createHash } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { canonicalizar, contenidoSellado, hashInforme } from '../src/informes/informes.logic';
import { InMemoryInformesRepository } from '../src/informes/informes.repository';
import { InformesService, MENSAJE_INFORME_CERRADO } from '../src/informes/informes.service';
import { ContenidoSellado, VERSION_HASH } from '../src/informes/informes.types';

// HU-18 RNF-01: el sello del informe cerrado (SHA-256), la verificación y los intentos de modificarlo.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
const TRAZO = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);
const sha = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex');
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  consorcioId: 'c1', horaDispositivo: '2026-11-17T13:00:00.000Z',
  equipos: [{ maquinaId: 'm1', referenciaAgc: 'M1', tipo: 'traccion', estadoEquipo: 'en_uso', respuestas: { cabina: { a: 'ok' } }, observaciones: { cabina: 'Sin novedades' }, fotos: { f1: { dataUrl: JPG } } }],
  firma: { nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', imagen: PNG, trazos: [TRAZO] }, ...extra,
});

describe('canonicalizar (criterio 1: el hash no depende del orden de las claves)', () => {
  it('ordena las claves en todos los niveles, sin espacios', () => {
    expect(canonicalizar({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });
  it('el mismo contenido en otro orden da el mismo texto', () => {
    expect(canonicalizar({ x: { z: 1, y: [1, 2] }, w: 'a' })).toBe(canonicalizar({ w: 'a', x: { y: [1, 2], z: 1 } }));
  });
  it('respeta los valores: null, texto con comillas y tildes, números, booleanos y el orden de las listas', () => {
    expect(canonicalizar({ a: null, b: 'él dijo "sí"', c: 1.5, d: false })).toBe('{"a":null,"b":"él dijo \\"sí\\"","c":1.5,"d":false}');
    expect(canonicalizar([2, 1])).not.toBe(canonicalizar([1, 2]));
  });
  it('un valor undefined cuenta como ausente (en un objeto) o null (en una lista)', () => {
    expect(canonicalizar({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalizar([1, undefined])).toBe('[1,null]');
  });
});

describe('hashInforme (criterio 1: SHA-256 del contenido, la firma y las fotos)', () => {
  const base = (): ContenidoSellado => ({
    id: 'i1', consorcioId: 'c1', usuario: 'rt1', requiereRevision: false, horaDispositivo: '2026-11-17T13:00:00.000Z', horaServidor: '2026-11-17T13:00:05.000Z',
    equipos: [{ maquinaId: 'm1', referenciaAgc: 'M1', tipo: 'traccion', estadoEquipo: 'en_uso', respuestas: {}, observaciones: { cabina: 'ok' }, fotos: { f1: { dataUrl: JPG } } }],
    firma: { nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', dni: null, imagen: PNG, trazos: [[[10, 10], [20, 20]]] }, sinFirma: null,
  });

  it('es el SHA-256 en hexadecimal (64 caracteres) del JSON canónico', () => {
    const h = hashInforme(base());

    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(sha(canonicalizar(base())));
  });
  it('vector conocido: el SHA-256 de {"a":1} es 015abd7f…', () => {
    expect(sha('{"a":1}')).toBe('015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
    expect(hashInforme({ a: 1 } as unknown as ContenidoSellado)).toBe('015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
  });
  it('es determinista y no depende del orden de las claves', () => {
    const a = base();
    const reordenado = { sinFirma: a.sinFirma, firma: a.firma, equipos: a.equipos, horaServidor: a.horaServidor, horaDispositivo: a.horaDispositivo, requiereRevision: a.requiereRevision, usuario: a.usuario, consorcioId: a.consorcioId, id: a.id };

    expect(hashInforme(a)).toBe(hashInforme(base()));
    expect(hashInforme(reordenado)).toBe(hashInforme(a));
  });
  it.each([
    ['una foto', (c: ContenidoSellado) => { (c.equipos[0].fotos.f1 as { dataUrl: string }).dataUrl = JPG + 'A'; }],
    ['la imagen de la firma', (c: ContenidoSellado) => { c.firma!.imagen = PNG + 'A'; }],
    ['un trazo de la firma', (c: ContenidoSellado) => { c.firma!.trazos[0][0][0] = 11; }],
    ['el nombre del firmante', (c: ContenidoSellado) => { c.firma!.nombre = 'Carla'; }],
    ['una observación', (c: ContenidoSellado) => { c.equipos[0].observaciones.cabina = 'otra'; }],
    ['una respuesta', (c: ContenidoSellado) => { c.equipos[0].respuestas = { cabina: { a: 'mal' } }; }],
    ['el estado de un equipo', (c: ContenidoSellado) => { c.equipos[0].estadoEquipo = 'fuera_de_servicio'; }],
    ['la hora del dispositivo', (c: ContenidoSellado) => { c.horaDispositivo = '2026-11-17T13:00:01.000Z'; }],
    ['la hora del servidor', (c: ContenidoSellado) => { c.horaServidor = '2026-11-17T13:00:06.000Z'; }],
    ['el usuario', (c: ContenidoSellado) => { c.usuario = 'rt2'; }],
    ['el edificio', (c: ContenidoSellado) => { c.consorcioId = 'c2'; }],
    ['el id', (c: ContenidoSellado) => { c.id = 'i2'; }],
    ['quitar un equipo', (c: ContenidoSellado) => { c.equipos = []; }],
    ['pasar a «Sin firma»', (c: ContenidoSellado) => { c.firma = null; c.sinFirma = { motivo: 'El encargado no está', foto: JPG }; c.requiereRevision = true; }],
  ])('cambiar %s cambia el hash', (_n, cambiar) => {
    const c = base();
    cambiar(c);

    expect(hashInforme(c)).not.toBe(hashInforme(base()));
  });
  it('contenidoSellado quita el hash y su versión y deja todo lo demás', () => {
    const i = { ...base(), hashSha256: 'x', versionHash: 'v' };

    expect(contenidoSellado(i)).toEqual(base());
  });
});

describe('InformesService: cerrar, verificar y rechazar modificaciones (HU-18 RNF-01)', () => {
  let repo: InMemoryInformesRepository;
  let service: InformesService;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
    jest.setSystemTime(new Date('2026-11-17T13:00:05.000Z'));
    repo = new InMemoryInformesRepository();
    repo.edificios.add('c1');
    service = new InformesService(repo);
  });
  afterEach(() => jest.useRealTimers());

  describe('criterios 1 y 2: al cerrar se sella con el hash y se guardan las dos horas', () => {
    it('guarda el hash SHA-256 del informe completo, la versión del cálculo y las horas del dispositivo y del servidor', async () => {
      const i = await service.crear(cuerpo(), 'rt1');

      expect(i.hashSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(i.versionHash).toBe(VERSION_HASH);
      expect(i.horaDispositivo).toBe('2026-11-17T13:00:00.000Z');
      expect(i.horaServidor).toBe('2026-11-17T13:00:05.000Z'); // la fija la API, no el celular
      expect(i.hashSha256).toBe(sha(canonicalizar(contenidoSellado(i))));
      expect(repo.informes[0].hashSha256).toBe(i.hashSha256);
    });
    it('la hora del servidor es la de la API aunque el celular mande otra en cualquier campo', async () => {
      const i = await service.crear(cuerpo({ horaServidor: '2020-01-01T00:00:00Z' }), 'rt1');

      expect(i.horaServidor).toBe('2026-11-17T13:00:05.000Z');
    });
    it('el hash incluye la hora del servidor: el mismo cuerpo cerrado en otro momento da otro hash', async () => {
      const a = await service.crear(cuerpo(), 'rt1');
      jest.setSystemTime(new Date('2026-11-17T13:00:06.000Z'));
      const b = await service.crear(cuerpo(), 'rt1');

      expect(a.hashSha256).not.toBe(b.hashSha256);
    });
    it('el hash incluye las fotos: cambiar una foto del cuerpo cambia el sello', async () => {
      const a = await service.crear(cuerpo(), 'rt1');
      const otro = cuerpo();
      (otro.equipos[0].fotos.f1 as { dataUrl: string }).dataUrl = JPG + 'AAAA';
      jest.setSystemTime(new Date('2026-11-17T13:00:05.000Z')); // misma hora, mismo id no: el id es único
      const b = await service.crear(otro, 'rt1');

      expect(b.hashSha256).not.toBe(a.hashSha256);
    });
    it('el listado trae el hash (sin la firma ni las fotos)', async () => {
      const i = await service.crear(cuerpo(), 'rt1');

      const [r] = await service.listar();

      expect(r.hashSha256).toBe(i.hashSha256);
      expect(JSON.stringify(r)).not.toContain('data:image');
    });
  });

  describe('criterio 4: la verificación comprueba que el hash coincide y lo asienta en la auditoría', () => {
    it('un informe intacto coincide: queda asentado quién verificó, cuándo y los dos hashes', async () => {
      const i = await service.crear(cuerpo(), 'rt1');
      jest.setSystemTime(new Date('2026-11-18T09:00:00.000Z'));

      const v = await service.verificar(i.id, { usuario: 'sec1', rol: 'secretaria' });

      expect(v).toMatchObject({ informeId: i.id, usuario: 'sec1', rol: 'secretaria', coincide: true, hashGuardado: i.hashSha256, hashCalculado: i.hashSha256, verificadoEn: '2026-11-18T09:00:00.000Z' });
      expect((await service.auditoria(i.id)).verificaciones).toEqual([v]);
    });
    it.each([
      ['una foto', (r: InMemoryInformesRepository) => { (r.informes[0].equipos[0].fotos.f1 as { dataUrl: string }).dataUrl = JPG + 'X'; }],
      ['la firma', (r: InMemoryInformesRepository) => { r.informes[0].firma!.imagen = PNG + 'X'; }],
      ['una observación', (r: InMemoryInformesRepository) => { r.informes[0].equipos[0].observaciones.cabina = 'Alterada'; }],
      ['la hora del servidor', (r: InMemoryInformesRepository) => { r.informes[0].horaServidor = '2026-11-17T13:00:06.000Z'; }],
    ])('si alguien altera %s en la base la verificación NO coincide y lo informa', async (_n, alterar) => {
      const i = await service.crear(cuerpo(), 'rt1');
      alterar(repo);

      const v = await service.verificar(i.id, { usuario: 'admin1', rol: 'administrador' });

      expect(v.coincide).toBe(false);
      expect(v.hashGuardado).toBe(i.hashSha256);
      expect(v.hashCalculado).not.toBe(i.hashSha256);
    });
    it('un informe anterior al sellado (sin hash) no coincide', async () => {
      const i = await service.crear(cuerpo(), 'rt1');
      repo.informes[0].hashSha256 = null;

      const v = await service.verificar(i.id, { usuario: 'sec1', rol: 'secretaria' });

      expect(v).toMatchObject({ coincide: false, hashGuardado: null });
    });
    it('cada verificación queda registrada, también las repetidas, en orden', async () => {
      const i = await service.crear(cuerpo(), 'rt1');
      await service.verificar(i.id, { usuario: 'sec1', rol: 'secretaria' });
      repo.informes[0].equipos[0].observaciones.cabina = 'Alterada';
      await service.verificar(i.id, { usuario: 'admin1', rol: 'administrador' });

      const a = await service.auditoria(i.id);

      expect(a.verificaciones.map((v) => [v.usuario, v.coincide])).toEqual([['sec1', true], ['admin1', false]]);
    });
    it('un informe que no existe → 404 al verificar y al pedir la auditoría', async () => {
      await expect(service.verificar('nada', { usuario: 'sec1', rol: 'secretaria' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.auditoria('nada')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('criterio 3: un informe cerrado no se modifica: 409 y queda registrado', () => {
    it.each(['PUT', 'PATCH', 'DELETE'])('un %s → 409 con el motivo y queda el intento (quién, rol, método y cuándo)', async (metodo) => {
      const i = await service.crear(cuerpo(), 'rt1');
      jest.setSystemTime(new Date('2026-11-18T10:00:00.000Z'));

      await expect(service.rechazarModificacion(i.id, { usuario: 'rt1', rol: 'rt_calle' }, metodo.toLowerCase())).rejects.toThrow(MENSAJE_INFORME_CERRADO);

      expect((await service.auditoria(i.id)).intentosModificacion).toEqual([expect.objectContaining({ informeId: i.id, usuario: 'rt1', rol: 'rt_calle', metodo, fecha: '2026-11-18T10:00:00.000Z' })]);
    });
    it('responde 409 (no 404 ni 403) y el informe no cambia', async () => {
      const i = await service.crear(cuerpo(), 'rt1');
      const antes = JSON.stringify(repo.informes[0]);

      await expect(service.rechazarModificacion(i.id, { usuario: 'sec1', rol: 'secretaria' }, 'PUT')).rejects.toBeInstanceOf(ConflictException);

      expect(JSON.stringify(repo.informes[0])).toBe(antes);
      expect((await service.verificar(i.id, { usuario: 'sec1', rol: 'secretaria' })).coincide).toBe(true);
    });
    it('los intentos se acumulan, de distintos usuarios', async () => {
      const i = await service.crear(cuerpo(), 'rt1');
      await service.rechazarModificacion(i.id, { usuario: 'rt1', rol: 'rt_calle' }, 'PATCH').catch(() => undefined);
      await service.rechazarModificacion(i.id, { usuario: 'admin1', rol: 'administrador' }, 'DELETE').catch(() => undefined);

      expect((await service.auditoria(i.id)).intentosModificacion.map((x) => [x.usuario, x.metodo])).toEqual([['rt1', 'PATCH'], ['admin1', 'DELETE']]);
    });
    it('un informe que no existe → 404 y no se registra nada', async () => {
      await expect(service.rechazarModificacion('nada', { usuario: 'rt1', rol: 'rt_calle' }, 'PUT')).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.intentos).toHaveLength(0);
    });
  });
});

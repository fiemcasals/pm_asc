import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConsorciosRepository, ReferenciaAgcDuplicadaError } from '../src/consorcios/consorcios.repository';
import { InMemoryConsorciosRepository, createTestApp, fakeDatabase } from './create-test-app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const consorcio = {
  nombre: 'Consorcio Av. Rivadavia 1234',
  direccion: 'Av. Rivadavia 1234, CABA',
  administracion: { nombre: 'Administración Pérez', telefono: '11 4444-5555', email: 'admin@perez.com' },
  maquinas: [
    { referenciaAgc: 'M1', descripcion: 'Derecha' },
    { referenciaAgc: 'M2', descripcion: 'Izquierda' },
  ],
};

describe('/api/consorcios', () => {
  let app: INestApplication;
  let repo: InMemoryConsorciosRepository;

  beforeEach(async () => {
    repo = new InMemoryConsorciosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), repo));
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  describe('POST /api/consorcios — criterio 1', () => {
    it('registra un consorcio con sus máquinas y referencias AGC y devuelve 201 con la ficha', async () => {
      const res = await http().post('/api/consorcios').send(consorcio);

      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(UUID);
      expect(res.body).toMatchObject({
        nombre: consorcio.nombre,
        direccion: consorcio.direccion,
        administracion: consorcio.administracion,
      });
      expect(res.body.maquinas).toHaveLength(2);
      expect(res.body.maquinas.map((m: { referenciaAgc: string }) => m.referenciaAgc)).toEqual(['M1', 'M2']);
      expect(res.body.maquinas[0]).toMatchObject({ referenciaAgc: 'M1', descripcion: 'Derecha' });
      expect(res.body.maquinas[0].id).toMatch(UUID);
      expect(repo.filas.size).toBe(1);
    });

    it('acepta un consorcio sin máquinas ni administración', async () => {
      const res = await http().post('/api/consorcios').send({ nombre: 'Edificio Sur', direccion: 'Calle 1' });

      expect(res.status).toBe(201);
      expect(res.body.maquinas).toEqual([]);
      expect(res.body.administracion).toEqual({ nombre: null, telefono: null, email: null });
    });

    it('rechaza con 400 y la lista de errores un cuerpo inválido, sin guardar nada', async () => {
      const res = await http().post('/api/consorcios').send({ nombre: '', maquinas: [{ referenciaAgc: 'M1' }, { referenciaAgc: 'M1' }] });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Datos inválidos');
      expect(res.body.errores).toEqual(
        expect.arrayContaining(['nombre es obligatorio', 'direccion es obligatorio']),
      );
      expect(repo.filas.size).toBe(0);
    });

    it('rechaza con 400 un cuerpo que no es JSON de objeto', async () => {
      const res = await http().post('/api/consorcios').send('hola').set('Content-Type', 'text/plain');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/consorcios/:id — criterio 2', () => {
    it('devuelve la ficha completa: dirección, administración y máquinas', async () => {
      const creado = await http().post('/api/consorcios').send(consorcio);

      const res = await http().get(`/api/consorcios/${creado.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(creado.body);
      expect(res.body.direccion).toBe('Av. Rivadavia 1234, CABA');
      expect(res.body.administracion.email).toBe('admin@perez.com');
      expect(res.body.maquinas).toHaveLength(2);
    });

    it('responde 404 si el consorcio no existe', async () => {
      const res = await http().get(`/api/consorcios/${INEXISTENTE}`);
      expect(res.status).toBe(404);
    });

    it('responde 404 (no 500) si el id no tiene formato de UUID', async () => {
      const res = await http().get('/api/consorcios/no-es-un-uuid');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/consorcios', () => {
    it('lista los consorcios con la cantidad de máquinas', async () => {
      await http().post('/api/consorcios').send(consorcio);
      await http().post('/api/consorcios').send({ nombre: 'Edificio Sur', direccion: 'Calle 1' });

      const res = await http().get('/api/consorcios');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.map((c: { cantidadMaquinas: number }) => c.cantidadMaquinas).sort()).toEqual([0, 2]);
      expect(res.body[0]).toEqual({
        id: expect.stringMatching(UUID),
        nombre: expect.any(String),
        direccion: expect.any(String),
        cantidadMaquinas: expect.any(Number),
      });
    });

    it('devuelve una lista vacía si no hay consorcios', async () => {
      const res = await http().get('/api/consorcios');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('GET /api/consorcios/mapa excluye consorcios sin ubicacion', async () => {
      await http().post('/api/consorcios').send({
        ...consorcio,
        nombre: 'Con Mapa',
        ubicacion: { latitud: -34.6118, longitud: -58.396 },
      });
      await http().post('/api/consorcios').send({ nombre: 'Sin Mapa', direccion: 'Calle 2' });

      const res = await http().get('/api/consorcios/mapa');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        nombre: 'Con Mapa',
        ubicacion: { latitud: -34.6118, longitud: -58.396 },
        cantidadMaquinas: 2,
      });
    });
  });

  describe('PUT /api/consorcios/:id', () => {
    it('reemplaza los datos y la lista completa de máquinas', async () => {
      const creado = await http().post('/api/consorcios').send(consorcio);

      const res = await http()
        .put(`/api/consorcios/${creado.body.id}`)
        .send({ nombre: 'Nuevo nombre', direccion: 'Otra 99', maquinas: [{ referenciaAgc: 'm3', descripcion: 'Centro' }] });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(creado.body.id);
      expect(res.body.nombre).toBe('Nuevo nombre');
      expect(res.body.maquinas).toHaveLength(1);
      expect(res.body.maquinas[0]).toMatchObject({ referenciaAgc: 'M3', descripcion: 'Centro' });
      expect(res.body.createdAt).toBe(creado.body.createdAt);

      const ficha = await http().get(`/api/consorcios/${creado.body.id}`);
      expect(ficha.body.maquinas).toHaveLength(1);
    });

    it('responde 404 si no existe y 400 si el cuerpo es inválido', async () => {
      expect((await http().put(`/api/consorcios/${INEXISTENTE}`).send(consorcio)).status).toBe(404);
      const creado = await http().post('/api/consorcios').send(consorcio);
      expect((await http().put(`/api/consorcios/${creado.body.id}`).send({})).status).toBe(400);
    });
  });

  describe('DELETE /api/consorcios/:id', () => {
    it('borra el consorcio: 204 y después 404', async () => {
      const creado = await http().post('/api/consorcios').send(consorcio);

      const res = await http().delete(`/api/consorcios/${creado.body.id}`);
      expect(res.status).toBe(204);
      expect(res.body).toEqual({});

      expect((await http().get(`/api/consorcios/${creado.body.id}`)).status).toBe(404);
      expect((await http().delete(`/api/consorcios/${creado.body.id}`)).status).toBe(404);
    });
  });

  describe('referencia AGC repetida detectada por la base', () => {
    it('se traduce a 409 y no a 500', async () => {
      const conflictiva: ConsorciosRepository = Object.assign(new InMemoryConsorciosRepository(), {
        crear: async () => {
          throw new ReferenciaAgcDuplicadaError();
        },
      });
      await app.close();
      ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), conflictiva));

      const res = await http().post('/api/consorcios').send(consorcio);

      expect(res.status).toBe(409);
    });
  });
});

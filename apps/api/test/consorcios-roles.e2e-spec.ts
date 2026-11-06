import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryConsorciosRepository, createTestApp, fakeDatabase } from './create-test-app';

const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const terna = {
  rtCalle: { nombre: 'Laura Gómez', telefono: '11 4000-1000', email: 'laura@maicon.test' },
  firmante: { nombre: 'Ing. Pablo Ruiz', telefono: '11 4000-2000' },
  eca: { nombre: 'Conservación Porteña S.R.L.', email: 'contacto@portena.test' },
};

describe('/api/consorcios/:id/roles', () => {
  let app: INestApplication;
  let repo: InMemoryConsorciosRepository;
  let id: string;

  beforeEach(async () => {
    repo = new InMemoryConsorciosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), repo));
    ({ id } = await repo.crear({
      nombre: 'Consorcio Roles',
      direccion: 'Calle 1',
      administracion: { nombre: null, telefono: null, email: null },
      maquinas: [],
    }));
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  describe('PUT — condición 1: guarda y valida la terna', () => {
    it('guarda la terna y devuelve 200 con los tres roles', async () => {
      const res = await http().put(`/api/consorcios/${id}/roles`).send(terna);

      expect(res.status).toBe(200);
      expect(res.body.consorcioId).toBe(id);
      expect(res.body.rtCalle.nombre).toBe('Laura Gómez');
      expect(res.body.firmante.nombre).toBe('Ing. Pablo Ruiz');
      expect(res.body.eca.nombre).toBe('Conservación Porteña S.R.L.');
      expect(repo.roles.size).toBe(1);
    });

    it('reasignar reemplaza la terna completa', async () => {
      await http().put(`/api/consorcios/${id}/roles`).send(terna);

      const res = await http()
        .put(`/api/consorcios/${id}/roles`)
        .send({ ...terna, rtCalle: { nombre: 'Otro RT', telefono: '11 4000-3000' } });

      expect(res.status).toBe(200);
      expect(res.body.rtCalle).toMatchObject({ nombre: 'Otro RT', telefono: '11 4000-3000', email: null });
      expect(repo.roles.size).toBe(1);
    });

    it('rechaza con 400 una terna incompleta y lista todos los errores, sin guardar nada', async () => {
      const res = await http().put(`/api/consorcios/${id}/roles`).send({ rtCalle: { nombre: '' } });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Datos inválidos');
      expect(res.body.errores).toEqual([
        'rtCalle.nombre es obligatorio',
        'rtCalle necesita al menos un dato de contacto (telefono o email)',
        'firmante es obligatorio',
        'eca es obligatorio',
      ]);
      expect(repo.roles.size).toBe(0);
    });

    it('rechaza con 400 un responsable sin contacto y un email mal formado', async () => {
      const res = await http()
        .put(`/api/consorcios/${id}/roles`)
        .send({
          ...terna,
          firmante: { nombre: 'Sin contacto', telefono: '   ' },
          eca: { nombre: 'ECA', email: 'no-es-email' },
        });

      expect(res.status).toBe(400);
      expect(res.body.errores).toEqual([
        'firmante necesita al menos un dato de contacto (telefono o email)',
        'eca.email no es un email válido',
      ]);
    });

    it('rechaza con 400 un cuerpo que no es un objeto', async () => {
      const res = await http().put(`/api/consorcios/${id}/roles`).send([terna]);

      expect(res.status).toBe(400);
      expect(res.body.errores).toEqual(['El cuerpo tiene que ser un objeto JSON']);
    });

    it('devuelve 404 si el consorcio no existe o el id está mal formado', async () => {
      expect((await http().put(`/api/consorcios/${INEXISTENTE}/roles`).send(terna)).status).toBe(404);
      expect((await http().put('/api/consorcios/no-es-uuid/roles').send(terna)).status).toBe(404);
    });
  });

  describe('GET — condición 2: devuelve porcentajes y contacto', () => {
    it('devuelve los porcentajes operativos y los datos de contacto de cada responsable', async () => {
      await http().put(`/api/consorcios/${id}/roles`).send(terna);

      const res = await http().get(`/api/consorcios/${id}/roles`);

      expect(res.status).toBe(200);
      expect(res.body.rtCalle).toEqual({
        nombre: 'Laura Gómez',
        telefono: '11 4000-1000',
        email: 'laura@maicon.test',
        porcentaje: 60,
      });
      expect(res.body.firmante).toEqual({
        nombre: 'Ing. Pablo Ruiz',
        telefono: '11 4000-2000',
        email: null,
        porcentaje: 25,
      });
      expect(res.body.eca).toEqual({
        nombre: 'Conservación Porteña S.R.L.',
        telefono: null,
        email: 'contacto@portena.test',
        porcentaje: null,
      });
    });

    it('sin terna asignada devuelve 200 con los roles en null', async () => {
      const res = await http().get(`/api/consorcios/${id}/roles`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ consorcioId: id, rtCalle: null, firmante: null, eca: null, actualizadoEn: null });
    });

    it('devuelve 404 si el consorcio no existe', async () => {
      expect((await http().get(`/api/consorcios/${INEXISTENTE}/roles`)).status).toBe(404);
    });
  });
});

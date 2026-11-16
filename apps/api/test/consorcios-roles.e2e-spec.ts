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
      encargado: { nombre: null, telefono: null },
      pisos: [],
      ubicacion: null,
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
  describe('PUT — HU-02 RF-03: no pisa una terna más nueva', () => {
    const otraTerna = { ...terna, rtCalle: { nombre: 'Otro RT', telefono: '11 4000-3000' } };

    it('criterio 1: si la terna cambió después de leerla, responde 409 con la versión vigente y no modifica nada', async () => {
      const inicial = (await http().put(`/api/consorcios/${id}/roles`).send(terna)).body;
      await new Promise((r) => setTimeout(r, 5)); // otro instante
      const deOtraPersona = (await http().put(`/api/consorcios/${id}/roles`).send({ ...otraTerna, actualizadoEn: inicial.actualizadoEn })).body;
      expect(deOtraPersona.rtCalle.nombre).toBe('Otro RT');

      // La primera persona sigue con la versión que leyó (inicial) y guarda lo suyo.
      const res = await http()
        .put(`/api/consorcios/${id}/roles`)
        .send({ ...terna, rtCalle: { nombre: 'Pisaría al otro', telefono: '1' }, actualizadoEn: inicial.actualizadoEn });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('cambió');
      expect(res.body.vigente.rtCalle.nombre).toBe('Otro RT');
      expect(res.body.vigente.actualizadoEn).toBe(deOtraPersona.actualizadoEn);
      expect((await http().get(`/api/consorcios/${id}/roles`)).body.rtCalle.nombre).toBe('Otro RT'); // no se tocó
    });

    it('criterio 3: si la terna no cambió, guardar funciona igual que antes (con la versión leída, o sin ella)', async () => {
      const leida = (await http().get(`/api/consorcios/${id}/roles`)).body;
      expect(leida.actualizadoEn).toBeNull();

      const primera = await http().put(`/api/consorcios/${id}/roles`).send({ ...terna, actualizadoEn: null }); // leyó "sin terna"
      expect(primera.status).toBe(200);
      const segunda = await http().put(`/api/consorcios/${id}/roles`).send({ ...otraTerna, actualizadoEn: primera.body.actualizadoEn });
      expect(segunda.status).toBe(200);
      expect(segunda.body.rtCalle.nombre).toBe('Otro RT');
      const sinVersion = await http().put(`/api/consorcios/${id}/roles`).send(terna); // un cliente que no manda la versión
      expect(sinVersion.status).toBe(200);
    });

    it('leyó "sin terna" pero otra persona ya la asignó → 409 con la vigente', async () => {
      await http().put(`/api/consorcios/${id}/roles`).send(terna);

      const res = await http().put(`/api/consorcios/${id}/roles`).send({ ...otraTerna, actualizadoEn: null });

      expect(res.status).toBe(409);
      expect(res.body.vigente.rtCalle.nombre).toBe('Laura Gómez');
    });

    it('un actualizadoEn que no es un instante ni null → 400 y no guarda', async () => {
      const res = await http().put(`/api/consorcios/${id}/roles`).send({ ...terna, actualizadoEn: 'ayer' });

      expect(res.status).toBe(400);
      expect(res.body.errores[0]).toContain('actualizadoEn');
      expect(repo.roles.size).toBe(0);
    });
  });

  describe('GET /api/consorcios/roles — HU-02 RNF-01: todas las ternas en una sola llamada', () => {
    const nuevo = (nombre: string) =>
      repo.crear({
        nombre,
        direccion: 'Calle 2',
        administracion: { nombre: null, telefono: null, email: null },
        encargado: { nombre: null, telefono: null },
        pisos: [],
        ubicacion: null,
        maquinas: [],
      });

    it('criterio 1: devuelve la terna de cada edificio (con la terna o con los roles en null) y no se confunde con un id', async () => {
      const b = await nuevo('Edificio B');
      await http().put(`/api/consorcios/${id}/roles`).send(terna);

      const res = await http().get('/api/consorcios/roles');

      expect(res.status).toBe(200);
      expect(res.body.map((r: { consorcioId: string }) => r.consorcioId)).toEqual([id, b.id]); // por nombre: "Consorcio Roles" antes que "Edificio B"
      const conTerna = res.body.find((r: { consorcioId: string }) => r.consorcioId === id);
      const sinTerna = res.body.find((r: { consorcioId: string }) => r.consorcioId === b.id);
      expect(conTerna.rtCalle.nombre).toBe('Laura Gómez');
      expect(sinTerna).toEqual({ consorcioId: b.id, rtCalle: null, firmante: null, eca: null, actualizadoEn: null });
    });

    it('cada elemento es igual a lo que devuelve el GET de roles de ese edificio', async () => {
      await http().put(`/api/consorcios/${id}/roles`).send(terna);

      const todas = (await http().get('/api/consorcios/roles')).body;
      const una = (await http().get(`/api/consorcios/${id}/roles`)).body;

      expect(todas.find((r: { consorcioId: string }) => r.consorcioId === id)).toEqual(una);
    });

    it('sin edificios devuelve una lista vacía', async () => {
      repo.filas.clear();
      expect((await http().get('/api/consorcios/roles')).body).toEqual([]);
    });
  });

});

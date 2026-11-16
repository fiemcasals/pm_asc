import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real: requiere la base levantada con `npm run db:up` y el .env de la raíz.
loadEnvFileInto(process.env);

const terna = {
  rtCalle: { nombre: 'Laura Gómez', telefono: '11 4000-1000', email: 'laura@maicon.test' },
  firmante: { nombre: 'Ing. Pablo Ruiz', telefono: '11 4000-2000' },
  eca: { nombre: 'Conservación Porteña S.R.L.', email: 'contacto@portena.test' },
};

describe('Roles por edificio contra PostgreSQL + PostGIS real', () => {
  let app: INestApplication;
  let pool: Pool;
  let authToken = '';
  const creados: string[] = [];

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    const u = await asegurarUsuarioPrueba(pool, config, { usuario: 'roles_int_admin', rol: 'secretaria' });
    authToken = u.token;
  });

  afterAll(async () => {
    // Borra sólo lo que creó esta corrida.
    if (creados.length > 0) await pool.query('DELETE FROM consorcios WHERE id = ANY($1)', [creados]);
    await pool.query('DELETE FROM usuarios WHERE usuario = $1', ['roles_int_admin']);
    await app.close();
    await pool.end();
  });

  const http = () => {
    const req = request(app.getHttpServer());
    return {
      post: (url: string) => req.post(url).set('Authorization', `Bearer ${authToken}`),
      get: (url: string) => req.get(url).set('Authorization', `Bearer ${authToken}`),
      put: (url: string) => req.put(url).set('Authorization', `Bearer ${authToken}`),
      delete: (url: string) => req.delete(url).set('Authorization', `Bearer ${authToken}`),
    };
  };

  async function crearConsorcio(sufijo: string): Promise<string> {
    const res = await http()
      .post('/api/consorcios')
      .send({ nombre: `Int-roles ${sufijo}`, direccion: 'Calle 1', maquinas: [{ referenciaAgc: 'M1' }] });
    expect(res.status).toBe(201);
    creados.push(res.body.id);
    return res.body.id;
  }

  const filasDeRoles = async (id: string) =>
    (await pool.query('SELECT 1 FROM roles_edificio WHERE consorcio_id = $1', [id])).rowCount;

  it('guarda la terna y la devuelve con porcentajes y contacto al volver a leer', async () => {
    const id = await crearConsorcio('guardar');

    expect((await http().put(`/api/consorcios/${id}/roles`).send(terna)).status).toBe(200);

    const res = await http().get(`/api/consorcios/${id}/roles`);
    expect(res.status).toBe(200);
    expect(res.body.rtCalle).toEqual({ ...terna.rtCalle, porcentaje: 60 });
    expect(res.body.firmante).toEqual({ ...terna.firmante, email: null, porcentaje: 25 });
    expect(res.body.eca).toEqual({ ...terna.eca, telefono: null, porcentaje: null });
    expect(new Date(res.body.actualizadoEn).toISOString()).toBe(res.body.actualizadoEn);
  });

  it('reasignar deja una sola fila con los datos nuevos', async () => {
    const id = await crearConsorcio('reasignar');
    await http().put(`/api/consorcios/${id}/roles`).send(terna);

    await http()
      .put(`/api/consorcios/${id}/roles`)
      .send({ ...terna, firmante: { nombre: 'Nueva Firmante', email: 'nueva@maicon.test' } });

    expect(await filasDeRoles(id)).toBe(1);
    const res = await http().get(`/api/consorcios/${id}/roles`);
    expect(res.body.firmante).toEqual({
      nombre: 'Nueva Firmante',
      telefono: null,
      email: 'nueva@maicon.test',
      porcentaje: 25,
    });
  });

  it('editar la ficha del consorcio no toca la terna', async () => {
    const id = await crearConsorcio('ficha');
    await http().put(`/api/consorcios/${id}/roles`).send(terna);

    const put = await http()
      .put(`/api/consorcios/${id}`)
      .send({ nombre: 'Int-roles ficha editada', direccion: 'Calle 2', maquinas: [] });
    expect(put.status).toBe(200);

    expect((await http().get(`/api/consorcios/${id}/roles`)).body.rtCalle.nombre).toBe('Laura Gómez');
  });

  it('borrar el consorcio borra su terna', async () => {
    const id = await crearConsorcio('borrar');
    await http().put(`/api/consorcios/${id}/roles`).send(terna);
    expect(await filasDeRoles(id)).toBe(1);

    expect((await http().delete(`/api/consorcios/${id}`)).status).toBe(204);

    expect(await filasDeRoles(id)).toBe(0);
    expect((await http().get(`/api/consorcios/${id}/roles`)).status).toBe(404);
  });

  it('un carácter NUL responde 400 y no guarda la terna', async () => {
    const id = await crearConsorcio('nul');

    const res = await http()
      .put(`/api/consorcios/${id}/roles`)
      .send({ ...terna, eca: { nombre: 'ECA \u0000 rota', telefono: '11 4000-4000' } });

    expect(res.status).toBe(400);
    expect(await filasDeRoles(id)).toBe(0);
  });
  describe('HU-02 RF-03: no pisa una terna más nueva (PostgreSQL real)', () => {
    it('criterio 1: con la versión vieja responde 409 con la vigente y la terna no cambia; con la vigente guarda', async () => {
      const id = await crearConsorcio('version');
      const leida = (await http().put(`/api/consorcios/${id}/roles`).send({ ...terna, actualizadoEn: null })).body; // leyó "sin terna"
      const deOtraPersona = await http()
        .put(`/api/consorcios/${id}/roles`)
        .send({ ...terna, rtCalle: { nombre: 'RT de la otra persona', telefono: '11 1' }, actualizadoEn: leida.actualizadoEn });
      expect(deOtraPersona.status).toBe(200);

      const pisada = await http()
        .put(`/api/consorcios/${id}/roles`)
        .send({ ...terna, rtCalle: { nombre: 'Pisaría', telefono: '11 2' }, actualizadoEn: leida.actualizadoEn });

      expect(pisada.status).toBe(409);
      expect(pisada.body.vigente.rtCalle.nombre).toBe('RT de la otra persona');
      expect((await http().get(`/api/consorcios/${id}/roles`)).body.rtCalle.nombre).toBe('RT de la otra persona');

      const alDia = await http()
        .put(`/api/consorcios/${id}/roles`)
        .send({ ...terna, rtCalle: { nombre: 'Con la vigente', telefono: '11 3' }, actualizadoEn: pisada.body.vigente.actualizadoEn });
      expect(alDia.status).toBe(200);
    });

    it('una reasignación del semáforo también cuenta como cambio: quien tenía abierta la terna vieja recibe 409', async () => {
      const id = await crearConsorcio('reasignacion');
      const leida = (await http().put(`/api/consorcios/${id}/roles`).send(terna)).body;
      await new Promise((r) => setTimeout(r, 5));
      await pool.query('UPDATE roles_edificio SET rt_calle_nombre = $2, updated_at = now() WHERE consorcio_id = $1', [id, 'RT reasignado']);

      const res = await http().put(`/api/consorcios/${id}/roles`).send({ ...terna, actualizadoEn: leida.actualizadoEn });

      expect(res.status).toBe(409);
      expect(res.body.vigente.rtCalle.nombre).toBe('RT reasignado');
    });

    it('leyó "sin terna" y otra persona ya la asignó → 409; y sin la versión guarda como siempre', async () => {
      const id = await crearConsorcio('sinterna');
      await http().put(`/api/consorcios/${id}/roles`).send(terna);

      expect((await http().put(`/api/consorcios/${id}/roles`).send({ ...terna, actualizadoEn: null })).status).toBe(409);
      expect((await http().put(`/api/consorcios/${id}/roles`).send(terna)).status).toBe(200);
    });

    it('dos guardados simultáneos con la misma versión: uno gana y el otro recibe 409, nunca se pisan', async () => {
      const id = await crearConsorcio('carrera');
      const leida = (await http().put(`/api/consorcios/${id}/roles`).send(terna)).body;
      await new Promise((r) => setTimeout(r, 5));

      const [a, b] = await Promise.all(
        ['A', 'B'].map((n) =>
          http().put(`/api/consorcios/${id}/roles`).send({ ...terna, rtCalle: { nombre: `RT ${n}`, telefono: '11 9' }, actualizadoEn: leida.actualizadoEn }),
        ),
      );

      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const ganador = a.status === 200 ? 'RT A' : 'RT B';
      expect((await http().get(`/api/consorcios/${id}/roles`)).body.rtCalle.nombre).toBe(ganador);
    });
  });

});

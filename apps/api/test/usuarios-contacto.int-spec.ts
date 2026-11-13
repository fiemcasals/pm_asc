import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-02 RF-05): el teléfono y el email del RT de Calle viven en su usuario y la reasignación los copia
// a la terna del edificio. Requiere la base levantada con `npm run db:up` y DATABASE_URL, DATABASE_APP_PASSWORD y
// AUTH_JWT_SECRET (en el .env de la raíz o en el entorno).
loadEnvFileInto(process.env);

const P = 'RF05-int';
const FECHA_ROJO = '2026-11-25'; // un edificio sin inspecciones está en rojo

describe('Contacto del RT de Calle en su usuario y en la reasignación (HU-02 RF-05)', () => {
  let app: INestApplication;
  let admin: Pool;
  let tokenAdmin = '';
  let tokenSecretaria = '';
  const usuarios = { admin: `${P}-admin`, secretaria: `${P}-secretaria`, ana: `${P}-ana`, beto: `${P}-beto`, carla: `${P}-carla`, diego: `${P}-diego`, firmante: `${P}-firmante` };
  const idDe: Record<string, string> = {};
  const consorcios: string[] = [];

  beforeAll(async () => {
    const config = loadConfig();
    admin = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();

    tokenAdmin = (await asegurarUsuarioPrueba(admin, config, { usuario: usuarios.admin, rol: 'administrador' })).token;
    tokenSecretaria = (await asegurarUsuarioPrueba(admin, config, { usuario: usuarios.secretaria, rol: 'secretaria' })).token;
    for (const rt of [usuarios.ana, usuarios.beto, usuarios.carla, usuarios.diego]) {
      idDe[rt] = (await admin.query<{ id: string }>(
        `INSERT INTO usuarios (usuario, nombre, rol, password_hash) VALUES ($1, $1, 'rt_calle', 'sin-login') RETURNING id`,
        [rt],
      )).rows[0].id;
    }
    idDe[usuarios.firmante] = (await admin.query<{ id: string }>(
      `INSERT INTO usuarios (usuario, nombre, rol, password_hash) VALUES ($1, $1, 'firmante', 'sin-login') RETURNING id`,
      [usuarios.firmante],
    )).rows[0].id;
  });

  afterAll(async () => {
    if (consorcios.length > 0) await admin.query('DELETE FROM consorcios WHERE id = ANY($1::uuid[])', [consorcios]); // borra roles y registros
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM intentos_login WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await admin.end();
  });

  const http = () => request(app.getHttpServer());
  const comoAdmin = {
    get: (u: string) => http().get(u).set('Authorization', `Bearer ${tokenAdmin}`),
    put: (u: string) => http().put(u).set('Authorization', `Bearer ${tokenAdmin}`),
    post: (u: string) => http().post(u).set('Authorization', `Bearer ${tokenAdmin}`),
  };
  const contactoEnBase = async (usuario: string) =>
    (await admin.query('SELECT telefono, email FROM usuarios WHERE usuario = $1', [usuario])).rows[0];
  const cargar = (usuario: string, cuerpo: Record<string, unknown>) => comoAdmin.put(`/api/usuarios/${idDe[usuario]}/contacto`).send(cuerpo);

  /** Un edificio en rojo cuyo RT de Calle es `rt`, con la terna cargada a mano (con el contacto de ese RT). */
  async function edificioEnRojo(clave: string, rt: string): Promise<string> {
    const alta = await comoAdmin.post('/api/consorcios').send({ nombre: `${P} ${clave}`, direccion: `Calle ${clave}`, maquinas: [{ referenciaAgc: 'M1' }] });
    expect(alta.status).toBe(201);
    consorcios.push(alta.body.id);
    const roles = await comoAdmin.put(`/api/consorcios/${alta.body.id}/roles`).send({
      rtCalle: { nombre: rt, telefono: '11 0000-0000', email: 'viejo@rt.com' },
      firmante: { nombre: 'Firmante', email: 'f@f.com' },
      eca: { nombre: 'ECA', email: 'e@e.com' },
    });
    expect(roles.status).toBe(200);
    return alta.body.id;
  }
  const reasignar = (consorcioId: string, rtAnterior: string, rtNuevo: string) =>
    comoAdmin.post(`/api/semaforo/${consorcioId}/reasignacion`).send({ rtAnterior, rtNuevo, fecha: FECHA_ROJO });
  const terna = async (consorcioId: string) =>
    (await admin.query('SELECT rt_calle_nombre, rt_calle_telefono, rt_calle_email FROM roles_edificio WHERE consorcio_id = $1', [consorcioId])).rows[0];
  const registros = async (consorcioId: string) =>
    (await admin.query('SELECT rt_anterior, rt_nuevo FROM reasignaciones_rt WHERE consorcio_id = $1', [consorcioId])).rows;

  describe('el Administrador carga y edita el contacto del RT (criterio 1)', () => {
    it('lo guarda y lo devuelve al consultar al usuario', async () => {
      const res = await cargar(usuarios.ana, { telefono: '11 4444-0001', email: 'ana@rt.com' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: idDe[usuarios.ana], usuario: usuarios.ana, rol: 'rt_calle', telefono: '11 4444-0001', email: 'ana@rt.com' });
      expect(await contactoEnBase(usuarios.ana)).toEqual({ telefono: '11 4444-0001', email: 'ana@rt.com' });

      const consulta = await comoAdmin.get(`/api/usuarios/${idDe[usuarios.ana]}`);
      expect(consulta.status).toBe(200);
      expect(consulta.body).toMatchObject({ telefono: '11 4444-0001', email: 'ana@rt.com' });
      expect(consulta.body.passwordHash).toBeUndefined(); // el hash nunca sale por la API
    });

    it('lo edita, y vacío o null borra el dato', async () => {
      await cargar(usuarios.ana, { telefono: '11 4444-0001', email: 'ana@rt.com' });

      const editado = await cargar(usuarios.ana, { telefono: '  11 9999-0000  ', email: null });
      expect(editado.status).toBe(200);
      expect(editado.body).toMatchObject({ telefono: '11 9999-0000', email: null }); // sin espacios sobrantes
      expect(await contactoEnBase(usuarios.ana)).toEqual({ telefono: '11 9999-0000', email: null });

      const vacio = await cargar(usuarios.ana, { telefono: '', email: '' });
      expect(vacio.body).toMatchObject({ telefono: null, email: null });
    });

    it('rechaza un email inválido, un cuerpo sin campos y textos demasiado largos (400), sin cambiar lo guardado', async () => {
      await cargar(usuarios.beto, { telefono: '11 1111-0000', email: 'beto@rt.com' });

      const email = await cargar(usuarios.beto, { email: 'no-es-un-email' });
      expect(email.status).toBe(400);
      expect(JSON.stringify(email.body)).toContain('email no es un email válido');
      expect((await cargar(usuarios.beto, {})).status).toBe(400);
      expect((await cargar(usuarios.beto, { telefono: 'x'.repeat(51) })).status).toBe(400);
      expect((await cargar(usuarios.beto, { telefono: 12345 })).status).toBe(400);

      expect(await contactoEnBase(usuarios.beto)).toEqual({ telefono: '11 1111-0000', email: 'beto@rt.com' });
    });

    it('sólo se carga a usuarios rt_calle (409) y el usuario tiene que existir (404)', async () => {
      const firmante = await cargar(usuarios.firmante, { telefono: '11 2222-0000' });
      expect(firmante.status).toBe(409);
      expect(firmante.body.message).toContain('rt_calle');
      expect(await contactoEnBase(usuarios.firmante)).toEqual({ telefono: null, email: null });

      expect((await comoAdmin.put(`/api/usuarios/${randomUUID()}/contacto`).send({ telefono: '1' })).status).toBe(404);
      expect((await comoAdmin.get(`/api/usuarios/${randomUUID()}`)).status).toBe(404);
    });

    it('sólo el Administrador: la Secretaría recibe 403 y sin sesión 401', async () => {
      const url = `/api/usuarios/${idDe[usuarios.carla]}/contacto`;
      expect((await http().put(url).set('Authorization', `Bearer ${tokenSecretaria}`).send({ telefono: '1' })).status).toBe(403);
      expect((await http().get(`/api/usuarios/${idDe[usuarios.carla]}`).set('Authorization', `Bearer ${tokenSecretaria}`)).status).toBe(403);
      expect((await http().put(url).send({ telefono: '1' })).status).toBe(401);
      expect(await contactoEnBase(usuarios.carla)).toEqual({ telefono: null, email: null });
    });

    it('el contacto no viaja en la sesión del propio usuario', async () => {
      const yo = await http().get('/api/auth/me').set('Authorization', `Bearer ${tokenAdmin}`);
      expect(yo.status).toBe(200);
      expect(Object.keys(yo.body)).not.toContain('telefono');
      expect(Object.keys(yo.body)).not.toContain('email');
    });
  });

  describe('al reasignar, la terna toma el contacto del RT nuevo (criterios 2, 3 y 4)', () => {
    it('criterio 2: queda con el teléfono y el email del RT nuevo, no con los del anterior', async () => {
      await cargar(usuarios.beto, { telefono: '11 1111-0000', email: 'beto@rt.com' });
      const id = await edificioEnRojo('c2', usuarios.ana);

      const res = await reasignar(id, usuarios.ana, usuarios.beto);

      expect(res.status).toBe(201);
      expect(await terna(id)).toEqual({ rt_calle_nombre: usuarios.beto, rt_calle_telefono: '11 1111-0000', rt_calle_email: 'beto@rt.com' });
    });

    it('con un RT nuevo que sólo tiene email, la terna queda con ese email y sin teléfono (no con el del anterior)', async () => {
      await cargar(usuarios.diego, { telefono: null, email: 'diego@rt.com' });
      const id = await edificioEnRojo('parcial', usuarios.ana);

      const res = await reasignar(id, usuarios.ana, usuarios.diego);

      expect(res.status).toBe(201);
      expect(await terna(id)).toEqual({ rt_calle_nombre: usuarios.diego, rt_calle_telefono: null, rt_calle_email: 'diego@rt.com' });
    });

    it('criterio 3: un RT nuevo sin teléfono ni email → 409 que lo dice, y no cambia nada (ni el RT, ni la terna, ni el registro)', async () => {
      await cargar(usuarios.carla, { telefono: null, email: null });
      const id = await edificioEnRojo('c3', usuarios.ana);
      const antes = await terna(id);

      const res = await reasignar(id, usuarios.ana, usuarios.carla);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain(usuarios.carla);
      expect(res.body.message).toContain('no tiene teléfono ni email');
      expect(await terna(id)).toEqual(antes);
      expect(await registros(id)).toHaveLength(0);
    });

    it('criterio 4: después de cargarle el contacto al RT, la misma reasignación sí se aplica y la terna nunca queda sin contacto', async () => {
      const id = await edificioEnRojo('c4', usuarios.ana);
      expect((await reasignar(id, usuarios.ana, usuarios.carla)).status).toBe(409); // carla sigue sin contacto

      expect((await cargar(usuarios.carla, { telefono: '11 3333-0000' })).status).toBe(200);
      const res = await reasignar(id, usuarios.ana, usuarios.carla);

      expect(res.status).toBe(201);
      const despues = await terna(id);
      expect(despues).toEqual({ rt_calle_nombre: usuarios.carla, rt_calle_telefono: '11 3333-0000', rt_calle_email: null });
      expect(despues.rt_calle_telefono || despues.rt_calle_email).toBeTruthy();
      expect(await registros(id)).toEqual([{ rt_anterior: usuarios.ana, rt_nuevo: usuarios.carla }]);
    });
  });
});

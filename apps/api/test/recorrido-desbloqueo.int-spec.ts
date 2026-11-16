import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { deriveAppDatabaseUrl } from '../src/database/database.service';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-07 RF-05): el recorrido del RT, el desbloqueo, el día entre visitas fallidas y el reinicio por visita exitosa,
// contra PostgreSQL de verdad. Requiere la base levantada con `npm run db:up`, DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET.
loadEnvFileInto(process.env);
process.env.VISITAS_FALLIDAS_MIN_DIAS = '1'; // la regla del cliente: acá se prueba con el mínimo real

const P = 'RF05v-int';

describe('Recorrido del RT, desbloqueo y días entre visitas fallidas contra PostgreSQL real (HU-07 RF-05)', () => {
  let app: INestApplication;
  let admin: Pool; // dueño de las tablas
  let appPool: Pool; // el rol sin privilegios que usa la API
  let tokenAdmin = '';
  let tokenSecretaria = '';
  let tokenRt = '';
  let consorcioId = '';
  let maquinaId = '';

  beforeAll(async () => {
    const config = loadConfig();
    expect(config.visitasFallidasMinDias).toBe(1);
    admin = new Pool({ connectionString: config.databaseUrl });
    appPool = new Pool({ connectionString: deriveAppDatabaseUrl(config.databaseUrl, config.databaseAppUrl, config.databaseAppPassword) });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    tokenAdmin = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-admin`, rol: 'administrador' })).token;
    tokenSecretaria = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-secretaria`, rol: 'secretaria' })).token;
    tokenRt = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-rt`, rol: 'rt_calle' })).token;

    const alta = await request(app.getHttpServer()).post('/api/consorcios').set('Authorization', `Bearer ${tokenAdmin}`).send({
      nombre: `${P} edificio`, direccion: 'Calle 1', maquinas: [{ referenciaAgc: 'M1' }],
    });
    expect(alta.status).toBe(201);
    consorcioId = alta.body.id;
    maquinaId = alta.body.maquinas[0].id;
    // El RT de Calle del edificio: es lo que le da acceso (RLS) a ver su recorrido.
    const roles = await request(app.getHttpServer()).put(`/api/consorcios/${consorcioId}/roles`).set('Authorization', `Bearer ${tokenAdmin}`).send({
      rtCalle: { nombre: `${P}-rt`, telefono: '11 1111-1111' },
      firmante: { nombre: 'Firmante', email: 'f@f.com' },
      eca: { nombre: 'ECA', email: 'e@e.com' },
    });
    expect(roles.status).toBe(200);
  });

  afterAll(async () => {
    if (consorcioId) {
      await admin.query('DELETE FROM desbloqueos_edificio WHERE consorcio_id = $1', [consorcioId]);
      await admin.query('DELETE FROM inspecciones_checklist WHERE consorcio_id = $1', [consorcioId]);
      await admin.query('DELETE FROM visitas_fallidas WHERE consorcio_id = $1', [consorcioId]);
      await admin.query('DELETE FROM consorcios WHERE id = $1', [consorcioId]);
    }
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await appPool.end();
    await admin.end();
  });

  const http = () => request(app.getHttpServer());
  const fallar = () =>
    http().post('/api/visitas-fallidas').set('Authorization', `Bearer ${tokenSecretaria}`).send({ consorcioId, fotoFrenteUrl: 'https://f/1.jpg', gps: { latitud: -34.6, longitud: -58.4 } });
  const recorrido = (token: string) => http().get('/api/recorrido').set('Authorization', `Bearer ${token}`);
  const idsDelRt = async () => (await recorrido(tokenRt)).body.map((e: { id: string }) => e.id) as string[];
  const filas = async () => Number((await admin.query('SELECT count(*) AS n FROM visitas_fallidas WHERE consorcio_id = $1', [consorcioId])).rows[0].n);
  /** Manda la última visita fallida N días al pasado: así se simulan los días sin esperar. */
  const retrasarUltima = (dias: number) =>
    admin.query(
      `UPDATE visitas_fallidas SET fecha_hora = fecha_hora - ($2 || ' days')::interval
        WHERE id = (SELECT id FROM visitas_fallidas WHERE consorcio_id = $1 ORDER BY orden DESC LIMIT 1)`,
      [consorcioId, String(dias)],
    );

  it('criterio 3: la segunda visita fallida del mismo día responde 409, no suma advertencia y no deja fila', async () => {
    const primera = await fallar();
    expect(primera.status).toBe(201);
    expect(primera.body.numeroAdvertencia).toBe(1);

    const repetida = await fallar();

    expect(repetida.status).toBe(409);
    expect(repetida.body.message).toContain('ya tiene una visita fallida de hoy');
    expect(await filas()).toBe(1);
  });

  it('con un día de separación se registran las advertencias 2 y 3, y el edificio queda bloqueado', async () => {
    await retrasarUltima(3);
    const segunda = await fallar();
    expect(segunda.status).toBe(201);
    await retrasarUltima(2);

    const tercera = await fallar();

    expect(tercera.body.numeroAdvertencia).toBe(3);
    expect(segunda.body.numeroAdvertencia).toBe(2);
    expect((await fallar()).status).toBe(409); // otra del mismo día: no
    expect(await filas()).toBe(3);
    expect((await http().get(`/api/visitas-fallidas/consorcio/${consorcioId}/bloqueo`).set('Authorization', `Bearer ${tokenSecretaria}`)).body.bloqueado).toBe(true);
  });

  it('criterio 1: el edificio bloqueado no aparece en el recorrido del RT (que ve su edificio por el RLS); la Secretaría lo ve marcado', async () => {
    expect(await idsDelRt()).not.toContain(consorcioId);

    const secretaria = (await recorrido(tokenSecretaria)).body.find((e: { id: string }) => e.id === consorcioId);
    expect(secretaria).toMatchObject({ nombre: `${P} edificio`, bloqueado: true });
  });

  it('criterio 2: la Secretaría desbloquea con motivo; queda registrado y el edificio vuelve al recorrido del RT', async () => {
    const sinMotivo = await http().post(`/api/visitas-fallidas/consorcio/${consorcioId}/desbloquear`).set('Authorization', `Bearer ${tokenSecretaria}`).send({ motivo: ' ' });
    expect(sinMotivo.status).toBe(400);
    expect((await http().post(`/api/visitas-fallidas/consorcio/${consorcioId}/desbloquear`).set('Authorization', `Bearer ${tokenRt}`).send({ motivo: 'x' })).status).toBe(403);

    const res = await http().post(`/api/visitas-fallidas/consorcio/${consorcioId}/desbloquear`).set('Authorization', `Bearer ${tokenSecretaria}`).send({ motivo: 'Se coordinó con el administrador' });

    expect(res.status).toBe(201);
    const registros = (await admin.query('SELECT usuario, motivo, fecha FROM desbloqueos_edificio WHERE consorcio_id = $1', [consorcioId])).rows;
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ usuario: `${P}-secretaria`, motivo: 'Se coordinó con el administrador' });
    expect(await idsDelRt()).toContain(consorcioId);
    expect((await http().post(`/api/visitas-fallidas/consorcio/${consorcioId}/desbloquear`).set('Authorization', `Bearer ${tokenSecretaria}`).send({ motivo: 'otra vez' })).status).toBe(409);
  });

  it('el registro de desbloqueos es de sólo lectura para la aplicación y sólo la Secretaría y el Administrador lo escriben (RLS)', async () => {
    const comoApp = async (rol: string, consulta: string, params: unknown[] = []) => {
      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.rol_actual', $1, true)", [rol]);
        const res = await client.query(consulta, params);
        await client.query('ROLLBACK');
        return res;
      } finally {
        client.release();
      }
    };
    expect((await comoApp('secretaria', 'SELECT id FROM desbloqueos_edificio WHERE consorcio_id = $1', [consorcioId])).rowCount).toBe(1);
    expect((await comoApp('secretaria', "UPDATE desbloqueos_edificio SET motivo = 'otro' WHERE consorcio_id = $1", [consorcioId])).rowCount).toBe(0);
    expect((await comoApp('secretaria', 'DELETE FROM desbloqueos_edificio WHERE consorcio_id = $1', [consorcioId])).rowCount).toBe(0);
    await expect(
      comoApp('rt_calle', `INSERT INTO desbloqueos_edificio (consorcio_id, hasta_visita_id, usuario, motivo) VALUES ($1, 'x', 'z', 'm')`, [consorcioId]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      admin.query(`INSERT INTO desbloqueos_edificio (consorcio_id, hasta_visita_id, usuario, motivo) VALUES ($1, 'y', 'z', '  ')`, [consorcioId]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('desbloquear no reinicia el contador: si el edificio falla de nuevo, vuelve a quedar bloqueado y fuera del recorrido', async () => {
    await retrasarUltima(1);

    const cuarta = await fallar();

    expect(cuarta.status).toBe(201);
    expect(cuarta.body.numeroAdvertencia).toBe(3);
    expect(await idsDelRt()).not.toContain(consorcioId);
  });

  it('criterio 4: una visita exitosa (inspección) reinicia el contador: el edificio vuelve al recorrido y la próxima falla es Advertencia 1', async () => {
    const inspeccion = await http().post('/api/checklist/inspecciones').set('Authorization', `Bearer ${tokenAdmin}`).send({
      consorcioId, maquinaId, referenciaAgc: 'M1', tipoMaquina: 'traccion', estadoEquipo: 'en_uso', datos: {},
    });
    expect(inspeccion.status).toBe(201);

    expect(await idsDelRt()).toContain(consorcioId);
    expect((await http().get(`/api/visitas-fallidas/consorcio/${consorcioId}`).set('Authorization', `Bearer ${tokenSecretaria}`)).body.totalAdvertencias).toBe(0);
    await retrasarUltima(1);
    const nueva = await fallar();
    expect(nueva.status).toBe(201);
    expect(nueva.body.numeroAdvertencia).toBe(1);
    expect(nueva.body.emailNotificacion).not.toBeNull();
  });
});

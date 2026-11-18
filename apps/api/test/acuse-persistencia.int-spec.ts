import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-10 RF-03): el acuse de recibo legal contra PostgreSQL de verdad. Requiere la
// base levantada con `npm run db:up` y DATABASE_URL (en el .env de la raíz o en el entorno).
// La condición de la base caída (criterios 1 y 4) no se automatiza acá: apagar la base es una
// prueba manual de QA (ver el documento de entrega).
// Desde HU-15 RF-02 el portal ECA pide sesión: el acuse queda a nombre del usuario ECA de la sesión.
loadEnvFileInto(process.env);

const PREFIJO = 'RF03-int';
const ECA_PORTENA = 'Conservación Porteña S.R.L.';
const ECA_MAICON = 'MAICON Mantenimiento';

describe('Acuse de recibo legal contra PostgreSQL + PostGIS real (HU-10 RF-03)', () => {
  let app: INestApplication;
  let pool: Pool;
  let warn: jest.SpyInstance;
  const sesion = { portena: { token: '', usuario: '' }, maicon: { token: '', usuario: '' } };

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    sesion.portena = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-eca-portena`, rol: 'eca', eca: ECA_PORTENA });
    sesion.maicon = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-eca-maicon`, rol: 'eca', eca: ECA_MAICON });
    // Las alertas pueden venir con un acuse de otra corrida: se parte de cero.
    await pool.query('DELETE FROM acuses_recibo_legal WHERE alerta_id = ANY($1)', [['ALT-CP-001', 'ALT-MAICON-001', 'ALT-MAICON-002']]);
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
  });

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  afterAll(async () => {
    await pool.query('DELETE FROM acuses_recibo_legal WHERE usuario LIKE $1', [`${PREFIJO}%`]);
    await pool.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${PREFIJO}%`]);
    await app.close();
    await pool.end();
  });

  const comoPortena = (r: request.Test) => r.set('Authorization', `Bearer ${sesion.portena.token}`);
  const comoMaicon = (r: request.Test) => r.set('Authorization', `Bearer ${sesion.maicon.token}`);
  const http = () => request(app.getHttpServer());
  const totalAcuses = async () => Number((await pool.query('SELECT count(*) AS n FROM acuses_recibo_legal')).rows[0].n);

  /** El acuse que la API informa para una alerta de la ECA de la sesión, o null si todavía no tiene. */
  async function acuseDe(alertaId: string, comoEca: 'portena' | 'maicon') {
    const pedir = comoEca === 'portena' ? comoPortena : comoMaicon;
    const res = await pedir(http().get('/api/eca/alertas')).expect(200);
    const item = res.body.alertas.find((a: { alerta: { id: string } }) => a.alerta.id === alertaId);
    return item.alerta.acuseRecibo ?? null;
  }

  it('criterio 3: con la base sana, POST responde 201 y deja 1 fila con la alerta y el usuario de la sesión', async () => {
    const res = await comoPortena(http().post('/api/eca/alertas/ALT-CP-001/acuse')).send({ usuario: `${PREFIJO}-del-cuerpo` });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    const filas = await pool.query('SELECT alerta_id, usuario, eca FROM acuses_recibo_legal WHERE alerta_id = $1', ['ALT-CP-001']);
    expect(filas.rowCount).toBe(1);
    expect(filas.rows[0]).toMatchObject({ alerta_id: 'ALT-CP-001', usuario: sesion.portena.usuario, eca: ECA_PORTENA }); // no el del cuerpo
    expect((await acuseDe('ALT-CP-001', 'portena'))?.usuario).toBe(sesion.portena.usuario);
  });

  it('un carácter NUL en el usuario del cuerpo ya no llega a la base: se ignora y el acuse queda a nombre de la sesión (201, sin NUL)', async () => {
    const antes = await totalAcuses();

    const res = await comoMaicon(http().post('/api/eca/alertas/ALT-MAICON-002/acuse')).send({ usuario: `${PREFIJO}\u0000nulo` });

    expect(res.status).toBe(201);
    expect(res.body.acuse.usuario).toBe(sesion.maicon.usuario);
    expect(await totalAcuses()).toBe(antes + 1);
    const guardado = (await pool.query('SELECT usuario FROM acuses_recibo_legal WHERE alerta_id = $1', ['ALT-MAICON-002'])).rows[0];
    expect(guardado.usuario).toBe(sesion.maicon.usuario);
    expect(guardado.usuario).not.toContain('\u0000');
    expect((await acuseDe('ALT-MAICON-002', 'maicon'))?.usuario).toBe(sesion.maicon.usuario);
  });

  it('el remito con un NUL en el parámetro usuario tampoco hace nada: se entrega y no cambia ni duplica el acuse', async () => {
    const antes = await totalAcuses();

    const res = await comoMaicon(http().get('/api/eca/remito/ALT-MAICON-002')).query({ usuario: `${PREFIJO}\u0000x` });

    expect(res.status).toBe(200);
    expect(res.body.acuseLegal.usuario).toBe(sesion.maicon.usuario);
    expect(await totalAcuses()).toBe(antes);
  });

  it('una alerta de otra ECA da 404 y no deja ningún acuse en la base', async () => {
    const antes = await totalAcuses();

    const remito = await comoMaicon(http().get('/api/eca/remito/ALT-CP-001'));
    const acuse = await comoMaicon(http().post('/api/eca/alertas/ALT-CP-001/acuse'));

    expect([remito.status, acuse.status]).toEqual([404, 404]);
    expect(await totalAcuses()).toBe(antes);
    expect((await pool.query('SELECT usuario FROM acuses_recibo_legal WHERE alerta_id = $1', ['ALT-CP-001'])).rows.map((f) => f.usuario)).toEqual([sesion.portena.usuario]);
  });
});

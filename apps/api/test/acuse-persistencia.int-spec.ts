import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';

// Integración real (HU-10 RF-03): el acuse de recibo legal contra PostgreSQL de verdad. Requiere la
// base levantada con `npm run db:up` y DATABASE_URL (en el .env de la raíz o en el entorno).
// La condición de la base caída (criterios 1 y 4) no se automatiza acá: apagar la base es una
// prueba manual de QA (ver el documento de entrega).
loadEnvFileInto(process.env);

const PREFIJO = 'RF03-int';

describe('Acuse de recibo legal contra PostgreSQL + PostGIS real (HU-10 RF-03)', () => {
  let app: INestApplication;
  let pool: Pool;
  let warn: jest.SpyInstance;

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
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
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());
  const totalAcuses = async () => Number((await pool.query('SELECT count(*) AS n FROM acuses_recibo_legal')).rows[0].n);

  /** El acuse que la API informa para una alerta, o null si todavía no tiene. */
  async function acuseDe(alertaId: string, eca: string) {
    const res = await http().get('/api/eca/alertas').query({ eca }).expect(200);
    const item = res.body.alertas.find((a: { alerta: { id: string } }) => a.alerta.id === alertaId);
    return item.alerta.acuseRecibo ?? null;
  }

  it('criterio 3: con la base sana, POST responde 201 y deja 1 fila con la alerta y el usuario', async () => {
    const usuario = `${PREFIJO}-valido`;

    const res = await http().post('/api/eca/alertas/ALT-CP-001/acuse').send({ usuario });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    const filas = await pool.query('SELECT alerta_id, usuario, eca FROM acuses_recibo_legal WHERE usuario = $1', [usuario]);
    expect(filas.rowCount).toBe(1);
    expect(filas.rows[0]).toMatchObject({ alerta_id: 'ALT-CP-001', usuario });
    expect((await acuseDe('ALT-CP-001', 'porteña'))?.usuario).toBe(usuario);
  });

  it('criterio 2: un NUL en usuario → 400, ninguna fila nueva y la alerta sigue sin acuse', async () => {
    const antes = await totalAcuses();

    const res = await http().post('/api/eca/alertas/ALT-MAICON-002/acuse').send({ usuario: `${PREFIJO}\u0000nulo` });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos inválidos');
    expect(JSON.stringify(res.body)).not.toMatch(/byte sequence|0x00|UTF8|22021/i);
    expect(await totalAcuses()).toBe(antes);
    expect(await acuseDe('ALT-MAICON-002', 'maicon')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SQLSTATE 22021'));
  });

  it('el remito con un NUL en usuario tampoco se entrega ni deja acuse (mismo camino)', async () => {
    const antes = await totalAcuses();

    const res = await http().get('/api/eca/remito/ALT-MAICON-002').query({ usuario: `${PREFIJO}\u0000x` });

    expect(res.status).toBe(400);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(await totalAcuses()).toBe(antes);
    expect(await acuseDe('ALT-MAICON-002', 'maicon')).toBeNull();
  });

  it('después de los rechazos, la misma alerta se puede acusar con un usuario válido', async () => {
    const usuario = `${PREFIJO}-reintento`;

    const res = await http().post('/api/eca/alertas/ALT-MAICON-002/acuse').send({ usuario });

    expect(res.status).toBe(201);
    expect((await pool.query('SELECT 1 FROM acuses_recibo_legal WHERE usuario = $1', [usuario])).rowCount).toBe(1);
    expect((await acuseDe('ALT-MAICON-002', 'maicon'))?.usuario).toBe(usuario);
  });
});

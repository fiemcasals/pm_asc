import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { CHECKLIST_VERSION } from '../src/checklist/checklist.config';
import { loadConfig } from '../src/config';
import { MIGRATIONS } from '../src/database/migrations';
import { loadEnvFileInto } from '../src/env-file';

loadEnvFileInto(process.env);

describe('Checklist configurable contra PostgreSQL real (int)', () => {
  let app: INestApplication;
  let pool: Pool;
  const creadas: string[] = [];

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
  });

  afterAll(async () => {
    if (creadas.length > 0) {
      await pool.query('DELETE FROM inspecciones_checklist WHERE id = ANY($1)', [creadas]);
    }
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  it('aplica la migración 010_checklist_inspecciones y persiste version_checklist en la tabla', async () => {
    const migs = await pool.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id');
    expect(migs.rows.map((m) => m.id)).toEqual(MIGRATIONS.map((m) => m.id));

    const res = await http().post('/api/checklist/inspecciones').send({
      consorcioId: '11111111-1111-4111-8111-111111111111',
      maquinaId: '22222222-2222-4222-8222-222222222222',
      referenciaAgc: 'M2',
      tipoMaquina: 'traccion',
      estadoEquipo: 'en_uso',
      datos: { cabina: { boton_pare: 'falla' } },
    });

    expect(res.status).toBe(201);
    creadas.push(res.body.id);

    const dbRow = await pool.query<{ version_checklist: string; referencia_agc: string }>(
      'SELECT version_checklist, referencia_agc FROM inspecciones_checklist WHERE id = $1',
      [res.body.id],
    );
    expect(dbRow.rows[0]).toEqual({
      version_checklist: CHECKLIST_VERSION,
      referencia_agc: 'M2',
    });
  });
});

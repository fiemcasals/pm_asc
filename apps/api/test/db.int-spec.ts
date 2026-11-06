import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';

// Integración real: requiere la base levantada con `npm run db:up` y el .env de la raíz.
loadEnvFileInto(process.env);

describe('GET /api/health contra PostgreSQL + PostGIS real', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const config = loadConfig();
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 e informa la versión de PostGIS', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.db.status).toBe('ok');
    expect(res.body.db.postgis).toMatch(/^3\.\d+\.\d+/);
  });
});

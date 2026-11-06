import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, fakeDatabase } from './create-test-app';

describe('GET /api/health', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('responde 200 con el estado de la API y de la base, incluida la versión de PostGIS', async () => {
    ({ app } = await createTestApp({ NODE_ENV: 'development' }));

    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', api: 'ok', db: { status: 'ok', postgis: '3.4.3' } });
  });

  it('responde 503 e informa el error de base si no hay conexión', async () => {
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase({ fail: true })));

    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.api).toBe('ok');
    expect(res.body.db).toMatchObject({ status: 'error', postgis: null });
  });

  it('las rutas cuelgan de /api: /health a secas no existe', async () => {
    ({ app } = await createTestApp({ NODE_ENV: 'development' }));

    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(404);
  });
});

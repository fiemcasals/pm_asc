import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app';

const SCRUM = 'https://scrum.nuestrocamino.cloud';
const AJENO = 'https://sitio-ajeno.example';

describe('CORS en desarrollo', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ NODE_ENV: 'development', CORS_ORIGINS: SCRUM }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('devuelve Access-Control-Allow-Origin con el origen de Scrum Master AI', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').set('Origin', SCRUM);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(SCRUM);
  });

  it('no devuelve Access-Control-Allow-Origin a otro origen', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').set('Origin', AJENO);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responde el preflight (OPTIONS) sólo para el origen de Scrum', async () => {
    const ok = await request(app.getHttpServer())
      .options('/api/health')
      .set('Origin', SCRUM)
      .set('Access-Control-Request-Method', 'GET');
    const ajeno = await request(app.getHttpServer())
      .options('/api/health')
      .set('Origin', AJENO)
      .set('Access-Control-Request-Method', 'GET');

    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe(SCRUM);
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('CORS en producción', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Aunque CORS_ORIGINS venga cargado, en producción no se aplica.
    ({ app } = await createTestApp({ NODE_ENV: 'production', CORS_ORIGINS: SCRUM }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('no devuelve ningún encabezado Access-Control-*', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').set('Origin', SCRUM);

    expect(res.status).toBe(200);
    const corsHeaders = Object.keys(res.headers).filter((h) => h.startsWith('access-control-'));
    expect(corsHeaders).toEqual([]);
  });
});

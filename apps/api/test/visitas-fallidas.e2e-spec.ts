import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app';

describe('VisitasFallidasController (e2e - HU-07 / RF-01)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testApp = await createTestApp(process.env);
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/visitas-fallidas', () => {
    it('responde 400 si falta foto del frente o GPS', async () => {
      const resSinFoto = await request(app.getHttpServer())
        .post('/api/visitas-fallidas')
        .send({
          consorcioId: 'consorcio-prueba-1',
          fotoFrenteUrl: '',
          gps: { latitud: -34.60, longitud: -58.38 },
        })
        .expect(400);

      expect(resSinFoto.body.message).toContain('fotografía del frente');

      const resSinGps = await request(app.getHttpServer())
        .post('/api/visitas-fallidas')
        .send({
          consorcioId: 'consorcio-prueba-1',
          fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente.jpg',
        })
        .expect(400);

      expect(resSinGps.body.message).toContain('coordenadas GPS');
    });

    it('responde 201 y valida visita fallida con Advertencia 1 y correo a la administración', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/visitas-fallidas')
        .send({
          consorcioId: 'consorcio-e2e-1',
          motivo: 'Encargado ausente sin respuesta al timbre',
          fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-e2e.jpg',
          gps: { latitud: -34.6037, longitud: -58.3816, precision: 3.5 },
          emailAdministracion: 'admin.e2e@consorcio.com.ar',
        })
        .expect(201);

      expect(res.body.id).toMatch(/^VF-/);
      expect(res.body.numeroAdvertencia).toBe(1);
      expect(res.body.fotoFrenteUrl).toBe('https://storage.maicon.com.ar/fotos/frente-e2e.jpg');
      expect(res.body.gps.latitud).toBe(-34.6037);
      expect(res.body.emailNotificacion).toBeDefined();
      expect(res.body.emailNotificacion.destinatario).toBe('admin.e2e@consorcio.com.ar');
      expect(res.body.emailNotificacion.asunto).toContain('Advertencia 1');
      expect(res.body.emailNotificacion.estado).toBe('enviado');
    });

    it('responde 201 con Advertencia 2 y reitera correo en la segunda visita fallida', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/visitas-fallidas')
        .send({
          consorcioId: 'consorcio-e2e-1',
          motivo: 'Segundo intento fallido: encargado ausente',
          fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-e2e-2.jpg',
          gps: { latitud: -34.6038, longitud: -58.3817 },
          emailAdministracion: 'admin.e2e@consorcio.com.ar',
        })
        .expect(201);

      expect(res.body.numeroAdvertencia).toBe(2);
      expect(res.body.emailNotificacion).toBeDefined();
      expect(res.body.emailNotificacion.asunto).toContain('Advertencia 2');
    });
  });

  describe('GET /api/visitas-fallidas/consorcio/:consorcioId', () => {
    it('responde 200 con el historial y total de advertencias acumuladas', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/visitas-fallidas/consorcio/consorcio-e2e-1')
        .expect(200);

      expect(res.body.consorcioId).toBe('consorcio-e2e-1');
      expect(res.body.totalAdvertencias).toBe(2);
      expect(res.body.ultimaAdvertencia).toBe(2);
      expect(res.body.bloqueadoPorTerceraVisita).toBe(false);
      expect(res.body.historial).toHaveLength(2);
    });
  });
});

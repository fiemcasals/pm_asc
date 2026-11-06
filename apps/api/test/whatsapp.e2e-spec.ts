import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app';

describe('WhatsAppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testApp = await createTestApp(process.env);
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/whatsapp/formatear', () => {
    it('responde 201 con la plantilla formal de alerta formateada', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/formatear')
        .send({
          nombreEca: 'MAICON Mantenimiento',
          consorcio: 'Consorcio Callao 850',
          equipo: 'M1: Ascensor Principal',
          estado: 'Fuera de Servicio',
          detalle: 'Cabina trabada mecánicamente con riesgo inminente.',
          remitoUrl: 'https://localhost:8050/api/eca/remito/ALT-001',
        })
        .expect(201);

      expect(res.body).toHaveProperty('ok', true);
      expect(res.body.mensajeFormateado).toContain('NOTIFICACIÓN DE ALERTA CRÍTICA - MAICON S.R.L.');
      expect(res.body.mensajeFormateado).toContain('MAICON Mantenimiento');
      expect(res.body.mensajeFormateado).toContain('Consorcio Callao 850');
      expect(res.body.mensajeFormateado).toContain('M1: Ascensor Principal');
      expect(res.body.mensajeFormateado).toContain('FUERA DE SERVICIO');
      expect(res.body.mensajeFormateado).toContain('Cabina trabada mecánicamente');
    });

    it('responde 400 si faltan campos obligatorios', async () => {
      await request(app.getHttpServer())
        .post('/api/whatsapp/formatear')
        .send({
          nombreEca: '',
          consorcio: 'Callao',
        })
        .expect(400);
    });
  });

  describe('POST /api/whatsapp/enviar-alerta', () => {
    it('responde 201 y efectúa el despacho exitoso con tracking', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/enviar-alerta')
        .send({
          telefonoDestino: '+5491155667788',
          nombreEca: 'MAICON Mantenimiento',
          consorcio: 'Consorcio Corrientes 1234',
          equipo: 'M2: Ascensor Servicio',
          estado: 'Reparación Urgente',
          detalle: 'Deslizamiento crítico en freno electromagnético de 18cm.',
        })
        .expect(201);

      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('estadoEntrega', 'entregado');
      expect(res.body).toHaveProperty('telefonoDestino', '+5491155667788');
      expect(res.body).toHaveProperty('idMensaje');
      expect(res.body.idMensaje).toContain('WA-MSG-');
      expect(res.body).toHaveProperty('intentos', 1);
    });
  });
});

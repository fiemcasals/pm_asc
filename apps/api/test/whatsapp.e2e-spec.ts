import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { MENSAJE_WHATSAPP_NO_CONFIGURADO } from '../src/whatsapp/whatsapp.types';
import { createTestApp } from './create-test-app';

describe('WhatsAppController (e2e - HU-11 / RF-01, RF-02, RF-03)', () => {
  let app: INestApplication;
  let connector: WhatsAppConnectorService;
  let warnSpy: jest.SpyInstance;

  const payloadAlerta = {
    telefonoDestino: '+5491155667788',
    nombreEca: 'MAICON Mantenimiento',
    consorcio: 'Consorcio Corrientes 1234',
    equipo: 'M2: Ascensor Servicio',
    estado: 'Reparación Urgente',
    detalle: 'Deslizamiento crítico en freno electromagnético de 18cm.',
  };

  beforeAll(async () => {
    const testApp = await createTestApp(process.env);
    app = testApp.app;
    connector = app.get(WhatsAppConnectorService);
  });

  beforeEach(() => {
    connector.setTransport(undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
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

  describe('POST /api/whatsapp/enviar-alerta (RF-03 Criterio 1)', () => {
    it('sin proveedor configurado responde HTTP 503 con error, informa que no está configurado y no devuelve "entregado"', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/enviar-alerta')
        .send(payloadAlerta)
        .expect(503);

      expect(res.body.ok).toBe(false);
      expect(res.body.estadoEntrega).toBe('no_configurado');
      expect(res.body.estadoEntrega).not.toBe('entregado');
      expect(res.body.message).toBe(MENSAJE_WHATSAPP_NO_CONFIGURADO);
      expect(res.body.error).toBe(MENSAJE_WHATSAPP_NO_CONFIGURADO);
      expect(res.body.idMensaje).toBeUndefined();
    });

    it('si el proveedor configurado falla al enviar, responde HTTP 502 con motivo del fallo', async () => {
      connector.setTransport({
        postMessage: async () => ({ status: 500 }),
      });

      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/enviar-alerta')
        .send(payloadAlerta)
        .expect(502);

      expect(res.body.ok).toBe(false);
      expect(res.body.estadoEntrega).toBe('fallido');
      expect(res.body.error).toContain('HTTP 500');
    });

    it('con proveedor configurado responde 201 y efectúa el despacho exitoso con tracking', async () => {
      connector.setTransport({
        postMessage: async () => ({ status: 200, body: { id: 'wamid-e2e' } }),
      });

      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/enviar-alerta')
        .send(payloadAlerta)
        .expect(201);

      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('estadoEntrega', 'entregado');
      expect(res.body).toHaveProperty('telefonoDestino', '+5491155667788');
      expect(res.body.idMensaje).toContain('WA-MSG-');
      expect(res.body).toHaveProperty('intentos', 1);
    });
  });

  describe('POST /api/whatsapp/trigger-alerta-critica (RF-02 y RF-03 Criterio 3)', () => {
    it('sin proveedor configurado registra el disparo automático como no realizado en historial', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/trigger-alerta-critica')
        .send({
          alertaId: 'ALT-MAICON-001',
          telefonoDestino: '+5491199887766',
        })
        .expect(201);

      expect(res.body.ok).toBe(false);
      expect(res.body.envioRealizado).toBe(false);
      expect(res.body.estado).toBe('no_realizado');
      expect(res.body.estadoEntrega).toBe('no_configurado');
      expect(res.body.estadoEntrega).not.toBe('entregado');
      expect(res.body.idMensaje).toBe('');
      expect(res.body.motivo).toBe(MENSAJE_WHATSAPP_NO_CONFIGURADO);

      const histRes = await request(app.getHttpServer())
        .get('/api/whatsapp/historial')
        .query({ alertaId: 'ALT-MAICON-001' })
        .expect(200);

      expect(histRes.body.total).toBeGreaterThanOrEqual(1);
      const ultimo = histRes.body.registros[histRes.body.registros.length - 1];
      expect(ultimo).toMatchObject({
        origen: 'automatico',
        alertaId: 'ALT-MAICON-001',
        ok: false,
        envioRealizado: false,
        estado: 'no_realizado',
        estadoEntrega: 'no_configurado',
        motivo: MENSAJE_WHATSAPP_NO_CONFIGURADO,
      });
    });

    it('con proveedor configurado responde 201 en menos de 5 segundos con link directo funcional al remito', async () => {
      connector.setTransport({
        postMessage: async () => ({ status: 200, body: { id: 'wamid-trig-e2e' } }),
      });

      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/trigger-alerta-critica')
        .send({
          alertaId: 'ALT-MAICON-001',
          telefonoDestino: '+5491199887766',
        })
        .expect(201);

      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('envioRealizado', true);
      expect(res.body).toHaveProperty('estado', 'realizado');
      expect(res.body).toHaveProperty('menorA5Segundos', true);
      expect(res.body.duracionMs).toBeLessThan(5000);
      expect(res.body.idMensaje).toContain('WA-MSG-');
      expect(res.body.enlaceDirecto).toContain('/api/eca/remito/ALT-MAICON-001/informe');
      expect(res.body.mensajeFormateado).toContain(res.body.enlaceDirecto);
    });
  });
});

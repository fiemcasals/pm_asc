import { INestApplication, Logger } from '@nestjs/common';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AvisosService } from '../src/avisos/avisos.service';
import { FirmanteService } from '../src/firmante/firmante.service';
import { MENSAJE_TELEFONO_ECA_FALTANTE } from '../src/whatsapp/whatsapp.types';
import { createTestApp, InMemoryConsorciosRepository } from './create-test-app';

interface PeticionCapturada {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function levantarServidorProveedor(
  manejador: (req: PeticionCapturada, res: ServerResponse) => void,
): Promise<{ server: Server; baseUrl: string; peticiones: PeticionCapturada[] }> {
  const peticiones: PeticionCapturada[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const capturada: PeticionCapturada = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      peticiones.push(capturada);
      manejador(capturada, res);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, peticiones });
    });
  });
}

describe('HU-11 RF-04 · Proveedor real de WhatsApp (Meta Cloud API / Twilio) y teléfono de la ECA desde terna', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('Criterio 1 y 4 (Meta Cloud API): con credenciales en variables de entorno envía por HTTP real al proveedor y no expone secretos', async () => {
    const srv = await levantarServidorProveedor((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.HBgMNTQ5MTE2NjY2Nzc3Nw==' }] }));
    });

    let app: INestApplication | undefined;
    try {
      const env = {
        WHATSAPP_PROVIDER: 'meta',
        WHATSAPP_META_ACCESS_TOKEN: 'EAAG-token-prueba-env-only',
        WHATSAPP_META_PHONE_NUMBER_ID: '109876543210',
        WHATSAPP_META_API_VERSION: 'v21.0',
        WHATSAPP_META_BASE_URL: srv.baseUrl,
      };
      ({ app } = await createTestApp(env));

      // Estado nunca filtra credenciales
      const estado = await request(app.getHttpServer()).get('/api/whatsapp/estado').expect(200);
      expect(estado.body).toEqual({ configurado: true, proveedor: 'meta' });
      expect(JSON.stringify(estado.body)).not.toContain('EAAG-token');

      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/enviar-alerta')
        .send({
          telefonoDestino: '+54 9 11 6666-7777',
          nombreEca: 'Conservación Porteña S.R.L.',
          consorcio: 'Av. Corrientes 1234',
          equipo: 'M1 - Principal',
          estado: 'Fuera de Servicio',
          detalle: 'Cabina trabada en piso 3',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        ok: true,
        estadoEntrega: 'aceptado',
        proveedor: 'meta',
        idMensaje: 'wamid.HBgMNTQ5MTE2NjY2Nzc3Nw==',
        telefonoDestino: '+5491166667777',
      });

      expect(srv.peticiones).toHaveLength(1);
      const cap = srv.peticiones[0];
      expect(cap.url).toBe('/v21.0/109876543210/messages');
      expect(cap.headers.authorization).toBe('Bearer EAAG-token-prueba-env-only');
      const bodyJson = JSON.parse(cap.body);
      expect(bodyJson).toMatchObject({
        messaging_product: 'whatsapp',
        to: '5491166667777',
        type: 'text',
      });
      expect(bodyJson.text.body).toContain('Conservación Porteña S.R.L.');
    } finally {
      await app?.close();
      srv.server.close();
    }
  });

  it('Criterio 1 (Twilio Sandbox): envía por HTTP real con Basic Auth y form-urlencoded cuando WHATSAPP_PROVIDER=twilio', async () => {
    const srv = await levantarServidorProveedor((_req, res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sid: 'SM998877665544332211', status: 'queued' }));
    });

    let app: INestApplication | undefined;
    try {
      const env = {
        WHATSAPP_PROVIDER: 'twilio',
        WHATSAPP_TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000001',
        WHATSAPP_TWILIO_AUTH_TOKEN: 'twilio-secret-env-only',
        WHATSAPP_TWILIO_FROM: 'whatsapp:+14155238886',
        WHATSAPP_TWILIO_BASE_URL: srv.baseUrl,
      };
      ({ app } = await createTestApp(env));

      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/enviar-alerta')
        .send({
          telefonoDestino: '+5491144445555',
          nombreEca: 'MAICON Mantenimiento',
          consorcio: 'Av. Santa Fe 3200',
          equipo: 'M2',
          estado: 'Reparación Urgente',
          detalle: 'Freno electromagnético descalibrado',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        ok: true,
        proveedor: 'twilio',
        idMensaje: 'SM998877665544332211',
      });

      expect(srv.peticiones).toHaveLength(1);
      const cap = srv.peticiones[0];
      expect(cap.url).toBe('/2010-04-01/Accounts/AC00000000000000000000000000000001/Messages.json');
      const expectedAuth = Buffer.from('AC00000000000000000000000000000001:twilio-secret-env-only').toString('base64');
      expect(cap.headers.authorization).toBe(`Basic ${expectedAuth}`);
      const form = new URLSearchParams(cap.body);
      expect(form.get('From')).toBe('whatsapp:+14155238886');
      expect(form.get('To')).toBe('whatsapp:+5491144445555');
      expect(form.get('Body')).toContain('MAICON Mantenimiento');
    } finally {
      await app?.close();
      srv.server.close();
    }
  });

  it('Criterio 2: toma el teléfono de la ECA desde la terna de roles del edificio; sin teléfono cargado no envía e informa el motivo', async () => {
    const srv = await levantarServidorProveedor((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages: [{ id: 'wamid.terna-ok' }] }));
    });

    const consorciosRepo = new InMemoryConsorciosRepository();
    let app: INestApplication | undefined;
    try {
      const env = {
        WHATSAPP_PROVIDER: 'meta',
        WHATSAPP_META_ACCESS_TOKEN: 'token-test',
        WHATSAPP_META_PHONE_NUMBER_ID: '12345',
        WHATSAPP_META_BASE_URL: srv.baseUrl,
      };
      ({ app } = await createTestApp(env, undefined, consorciosRepo));

      // Aprobar alerta ALT-MAICON-001 (Av. Santa Fe 3200, CABA)
      const avisos = app.get(AvisosService);
      const maquina = app.get(FirmanteService).getMaquinas().find((m) => m.alertaCritica?.id === 'ALT-MAICON-001')!;
      avisos.paraAlertaDeMaquina(maquina);
      await avisos.aprobar('ALT-MAICON-001', { usuario: 'sec1' }, { telefonoEca: '+5491100000001', telefonoFirmante: '+5491100000002' });
      srv.peticiones.length = 0;

      // 1) Sin consorcio/teléfono de ECA cargado en terna -> NO envía, informa motivo
      const sinTel = await request(app.getHttpServer())
        .post('/api/whatsapp/trigger-alerta-critica')
        .send({ alertaId: 'ALT-MAICON-001' })
        .expect(201);

      expect(sinTel.body).toMatchObject({
        ok: false,
        envioRealizado: false,
        estado: 'no_realizado',
        estadoEntrega: 'sin_telefono',
        telefonoDestino: '',
        motivo: MENSAJE_TELEFONO_ECA_FALTANTE,
      });
      expect(srv.peticiones).toHaveLength(0);

      // 2) Edificio creado con terna donde eca.telefono = null -> tampoco envía
      const edif = await consorciosRepo.crear({
        nombre: 'Consorcio Santa Fe 3200',
        direccion: 'Av. Santa Fe 3200, CABA',
        administracion: { nombre: null, telefono: null, email: null },
        encargado: { nombre: null, telefono: null },
        pisos: ['PB', '1'],
        ubicacion: null,
        maquinas: [{ referenciaAgc: 'M1', descripcion: null, tipo: 'traccion', salaCompartidaId: null }],
      });
      await consorciosRepo.asignarRoles(edif.id, {
        rtCalle: { nombre: 'rt1', telefono: '+5491111111111', email: 'rt@m.com' },
        firmante: { nombre: 'f1', telefono: '+5491122222222', email: 'f@m.com' },
        eca: { nombre: 'MAICON Mantenimiento', telefono: null, email: 'eca@m.com' },
      });

      const sinTelEnTerna = await request(app.getHttpServer())
        .post('/api/whatsapp/trigger-alerta-critica')
        .send({ alertaId: 'ALT-MAICON-001' })
        .expect(201);

      expect(sinTelEnTerna.body.ok).toBe(false);
      expect(sinTelEnTerna.body.estadoEntrega).toBe('sin_telefono');
      expect(sinTelEnTerna.body.motivo).toBe(MENSAJE_TELEFONO_ECA_FALTANTE);
      expect(srv.peticiones).toHaveLength(0);

      // 3) Cargar teléfono real de la ECA en la terna -> envía a ese teléfono (NO al número fijo viejo)
      await consorciosRepo.asignarRoles(edif.id, {
        rtCalle: { nombre: 'rt1', telefono: '+5491111111111', email: 'rt@m.com' },
        firmante: { nombre: 'f1', telefono: '+5491122222222', email: 'f@m.com' },
        eca: { nombre: 'MAICON Mantenimiento', telefono: '+5491177778888', email: 'eca@m.com' },
      });

      const conTel = await request(app.getHttpServer())
        .post('/api/whatsapp/trigger-alerta-critica')
        .send({ alertaId: 'ALT-MAICON-001' })
        .expect(201);

      expect(conTel.body).toMatchObject({
        ok: true,
        envioRealizado: true,
        estado: 'realizado',
        telefonoDestino: '+5491177778888',
        idMensaje: 'wamid.terna-ok',
      });
      expect(srv.peticiones).toHaveLength(1);
      expect(JSON.parse(srv.peticiones[0].body).to).toBe('5491177778888');

      // 4) Endpoint manual sin teléfono -> 400 con motivo
      const manualSinTel = await request(app.getHttpServer())
        .post('/api/whatsapp/enviar-alerta')
        .send({
          nombreEca: 'MAICON Mantenimiento',
          consorcio: 'Santa Fe 3200',
          equipo: 'M1',
          estado: 'Fuera de Servicio',
          detalle: 'Prueba sin teléfono',
        })
        .expect(400);

      expect(manualSinTel.body.estadoEntrega).toBe('sin_telefono');
      expect(manualSinTel.body.message).toBe(MENSAJE_TELEFONO_ECA_FALTANTE);
    } finally {
      await app?.close();
      srv.server.close();
    }
  });

  it('Criterio 3: si el proveedor rechaza el envío, informa el error exacto del proveedor y queda registrado como fallido', async () => {
    const srv = await levantarServidorProveedor((_req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            message: 'Recipient phone number not in allowed list',
            code: 131030,
            error_data: { details: 'Test mode restriction' },
          },
        }),
      );
    });

    let app: INestApplication | undefined;
    try {
      const env = {
        WHATSAPP_PROVIDER: 'meta',
        WHATSAPP_META_ACCESS_TOKEN: 'token-test',
        WHATSAPP_META_PHONE_NUMBER_ID: '12345',
        WHATSAPP_META_BASE_URL: srv.baseUrl,
      };
      ({ app } = await createTestApp(env));

      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/enviar-alerta')
        .send({
          telefonoDestino: '+5491199990000',
          nombreEca: 'MAICON Mantenimiento',
          consorcio: 'Av. Callao 800',
          equipo: 'M1',
          estado: 'Fuera de Servicio',
          detalle: 'Puerta tijera detectada',
        })
        .expect(502);

      expect(res.body).toMatchObject({
        ok: false,
        estadoEntrega: 'fallido',
        intentos: 1, // rechazo 4xx definitivo no reintenta
      });
      expect(res.body.error).toContain('Recipient phone number not in allowed list');
      expect(res.body.error).toContain('131030');
      expect(res.body.error).toContain('Test mode restriction');

      const hist = await request(app.getHttpServer()).get('/api/whatsapp/historial').expect(200);
      const ultimo = hist.body.registros[hist.body.registros.length - 1];
      expect(ultimo).toMatchObject({
        ok: false,
        estado: 'no_realizado',
        estadoEntrega: 'fallido',
      });
      expect(ultimo.motivo).toContain('Recipient phone number not in allowed list');
    } finally {
      await app?.close();
      srv.server.close();
    }
  });

  it('Criterio 4: ninguna credencial real ni el número fijo +5491144009988 quedan en el conector ni en el trigger', () => {
    const connectorSrc = readFileSync(join(__dirname, '../src/whatsapp/whatsapp-connector.service.ts'), 'utf8');
    const triggerSrc = readFileSync(join(__dirname, '../src/whatsapp/whatsapp-trigger.service.ts'), 'utf8');
    const providerSrc = readFileSync(join(__dirname, '../src/whatsapp/whatsapp-provider.transport.ts'), 'utf8');
    const envExample = readFileSync(join(__dirname, '../../../.env.example'), 'utf8');

    expect(connectorSrc).not.toContain('+5491144009988');
    expect(triggerSrc).not.toContain('+5491144009988');
    expect(connectorSrc).not.toContain('mock_whatsapp_token');
    expect(providerSrc).not.toMatch(/EAAG[A-Za-z0-9]{10,}/);
    expect(envExample).toContain('WHATSAPP_META_ACCESS_TOKEN=');
    expect(envExample).toContain('WHATSAPP_TWILIO_AUTH_TOKEN=');
    expect(envExample).not.toMatch(/WHATSAPP_META_ACCESS_TOKEN=\S+/);
    expect(envExample).not.toMatch(/WHATSAPP_TWILIO_AUTH_TOKEN=\S+/);
  });
});

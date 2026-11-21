import { INestApplication, Logger } from '@nestjs/common';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AvisosService } from '../src/avisos/avisos.service';
import { FirmanteService } from '../src/firmante/firmante.service';
import { MENSAJE_TELEFONO_ECA_FALTANTE } from '../src/whatsapp/whatsapp.types';
import { createTestApp, InMemoryConsorciosRepository } from './create-test-app';
import { LARGO_MAXIMO_PARAMETRO, limpiarParametroPlantilla } from '../src/whatsapp/whatsapp-formatter.service';

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
        WHATSAPP_META_TEMPLATE_NAME: 'alerta_falla_critica',
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
        estadoEntrega: 'entregado',
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
        type: 'template',
      });
      expect(bodyJson.template.name).toBe('alerta_falla_critica');
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
        WHATSAPP_TWILIO_CONTENT_SID: 'HX00000000000000000000000000000001',
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
      expect(form.get('ContentSid')).toBe('HX00000000000000000000000000000001');
      expect(form.has('Body')).toBe(false);
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
        WHATSAPP_META_TEMPLATE_NAME: 'alerta_falla_critica',
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
        WHATSAPP_META_TEMPLATE_NAME: 'alerta_falla_critica',
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

const AVISO = {
  telefonoDestino: '+54 9 11 6666-7777',
  nombreEca: 'Conservación Porteña S.R.L.',
  consorcio: 'Av. Corrientes 1234',
  equipo: 'M1 - Principal',
  estado: 'Fuera de Servicio',
  detalle: 'Cabina trabada en piso 3',
  remitoUrl: 'https://app.test/informe/abc123',
};

const RESPUESTA_META = JSON.stringify({ messages: [{ id: 'wamid.plantilla' }] });
const RESPUESTA_TWILIO = JSON.stringify({ sid: 'SMplantilla', status: 'queued' });

describe('HU-11 RF-08 · El aviso sale como plantilla aprobada, nunca como texto libre', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  async function conProveedor(
    respuesta: { status: number; cuerpo: string },
    envDe: (baseUrl: string) => Record<string, string>,
    prueba: (ctx: { app: INestApplication; peticiones: PeticionCapturada[] }) => Promise<void>,
  ): Promise<void> {
    const srv = await levantarServidorProveedor((_req, res) => {
      res.writeHead(respuesta.status, { 'Content-Type': 'application/json' });
      res.end(respuesta.cuerpo);
    });
    let app: INestApplication | undefined;
    try {
      ({ app } = await createTestApp(envDe(srv.baseUrl)));
      await prueba({ app, peticiones: srv.peticiones });
    } finally {
      await app?.close();
      srv.server.close();
    }
  }

  const envMeta = (baseUrl: string, extra: Record<string, string> = {}) => ({
    WHATSAPP_PROVIDER: 'meta',
    WHATSAPP_META_ACCESS_TOKEN: 'token-test',
    WHATSAPP_META_PHONE_NUMBER_ID: '12345',
    WHATSAPP_META_BASE_URL: baseUrl,
    ...extra,
  });
  const envTwilio = (baseUrl: string, extra: Record<string, string> = {}) => ({
    WHATSAPP_PROVIDER: 'twilio',
    WHATSAPP_TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000001',
    WHATSAPP_TWILIO_AUTH_TOKEN: 'twilio-secret',
    WHATSAPP_TWILIO_FROM: 'whatsapp:+14155238886',
    WHATSAPP_TWILIO_BASE_URL: baseUrl,
    ...extra,
  });

  it('Criterio 1 (Meta): manda type "template" con el nombre, el idioma y los 5 parámetros en orden, y ningún campo de texto libre', async () => {
    await conProveedor(
      { status: 200, cuerpo: RESPUESTA_META },
      (url) => envMeta(url, { WHATSAPP_META_TEMPLATE_NAME: 'alerta_falla_critica' }),
      async ({ app, peticiones }) => {
        await request(app.getHttpServer()).post('/api/whatsapp/enviar-alerta').send(AVISO).expect(201);

        expect(peticiones).toHaveLength(1);
        expect(JSON.parse(peticiones[0].body)).toEqual({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: '5491166667777',
          type: 'template',
          template: {
            name: 'alerta_falla_critica',
            language: { code: 'es_AR' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: 'Av. Corrientes 1234' },
                  { type: 'text', text: 'M1 - Principal' },
                  { type: 'text', text: 'Fuera de Servicio' },
                  { type: 'text', text: 'Cabina trabada en piso 3' },
                  { type: 'text', text: 'https://app.test/informe/abc123' },
                ],
              },
            ],
          },
        });
        expect(peticiones[0].body).not.toContain('preview_url');
      },
    );
  });

  it('Criterio 1 (Meta): el idioma sale de WHATSAPP_META_TEMPLATE_LANG', async () => {
    await conProveedor(
      { status: 200, cuerpo: RESPUESTA_META },
      (url) => envMeta(url, { WHATSAPP_META_TEMPLATE_NAME: 'alerta_falla_critica', WHATSAPP_META_TEMPLATE_LANG: 'es_ES' }),
      async ({ app, peticiones }) => {
        await request(app.getHttpServer()).post('/api/whatsapp/enviar-alerta').send(AVISO).expect(201);
        expect(JSON.parse(peticiones[0].body).template.language).toEqual({ code: 'es_ES' });
      },
    );
  });

  it('Criterio 2 (Twilio): manda ContentSid y ContentVariables con los mismos 5 valores, y no manda Body', async () => {
    await conProveedor(
      { status: 201, cuerpo: RESPUESTA_TWILIO },
      (url) => envTwilio(url, { WHATSAPP_TWILIO_CONTENT_SID: 'HX11111111111111111111111111111111' }),
      async ({ app, peticiones }) => {
        await request(app.getHttpServer()).post('/api/whatsapp/enviar-alerta').send(AVISO).expect(201);

        const form = new URLSearchParams(peticiones[0].body);
        expect(form.get('ContentSid')).toBe('HX11111111111111111111111111111111');
        expect(JSON.parse(form.get('ContentVariables') as string)).toEqual({
          '1': 'Av. Corrientes 1234',
          '2': 'M1 - Principal',
          '3': 'Fuera de Servicio',
          '4': 'Cabina trabada en piso 3',
          '5': 'https://app.test/informe/abc123',
        });
        expect(form.has('Body')).toBe(false);
        expect(form.get('To')).toBe('whatsapp:+5491166667777');
      },
    );
  });

  it.each([
    ['Meta', 'WHATSAPP_META_TEMPLATE_NAME', (url: string) => envMeta(url)],
    ['Twilio', 'WHATSAPP_TWILIO_CONTENT_SID', (url: string) => envTwilio(url)],
  ])(
    'Criterio 3 (%s): sin plantilla configurada no sale ningún mensaje, queda no_configurado con el motivo y no cae a texto libre',
    async (_nombre, variable, env) => {
      await conProveedor({ status: 200, cuerpo: RESPUESTA_META }, env, async ({ app, peticiones }) => {
        const res = await request(app.getHttpServer()).post('/api/whatsapp/enviar-alerta').send(AVISO).expect(503);

        expect(res.body.estadoEntrega).toBe('no_configurado');
        expect(res.body.error).toContain('plantilla');
        expect(res.body.error).toContain(variable);
        expect(peticiones).toHaveLength(0);

        const hist = await request(app.getHttpServer()).get('/api/whatsapp/historial').expect(200);
        const ultimo = hist.body.registros[hist.body.registros.length - 1];
        expect(ultimo).toMatchObject({ ok: false, estado: 'no_realizado', estadoEntrega: 'no_configurado' });
        expect(ultimo.motivo).toContain('plantilla');
        expect(ultimo.idMensaje).toBe('');
      });
    },
  );

  it('Criterio 3: al aprobar el aviso en la bandeja sin plantilla configurada, tampoco sale ningún WhatsApp', async () => {
    await conProveedor(
      { status: 200, cuerpo: RESPUESTA_META },
      (url) => envMeta(url),
      async ({ app, peticiones }) => {
        const avisos = app.get(AvisosService);
        const maquina = app.get(FirmanteService).getMaquinas().find((m) => m.alertaCritica?.id === 'ALT-MAICON-001')!;
        avisos.paraAlertaDeMaquina(maquina);
        await avisos.aprobar('ALT-MAICON-001', { usuario: 'sec1' }, { telefonoEca: '+5491100000001', telefonoFirmante: '+5491100000002' });

        expect(peticiones).toHaveLength(0);
        const hist = await request(app.getHttpServer()).get('/api/whatsapp/historial').expect(200);
        const registros = hist.body.registros as { alertaId?: string; estadoEntrega: string; motivo?: string }[];
        const delAviso = registros.filter((r) => r.alertaId === 'ALT-MAICON-001');
        expect(delAviso.length).toBeGreaterThan(0);
        expect(delAviso.every((r) => r.estadoEntrega === 'no_configurado' && /plantilla/.test(r.motivo ?? ''))).toBe(true);
      },
    );
  });

  it('Criterio 4: un detalle de varias líneas llega limpio, sin saltos de línea, tabulaciones ni más de 4 espacios seguidos', async () => {
    await conProveedor(
      { status: 200, cuerpo: RESPUESTA_META },
      (url) => envMeta(url, { WHATSAPP_META_TEMPLATE_NAME: 'alerta_falla_critica' }),
      async ({ app, peticiones }) => {
        const detalle = 'Cabina trabada.\n\nPuerta abierta\ten piso 3.\r\n      Llamar al encargado.';
        await request(app.getHttpServer())
          .post('/api/whatsapp/enviar-alerta')
          .send({ ...AVISO, detalle })
          .expect(201);

        const parametros = JSON.parse(peticiones[0].body).template.components[0].parameters as { text: string }[];
        expect(parametros).toHaveLength(5);
        for (const p of parametros) {
          expect(p.text).not.toMatch(/[\r\n\t]/);
          expect(p.text).not.toMatch(/ {5,}/);
        }
        expect(parametros[3].text).toBe('Cabina trabada. Puerta abierta en piso 3. Llamar al encargado.');
      },
    );
  });

  describe('Criterio 4 · limpiarParametroPlantilla', () => {
    it('reemplaza saltos de línea y tabulaciones por un espacio', () => {
      expect(limpiarParametroPlantilla('a\nb\tc\r\nd')).toBe('a b c d');
    });

    it('colapsa las tandas de más de 4 espacios y deja pasar hasta 4', () => {
      expect(limpiarParametroPlantilla('a     b')).toBe('a b');
      expect(limpiarParametroPlantilla('a    b')).toBe('a    b');
    });

    it('recorta a 1024 caracteres y no deja espacios al borde', () => {
      const largo = limpiarParametroPlantilla('x'.repeat(2000));
      expect(largo).toHaveLength(LARGO_MAXIMO_PARAMETRO);
      expect(limpiarParametroPlantilla('  hola  ')).toBe('hola');
    });
  });

  it('el enlace ausente no deja una variable vacía: lleva un guion, porque Meta no admite parámetros vacíos', async () => {
    await conProveedor(
      { status: 200, cuerpo: RESPUESTA_META },
      (url) => envMeta(url, { WHATSAPP_META_TEMPLATE_NAME: 'alerta_falla_critica' }),
      async ({ app, peticiones }) => {
        const { remitoUrl: _sinEnlace, ...sinEnlace } = AVISO;
        await request(app.getHttpServer()).post('/api/whatsapp/enviar-alerta').send(sinEnlace).expect(201);
        const parametros = JSON.parse(peticiones[0].body).template.components[0].parameters as { text: string }[];
        expect(parametros[4].text).toBe('-');
      },
    );
  });
});

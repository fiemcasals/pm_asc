import { INestApplication, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { createTestApp } from './create-test-app';

const VERIFY_TOKEN = 'verify-token-de-prueba';
const APP_SECRET = 'app-secret-de-meta-de-prueba';
const TWILIO_TOKEN = 'auth-token-de-twilio-de-prueba';
const URL_TWILIO = 'https://app.maicon.example/api/whatsapp/webhook/twilio';

const ENV = {
  WHATSAPP_META_VERIFY_TOKEN: VERIFY_TOKEN,
  WHATSAPP_META_APP_SECRET: APP_SECRET,
  WHATSAPP_TWILIO_AUTH_TOKEN: TWILIO_TOKEN,
  WHATSAPP_TWILIO_WEBHOOK_URL: URL_TWILIO,
};

const AVISO = {
  telefonoDestino: '+54 9 11 6666-7777',
  nombreEca: 'Conservación Porteña S.R.L.',
  consorcio: 'Av. Corrientes 1234',
  equipo: 'M1 - Principal',
  estado: 'Fuera de Servicio',
  detalle: 'Cabina trabada en piso 3',
};

const firmaMeta = (cuerpo: string, secreto = APP_SECRET) =>
  `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;

const firmaTwilio = (params: Record<string, string>, token = TWILIO_TOKEN) =>
  createHmac('sha1', token)
    .update(
      Object.keys(params)
        .sort()
        .reduce((acc, k) => acc + k + params[k], URL_TWILIO),
      'utf8',
    )
    .digest('base64');

function cuerpoMeta(
  id: string,
  status: string,
  errores?: { code: number; title: string; message: string; error_data?: { details: string } }[],
): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1234567890',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              statuses: [{ id, status, timestamp: '1790000000', recipient_id: '5491166667777', ...(errores ? { errors: errores } : {}) }],
            },
          },
        ],
      },
    ],
  });
}

describe('HU-11 RF-09 · Confirmar la entrega real de cada WhatsApp con los avisos del proveedor', () => {
  let app: INestApplication;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    ({ app } = await createTestApp(ENV));
  });

  afterEach(async () => {
    await app?.close();
    warnSpy.mockRestore();
  });

  const http = () => request(app.getHttpServer());

  /** Hace un envío que el proveedor acepta con ese id de mensaje, igual que Meta o Twilio. */
  async function enviarConId(idMensaje: string): Promise<void> {
    app.get(WhatsAppConnectorService).setTransport({
      proveedor: 'meta',
      postMessage: async () => ({ status: 200, providerMessageId: idMensaje }),
    });
    await http().post('/api/whatsapp/enviar-alerta').send(AVISO).expect(201);
  }

  async function registro(idMensaje: string) {
    const res = await http().get('/api/whatsapp/historial').expect(200);
    return (res.body.registros as Record<string, unknown>[]).find((r) => r.idMensaje === idMensaje);
  }

  const totalRegistros = async () => (await http().get('/api/whatsapp/historial').expect(200)).body.total as number;

  const enviarMeta = (cuerpo: string, firma?: string) => {
    const r = http().post('/api/whatsapp/webhook/meta').set('Content-Type', 'application/json');
    return (firma ? r.set('X-Hub-Signature-256', firma) : r).send(cuerpo);
  };

  const enviarTwilio = (params: Record<string, string>, firma?: string) => {
    const r = http().post('/api/whatsapp/webhook/twilio').type('form');
    return (firma ? r.set('X-Twilio-Signature', firma) : r).send(params);
  };

  describe('Criterio 1 · verificación de la suscripción de Meta', () => {
    it('devuelve el valor de hub.challenge cuando hub.verify_token coincide', async () => {
      const res = await http()
        .get('/api/whatsapp/webhook/meta')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1158201444' })
        .expect(200);
      expect(res.text).toBe('1158201444');
    });

    it('responde 403 con cualquier otro token, sin token o sin modo subscribe', async () => {
      await http().get('/api/whatsapp/webhook/meta').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '1' }).expect(403);
      await http().get('/api/whatsapp/webhook/meta').query({ 'hub.mode': 'subscribe', 'hub.challenge': '1' }).expect(403);
      await http().get('/api/whatsapp/webhook/meta').query({ 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' }).expect(403);
    });

    it('sin WHATSAPP_META_VERIFY_TOKEN configurado rechaza todo, incluso un token vacío', async () => {
      await app.close();
      ({ app } = await createTestApp({}));
      await http().get('/api/whatsapp/webhook/meta').query({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '1' }).expect(403);
    });
  });

  describe('Criterio 2 · firma de Meta', () => {
    it('sin firma o con firma inválida responde 401 y no cambia ningún registro', async () => {
      await enviarConId('wamid.firma');
      const cuerpo = cuerpoMeta('wamid.firma', 'delivered');

      await enviarMeta(cuerpo).expect(401);
      await enviarMeta(cuerpo, firmaMeta(cuerpo, 'otro-secreto')).expect(401);
      await enviarMeta(cuerpo, 'sha256=' + 'a'.repeat(64)).expect(401);
      await enviarMeta(cuerpo, firmaMeta(cuerpo + ' ')).expect(401); // firmada sobre un cuerpo distinto

      expect((await registro('wamid.firma'))!.estadoEntrega).toBe('aceptado');
    });

    it('sin WHATSAPP_META_APP_SECRET configurado rechaza todo con 401', async () => {
      await app.close();
      ({ app } = await createTestApp({ ...ENV, WHATSAPP_META_APP_SECRET: '' }));
      await enviarConId('wamid.sinsecreto');
      const cuerpo = cuerpoMeta('wamid.sinsecreto', 'delivered');

      await enviarMeta(cuerpo, firmaMeta(cuerpo, '')).expect(401);
      expect((await registro('wamid.sinsecreto'))!.estadoEntrega).toBe('aceptado');
    });

    it('con la firma correcta del cuerpo sin modificar acepta el aviso', async () => {
      await enviarConId('wamid.ok');
      const cuerpo = cuerpoMeta('wamid.ok', 'delivered');

      const res = await enviarMeta(cuerpo, firmaMeta(cuerpo)).expect(200);
      expect(res.body).toEqual({ ok: true, recibidos: 1, actualizados: 1, desconocidos: 0 });
    });
  });

  describe('Criterio 3 · firma de Twilio', () => {
    it('con firma inválida o ausente responde 401 y no cambia ningún registro', async () => {
      await enviarConId('SM-firma');
      const params = { MessageSid: 'SM-firma', MessageStatus: 'delivered', To: 'whatsapp:+5491166667777' };

      await enviarTwilio(params).expect(401);
      await enviarTwilio(params, firmaTwilio(params, 'otro-token')).expect(401);
      await enviarTwilio({ ...params, MessageStatus: 'read' }, firmaTwilio(params)).expect(401); // cambiaron un parámetro

      expect((await registro('SM-firma'))!.estadoEntrega).toBe('aceptado');
    });

    it('con la firma correcta de la URL pública y los parámetros acepta el aviso', async () => {
      await enviarConId('SM-ok');
      const params = { MessageSid: 'SM-ok', MessageStatus: 'delivered', AccountSid: 'AC1', To: 'whatsapp:+5491166667777' };

      await enviarTwilio(params, firmaTwilio(params)).expect(200);
      expect((await registro('SM-ok'))!.estadoEntrega).toBe('entregado');
    });

    it('la URL pública sin configurar sale de APP_URL', async () => {
      await app.close();
      ({ app } = await createTestApp({ ...ENV, WHATSAPP_TWILIO_WEBHOOK_URL: '', APP_URL: 'https://otra.maicon.example/' }));
      await enviarConId('SM-appurl');
      const params = { MessageSid: 'SM-appurl', MessageStatus: 'read' };
      const firma = createHmac('sha1', TWILIO_TOKEN)
        .update('https://otra.maicon.example/api/whatsapp/webhook/twilio' + 'MessageSidSM-appurlMessageStatusread', 'utf8')
        .digest('base64');

      await enviarTwilio(params, firma).expect(200);
      expect((await registro('SM-appurl'))!.estadoEntrega).toBe('leido');
    });
  });

  describe('Criterio 4 · cada evento válido actualiza el registro', () => {
    it.each([
      ['sent', 'enviado'],
      ['delivered', 'entregado'],
      ['read', 'leido'],
    ])('Meta: %s pasa el registro a %s', async (status, esperado) => {
      await enviarConId(`wamid.${status}`);
      const cuerpo = cuerpoMeta(`wamid.${status}`, status);
      await enviarMeta(cuerpo, firmaMeta(cuerpo)).expect(200);

      const r = (await registro(`wamid.${status}`))!;
      expect(r.estadoEntrega).toBe(esperado);
      expect(r.estadoActualizadoEn).toBe(new Date(1790000000 * 1000).toISOString());
    });

    it('Meta: failed pasa a fallido con el código y el mensaje de error, y deja de figurar como realizado', async () => {
      await enviarConId('wamid.falla');
      const cuerpo = cuerpoMeta('wamid.falla', 'failed', [
        { code: 131026, title: 'Message undeliverable', message: 'Message undeliverable', error_data: { details: 'Receiver is incapable of receiving this message' } },
      ]);
      await enviarMeta(cuerpo, firmaMeta(cuerpo)).expect(200);

      const r = (await registro('wamid.falla'))!;
      expect(r).toMatchObject({
        estadoEntrega: 'fallido',
        ok: false,
        envioRealizado: false,
        estado: 'no_realizado',
        errorProveedor: { codigo: '131026', mensaje: 'Message undeliverable · Receiver is incapable of receiving this message' },
      });
      expect(r.motivo).toContain('131026');
      expect(r.motivo).toContain('Receiver is incapable of receiving this message');
    });

    it.each([
      ['sent', 'enviado'],
      ['delivered', 'entregado'],
      ['read', 'leido'],
    ])('Twilio: %s pasa el registro a %s', async (status, esperado) => {
      await enviarConId(`SM-${status}`);
      const params = { MessageSid: `SM-${status}`, MessageStatus: status };
      await enviarTwilio(params, firmaTwilio(params)).expect(200);
      expect((await registro(`SM-${status}`))!.estadoEntrega).toBe(esperado);
    });

    it.each(['failed', 'undelivered'])('Twilio: %s pasa a fallido con ErrorCode y ErrorMessage', async (status) => {
      await enviarConId(`SM-${status}`);
      const params = { MessageSid: `SM-${status}`, MessageStatus: status, ErrorCode: '63016', ErrorMessage: 'Fuera de la ventana de 24 horas' };
      await enviarTwilio(params, firmaTwilio(params)).expect(200);

      expect(await registro(`SM-${status}`)).toMatchObject({
        estadoEntrega: 'fallido',
        ok: false,
        errorProveedor: { codigo: '63016', mensaje: 'Fuera de la ventana de 24 horas' },
      });
    });

    it('Twilio: los estados intermedios (en cola, enviando) no cambian nada', async () => {
      await enviarConId('SM-cola');
      for (const status of ['queued', 'accepted', 'sending']) {
        const params = { MessageSid: 'SM-cola', MessageStatus: status };
        const res = await enviarTwilio(params, firmaTwilio(params)).expect(200);
        expect(res.body.actualizados).toBe(0);
      }
      expect((await registro('SM-cola'))!.estadoEntrega).toBe('aceptado');
    });

    it('un POST de Meta con varios estados los aplica todos', async () => {
      await enviarConId('wamid.uno');
      await enviarConId('wamid.dos');
      const cuerpo = JSON.stringify({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    { id: 'wamid.uno', status: 'delivered' },
                    { id: 'wamid.dos', status: 'read' },
                  ],
                },
              },
            ],
          },
        ],
      });
      const res = await enviarMeta(cuerpo, firmaMeta(cuerpo)).expect(200);

      expect(res.body).toMatchObject({ recibidos: 2, actualizados: 2 });
      expect((await registro('wamid.uno'))!.estadoEntrega).toBe('entregado');
      expect((await registro('wamid.dos'))!.estadoEntrega).toBe('leido');
    });
  });

  describe('Criterio 5 · el estado nunca retrocede y los eventos repetidos son inofensivos', () => {
    it('un delivered que llega después de un read no cambia el registro', async () => {
      await enviarConId('wamid.orden');
      for (const status of ['read', 'delivered', 'sent']) {
        const cuerpo = cuerpoMeta('wamid.orden', status);
        await enviarMeta(cuerpo, firmaMeta(cuerpo)).expect(200);
      }
      expect((await registro('wamid.orden'))!.estadoEntrega).toBe('leido');
    });

    it('el mismo evento dos veces no cambia el registro ni crea filas nuevas', async () => {
      await enviarConId('wamid.repetido');
      const cuerpo = cuerpoMeta('wamid.repetido', 'delivered');
      const antes = await totalRegistros();

      const primero = await enviarMeta(cuerpo, firmaMeta(cuerpo)).expect(200);
      const despues1 = await registro('wamid.repetido');
      const segundo = await enviarMeta(cuerpo, firmaMeta(cuerpo)).expect(200);
      const despues2 = await registro('wamid.repetido');

      expect(primero.body.actualizados).toBe(1);
      expect(segundo.body.actualizados).toBe(0);
      expect(despues2).toEqual(despues1);
      expect(await totalRegistros()).toBe(antes);
    });

    it('un failed después de entregado o leído no deshace la entrega', async () => {
      await enviarConId('wamid.tardio');
      const entregado = cuerpoMeta('wamid.tardio', 'delivered');
      await enviarMeta(entregado, firmaMeta(entregado)).expect(200);

      const fallo = cuerpoMeta('wamid.tardio', 'failed', [{ code: 131000, title: 'Algo', message: 'Algo' }]);
      await enviarMeta(fallo, firmaMeta(fallo)).expect(200);

      expect(await registro('wamid.tardio')).toMatchObject({ estadoEntrega: 'entregado', ok: true });
    });

    it('un mensaje que ya falló no vuelve a otro estado con un aviso tardío', async () => {
      await enviarConId('wamid.fallo-final');
      const fallo = cuerpoMeta('wamid.fallo-final', 'failed', [{ code: 131000, title: 'Algo', message: 'Algo' }]);
      await enviarMeta(fallo, firmaMeta(fallo)).expect(200);
      const entregado = cuerpoMeta('wamid.fallo-final', 'delivered');
      await enviarMeta(entregado, firmaMeta(entregado)).expect(200);

      expect((await registro('wamid.fallo-final'))!.estadoEntrega).toBe('fallido');
    });
  });

  describe('Criterio 6 · mensajes que el sistema no conoce', () => {
    it('responde 200 sin crear nada, para que el proveedor no reintente', async () => {
      await enviarConId('wamid.conocido');
      const antes = await totalRegistros();
      const cuerpo = cuerpoMeta('wamid.desconocido', 'delivered');

      const res = await enviarMeta(cuerpo, firmaMeta(cuerpo)).expect(200);
      expect(res.body).toEqual({ ok: true, recibidos: 1, actualizados: 0, desconocidos: 1 });

      const params = { MessageSid: 'SM-desconocido', MessageStatus: 'delivered' };
      const resTwilio = await enviarTwilio(params, firmaTwilio(params)).expect(200);
      expect(resTwilio.body).toMatchObject({ actualizados: 0, desconocidos: 1 });

      expect(await totalRegistros()).toBe(antes);
    });

    it('un cuerpo firmado sin estados (por ejemplo un mensaje entrante) también responde 200', async () => {
      const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ id: 'x' }] } }] }] });
      const res = await enviarMeta(cuerpo, firmaMeta(cuerpo)).expect(200);
      expect(res.body).toEqual({ ok: true, recibidos: 0, actualizados: 0, desconocidos: 0 });
    });
  });

  describe('Criterio 7 · aceptado no es entregado', () => {
    it('un envío con respuesta 2xx figura aceptado y solo pasa a entregado con el aviso del proveedor', async () => {
      await enviarConId('wamid.aceptado');

      expect(await registro('wamid.aceptado')).toMatchObject({ estadoEntrega: 'aceptado', ok: true, estado: 'realizado' });

      const cuerpo = cuerpoMeta('wamid.aceptado', 'delivered');
      await enviarMeta(cuerpo, firmaMeta(cuerpo)).expect(200);
      expect((await registro('wamid.aceptado'))!.estadoEntrega).toBe('entregado');
    });

    it('la respuesta de POST /api/whatsapp/enviar-alerta informa aceptado, no entregado', async () => {
      app.get(WhatsAppConnectorService).setTransport({
        proveedor: 'meta',
        postMessage: async () => ({ status: 200, providerMessageId: 'wamid.resp' }),
      });
      const res = await http().post('/api/whatsapp/enviar-alerta').send(AVISO).expect(201);
      expect(res.body.estadoEntrega).toBe('aceptado');
    });
  });

  describe('Criterio 8 · los secretos no se exponen', () => {
    it('GET /api/whatsapp/estado no trae ningún secreto de firma', async () => {
      const res = await http().get('/api/whatsapp/estado').expect(200);
      const texto = JSON.stringify(res.body);
      for (const secreto of [VERIFY_TOKEN, APP_SECRET, TWILIO_TOKEN, URL_TWILIO]) expect(texto).not.toContain(secreto);
    });

    it('las respuestas de los webhooks no repiten secretos ni la firma esperada', async () => {
      const cuerpo = cuerpoMeta('wamid.x', 'delivered');
      const res = await enviarMeta(cuerpo, 'sha256=mala').expect(401);
      const texto = JSON.stringify(res.body);
      expect(texto).not.toContain(APP_SECRET);
      expect(texto).not.toContain(firmaMeta(cuerpo));
    });

    it('.env.example declara los secretos vacíos y no hay ninguno escrito en el código', () => {
      const ejemplo = readFileSync(join(__dirname, '../../../.env.example'), 'utf8');
      for (const variable of ['WHATSAPP_META_VERIFY_TOKEN', 'WHATSAPP_META_APP_SECRET', 'WHATSAPP_TWILIO_WEBHOOK_URL']) {
        expect(ejemplo).toMatch(new RegExp(`^${variable}=$`, 'm'));
      }
      for (const archivo of ['whatsapp-webhook.service.ts', 'whatsapp-webhook.controller.ts']) {
        const fuente = readFileSync(join(__dirname, '../src/whatsapp', archivo), 'utf8');
        expect(fuente).not.toMatch(/process\.env/); // los secretos llegan solo por la configuración
      }
    });
  });
});

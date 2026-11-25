import { INestApplication, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { DatabaseService } from '../src/database/database.service';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { MENSAJE_FIRMA_INVALIDA } from '../src/whatsapp/whatsapp-webhook.controller';
import { createTestApp } from './create-test-app';
import { NombreSesion, bearer, crearSesiones } from './sesiones-e2e';

jest.setTimeout(30_000);

// HU-11 RF-15 — WhatsApp y diagnóstico de seguridad con sesión: solo quien corresponde.
const VERIFY_TOKEN = 'verify-token-rf15';
const APP_SECRET = 'app-secret-rf15';
const TWILIO_TOKEN = 'auth-token-twilio-rf15';
const URL_TWILIO = 'https://app.maicon.example/api/whatsapp/webhook/twilio';
const ENV = {
  NODE_ENV: 'test',
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
const DISPARO = { alertaId: 'ALT-MAICON-001' };

/** Las cuatro rutas de WhatsApp que ahora piden la Secretaría o el Administrador, y el diagnóstico de RLS, que pide el Administrador. */
type Ruta = { nombre: string; metodo: 'get' | 'post'; ruta: string; cuerpo?: object };
const RUTAS_WHATSAPP: Ruta[] = [
  { nombre: 'enviar-alerta', metodo: 'post', ruta: '/api/whatsapp/enviar-alerta', cuerpo: AVISO },
  { nombre: 'formatear', metodo: 'post', ruta: '/api/whatsapp/formatear', cuerpo: AVISO },
  { nombre: 'trigger-alerta-critica', metodo: 'post', ruta: '/api/whatsapp/trigger-alerta-critica', cuerpo: DISPARO },
  { nombre: 'estado', metodo: 'get', ruta: '/api/whatsapp/estado' },
];
const RUTA_RLS: Ruta = { nombre: 'seguridad/rls', metodo: 'get', ruta: '/api/seguridad/rls' };

describe('WhatsApp y diagnóstico de seguridad con sesión (HU-11 RF-15)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;
  let enviadosAlProveedor: number;
  const http = () => request(app.getHttpServer());
  const llamar = (r: Ruta, token?: string) => {
    const pedido = r.metodo === 'get' ? http().get(r.ruta) : http().post(r.ruta).send(r.cuerpo ?? {});
    return token === undefined ? pedido : pedido.set('Authorization', bearer(token));
  };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp(ENV, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
    enviadosAlProveedor = 0;
    // El proveedor simulado cuenta lo que le llega: lo que se prueba es que, sin permiso, no llega nada.
    app.get(WhatsAppConnectorService).setTransport({
      proveedor: 'meta',
      postMessage: async () => {
        enviadosAlProveedor += 1;
        return { status: 200, providerMessageId: `wamid.rf15.${enviadosAlProveedor}` };
      },
    } as never);
    // La base de las pruebas es simulada y no sabe de RLS: el diagnóstico lo aporta la prueba.
    Object.assign(app.get(DatabaseService), { inspeccionarRls: async () => ({ usuarioActual: 'ascensores_app' }) });
  });
  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  describe('criterio 1: sin sesión, 401 y no se manda nada', () => {
    it.each([...RUTAS_WHATSAPP, RUTA_RLS])('$nombre sin Authorization → 401', async (r) => {
      await llamar(r).expect(401);
      expect(enviadosAlProveedor).toBe(0);
    });

    it.each([...RUTAS_WHATSAPP, RUTA_RLS])('$nombre con un token inventado → 401', async (r) => {
      await llamar(r, 'token.inventado.x').expect(401);
      expect(enviadosAlProveedor).toBe(0);
    });

    it('sin sesión no se agrega nada al historial de envíos', async () => {
      await llamar(RUTAS_WHATSAPP[0]).expect(401);
      const historial = await http().get('/api/whatsapp/historial').set('Authorization', bearer(tokens.secretaria)).expect(200);
      expect(historial.body.total).toBe(0);
    });
  });

  describe('criterio 2: la Secretaría y el Administrador usan WhatsApp; solo el Administrador ve el diagnóstico de RLS', () => {
    const ROLES_SIN_PERMISO = ['rt_calle', 'firmante', 'ecaPortena'] as const;

    describe.each(RUTAS_WHATSAPP)('$nombre', (r) => {
      it.each(ROLES_SIN_PERMISO)('%s → 403 y no se manda nada', async (rol) => {
        await llamar(r, tokens[rol]).expect(403);
        expect(enviadosAlProveedor).toBe(0);
      });

      it.each(['secretaria', 'administrador'] as const)('%s pasa el control de acceso (no es 401 ni 403)', async (rol) => {
        const res = await llamar(r, tokens[rol]);
        expect([401, 403]).not.toContain(res.status);
      });
    });

    it('enviar-alerta: la Secretaría y el Administrador mandan el mensaje al proveedor', async () => {
      await llamar(RUTAS_WHATSAPP[0], tokens.secretaria).expect(201);
      await llamar(RUTAS_WHATSAPP[0], tokens.administrador).expect(201);
      expect(enviadosAlProveedor).toBe(2);
    });

    it('formatear y estado responden su contenido a la Secretaría y al Administrador', async () => {
      for (const rol of ['secretaria', 'administrador'] as const) {
        const formato = await llamar(RUTAS_WHATSAPP[1], tokens[rol]).expect(201);
        expect(formato.body.ok).toBe(true);
        const estado = await llamar(RUTAS_WHATSAPP[3], tokens[rol]).expect(200);
        expect(estado.body).toEqual({ configurado: true, proveedor: 'meta' });
      }
    });

    describe('seguridad/rls', () => {
      it.each(['secretaria', 'rt_calle', 'firmante', 'ecaPortena'] as const)('%s → 403', async (rol) => {
        await llamar(RUTA_RLS, tokens[rol]).expect(403);
      });

      it('el Administrador lo ve', async () => {
        const res = await llamar(RUTA_RLS, tokens.administrador).expect(200);
        expect(res.body.usuarioActual).toBe('ascensores_app');
      });
    });
  });

  describe('criterio 3: los webhooks siguen sin sesión y rechazan lo que no viene firmado', () => {
    const cuerpoMeta = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.rf15.x', status: 'delivered', timestamp: '1790000000' }] } }] }] });
    const firmaMeta = (cuerpo: string, secreto = APP_SECRET) => `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;
    const firmaTwilio = (params: Record<string, string>, token = TWILIO_TOKEN) =>
      createHmac('sha1', token).update(Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], URL_TWILIO), 'utf8').digest('base64');
    const meta = (firma?: string) => {
      const r = http().post('/api/whatsapp/webhook/meta').set('Content-Type', 'application/json');
      return (firma ? r.set('X-Hub-Signature-256', firma) : r).send(cuerpoMeta);
    };
    const twilio = (params: Record<string, string>, firma?: string) => {
      const r = http().post('/api/whatsapp/webhook/twilio').type('form');
      return (firma ? r.set('X-Twilio-Signature', firma) : r).send(params);
    };
    const PARAMS_TWILIO = { MessageSid: 'SMrf15', MessageStatus: 'delivered' };

    it('Meta: con la firma correcta el aviso entra sin ninguna sesión', async () => {
      await meta(firmaMeta(cuerpoMeta)).expect(200);
    });

    it.each([['sin firma', undefined], ['con la firma de otro secreto', firmaMeta(cuerpoMeta, 'otro-secreto')]])('Meta %s → 401 por la firma (no por la sesión)', async (_c, firma) => {
      const res = await meta(firma).expect(401);
      expect(res.body.message).toBe(MENSAJE_FIRMA_INVALIDA);
    });

    it('Twilio: con la firma correcta el aviso entra sin ninguna sesión', async () => {
      await twilio(PARAMS_TWILIO, firmaTwilio(PARAMS_TWILIO)).expect(200);
    });

    it.each([['sin firma', undefined], ['con la firma de otro token', firmaTwilio(PARAMS_TWILIO, 'otro-token')]])('Twilio %s → 401 por la firma (no por la sesión)', async (_c, firma) => {
      const res = await twilio(PARAMS_TWILIO, firma).expect(401);
      expect(res.body.message).toBe(MENSAJE_FIRMA_INVALIDA);
    });

    it('la verificación de la suscripción de Meta responde sin sesión según el token: lo correcto devuelve el desafío y lo incorrecto, 403 (no 401)', async () => {
      const ok = await http().get('/api/whatsapp/webhook/meta').query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '12345' }).expect(200);
      expect(ok.text).toBe('12345');
      const mal = await http().get('/api/whatsapp/webhook/meta').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '12345' }).expect(403);
      expect(mal.body.message).toBe('Token de verificación inválido.');
    });
  });
});

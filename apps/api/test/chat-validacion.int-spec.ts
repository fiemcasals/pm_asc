import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ChatRepository } from '../src/chat/chat.repository';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-19 RF-04): la validación del chat contra PostgreSQL de verdad. Requiere la base levantada con `npm run db:up`.
loadEnvFileInto(process.env);

const PREFIJO = 'RF04-chat';
const UUID_QUE_NO_EXISTE = '00000000-0000-4000-8000-000000000000';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

type Sesion = { token: string; usuario: string; id: string };

describe('Chat: la validación contra PostgreSQL real (HU-19 RF-04)', () => {
  let app: INestApplication;
  let pool: Pool;
  let warn: jest.SpyInstance;
  let idEdificio = '';
  const s = {} as Record<'rt' | 'rtOtro' | 'sec' | 'eca' | 'baja', Sesion>;

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    s.rt = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-rt`, rol: 'rt_calle' });
    s.rtOtro = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-rt2`, rol: 'rt_calle' });
    s.sec = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-sec`, rol: 'secretaria' });
    s.eca = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-eca`, rol: 'eca', eca: 'MAICON Mantenimiento' });
    s.baja = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-baja`, rol: 'rt_calle' });
    await pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [s.baja.id]);
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    const edificios = (await como(s.sec)(http().get('/api/consorcios')).expect(200)).body as { id: string }[];
    idEdificio = edificios[0]?.id ?? '';
  });

  beforeEach(async () => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await limpiar();
  });

  afterEach(() => warn.mockRestore());

  async function limpiar() {
    const ids = Object.values(s).map((x) => x.id);
    await pool.query('DELETE FROM chat_mensajes WHERE emisor_id = ANY($1) OR destinatario_id = ANY($1)', [ids]);
  }

  afterAll(async () => {
    await limpiar();
    await pool.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${PREFIJO}%`]);
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());
  const como = (u: Sesion) => (r: request.Test) => r.set('Authorization', `Bearer ${u.token}`);
  const enviar = (u: Sesion, cuerpo: unknown) => como(u)(http().post('/api/chat/mensajes').send(cuerpo as object));
  const guardados = async () => Number((await pool.query('SELECT count(*) AS n FROM chat_mensajes WHERE emisor_id = ANY($1)', [Object.values(s).map((x) => x.id)])).rows[0].n);

  it('hay un edificio de demostración para probar el etiquetado', () => {
    expect(idEdificio).toMatch(/^[0-9a-f-]{36}$/);
  });

  describe('criterio 1: el destinatario de un privado', () => {
    it.each([
      ['no es un identificador', 'no-es-uuid', /destinatario no es un identificador/],
      ['es una inyección', "x'; DROP TABLE chat_mensajes; --", /destinatario no es un identificador/],
      ['no existe', UUID_QUE_NO_EXISTE, /no existe o no es un contacto/],
    ])('un destinatario que %s responde 400 con su mensaje y no guarda nada', async (_n, destinatarioId, mensaje) => {
      const res = await enviar(s.rt, { tipoSala: 'directo', destinatarioId, contenido: 'hola' }).expect(400);
      expect(String(res.body.message)).toMatch(mensaje);
      expect(await guardados()).toBe(0);
    });

    it('un destinatario inactivo (dado de baja) responde 400 y no guarda nada', async () => {
      const res = await enviar(s.rt, { tipoSala: 'directo', destinatarioId: s.baja.id, contenido: 'hola' }).expect(400);
      expect(String(res.body.message)).toMatch(/no existe o no es un contacto/);
      expect(await guardados()).toBe(0);
    });

    it('un destinatario de otro rol (una ECA, que no usa el chat) responde 400 y no guarda nada', async () => {
      const res = await enviar(s.rt, { tipoSala: 'directo', destinatarioId: s.eca.id, contenido: 'hola' }).expect(400);
      expect(String(res.body.message)).toMatch(/no existe o no es un contacto/);
      expect(await guardados()).toBe(0);
    });

    it('un destinatario que es el propio usuario sigue rechazándose', async () => {
      await enviar(s.rt, { tipoSala: 'directo', destinatarioId: s.rt.id, contenido: 'hola' }).expect(400);
      expect(await guardados()).toBe(0);
    });

    it('un contacto de verdad (otro RT, la Secretaría) se acepta', async () => {
      await enviar(s.rt, { tipoSala: 'directo', destinatarioId: s.rtOtro.id, contenido: 'hola' }).expect(201);
      await enviar(s.rt, { tipoSala: 'directo', destinatarioId: s.sec.id, contenido: 'hola' }).expect(201);
      expect(await guardados()).toBe(2);
    });
  });

  describe('el repositorio, directo contra la base', () => {
    it('nadie es contacto de sí mismo, y un usuario activo de un rol del chat sí lo es', async () => {
      const repo = app.get(ChatRepository);
      expect(await repo.esContacto(s.rt.id, s.rt.id)).toBe(false);
      expect(await repo.esContacto(s.rt.id, s.rtOtro.id)).toBe(true);
      expect(await repo.esContacto(s.rt.id, s.sec.id)).toBe(true);
      expect(await repo.esContacto(s.rt.id, s.baja.id)).toBe(false);
      expect(await repo.esContacto(s.rt.id, s.eca.id)).toBe(false);
      expect(await repo.esContacto(s.rt.id, UUID_QUE_NO_EXISTE)).toBe(false);
    });
  });

  describe('criterio 2: el tipo de sala', () => {
    it.each([['inventado', { tipoSala: 'xyz', contenido: 'hola' }], ['ausente', { contenido: 'hola' }], ['numérico', { tipoSala: 5, contenido: 'hola' }]])('un tipo de sala %s responde 400 y no guarda nada', async (_n, cuerpo) => {
      const res = await enviar(s.rt, cuerpo).expect(400);
      expect(String(res.body.message)).toMatch(/tipo de sala/);
      expect(await guardados()).toBe(0);
    });
  });

  describe('criterio 3: el edificio', () => {
    it.each([['no es un identificador', 'abc', /edificio elegido no es v[aá]lido/], ['no existe', UUID_QUE_NO_EXISTE, /edificio elegido no existe/]])('un edificio que %s responde 400 y no guarda nada', async (_n, consorcioId, mensaje) => {
      const res = await enviar(s.sec, { tipoSala: 'global', contenido: 'hola', consorcioId }).expect(400);
      expect(String(res.body.message)).toMatch(mensaje);
      expect(await guardados()).toBe(0);
    });

    it('un edificio que existe se acepta y el mensaje sale con su nombre (la Secretaría ve todos)', async () => {
      const res = await enviar(s.sec, { tipoSala: 'global', contenido: 'hola', consorcioId: idEdificio, maquinaRef: 'M1' }).expect(201);
      expect(res.body.consorcioId).toBe(idEdificio);
      expect(res.body.edificioNombre).toBeTruthy();
    });

    it('un Técnico sin ese edificio asignado no puede etiquetarlo: para él no existe (seguridad por edificio) y responde 400', async () => {
      const res = await enviar(s.rt, { tipoSala: 'global', contenido: 'hola', consorcioId: idEdificio }).expect(400);
      expect(String(res.body.message)).toMatch(/edificio elegido no existe o no está disponible/);
      expect(await guardados()).toBe(0);
    });
  });

  describe('criterio 4: el contenido', () => {
    it.each([['numérico', 123], ['un objeto', { a: 1 }]])('un contenido %s responde 400 y no guarda nada', async (_n, contenido) => {
      await enviar(s.rt, { tipoSala: 'global', contenido }).expect(400);
      expect(await guardados()).toBe(0);
    });

    it('2.001 caracteres responde 400 y 2.000 exactos se guardan completos', async () => {
      const res = await enviar(s.rt, { tipoSala: 'global', contenido: 'a'.repeat(2001) }).expect(400);
      expect(String(res.body.message)).toMatch(/no puede superar los 2000 caracteres/);
      expect(await guardados()).toBe(0);
      const ok = await enviar(s.rt, { tipoSala: 'global', contenido: 'a'.repeat(2000) }).expect(201);
      expect(ok.body.contenido).toHaveLength(2000);
    });

    it('un mensaje de 100.000 caracteres ya no entra', async () => {
      await enviar(s.rt, { tipoSala: 'global', contenido: 'a'.repeat(100_000) }).expect(400);
      expect(await guardados()).toBe(0);
    });
  });

  describe('criterio 5: el adjunto', () => {
    it.each(['javascript:alert(1)', 'http://example.com/pixel.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGgxPg=='])('un adjunto «%s» responde 400 y no guarda nada', async (adjuntoUrl) => {
      const res = await enviar(s.rt, { tipoSala: 'global', contenido: 'x', adjuntoUrl }).expect(400);
      expect(String(res.body.message)).toMatch(/adjunto tiene que ser una imagen PNG, JPEG o WEBP/);
      expect(await guardados()).toBe(0);
    });

    it('una imagen PNG en base64 se guarda con su foto', async () => {
      const res = await enviar(s.rt, { tipoSala: 'global', contenido: '', adjuntoUrl: PNG }).expect(201);
      expect(res.body.adjuntoUrl).toBe(PNG);
      expect(res.body.contenido).toBe('📷 Foto adjunta');
    });
  });

  describe('criterio 6: pedir los mensajes de una conversación', () => {
    it.each(['?sala=no-es-uuid', "?sala=' OR 1=1 --", '?sala=123'])('«%s» responde 400 y no 500', async (query) => {
      await como(s.rt)(http().get(`/api/chat/mensajes${query}`)).expect(400);
    });

    it('«global» y un identificador de compañero responden 200', async () => {
      await como(s.rt)(http().get('/api/chat/mensajes?sala=global')).expect(200);
      await como(s.rt)(http().get(`/api/chat/mensajes?sala=${s.rtOtro.id}`)).expect(200);
    });
  });
});

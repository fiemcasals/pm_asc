import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-19 RF-05): las fotos del chat van aparte del hilo, contra PostgreSQL de verdad (con la seguridad por fila puesta).
// Requiere la base levantada con `npm run db:up`.
loadEnvFileInto(process.env);

const PREFIJO = 'RF05-chat';
const bytesFoto = randomBytes(250 * 1024);
const FOTO = `data:image/jpeg;base64,${bytesFoto.toString('base64')}`;

type Sesion = { token: string; usuario: string; id: string };

describe('Chat: las fotos aparte del hilo, contra PostgreSQL real (HU-19 RF-05)', () => {
  let app: INestApplication;
  let pool: Pool;
  let warn: jest.SpyInstance;
  const s = {} as Record<'rt' | 'firmante' | 'sec', Sesion>;

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    s.rt = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-rt`, rol: 'rt_calle' });
    s.firmante = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-firmante`, rol: 'firmante' });
    s.sec = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-sec`, rol: 'secretaria' });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
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
  const binario = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    });
  // El hilo del grupo, solo con los mensajes de esta prueba (en la base puede haber otros del grupo general)
  const hiloPropio = async (u: Sesion) => {
    const res = await como(u)(http().get('/api/chat/mensajes?sala=global')).expect(200);
    return { res, mensajes: (res.body as { emisorId: string; adjuntoUrl: string | null }[]).filter((m) => m.emisorId === s.rt.id) };
  };

  it('la foto se guarda entera en la base y el mensaje lleva solo su ruta', async () => {
    const r = await enviar(s.rt, { tipoSala: 'global', contenido: 'cables', adjuntoUrl: FOTO }).expect(201);
    expect(r.body.adjuntoUrl).toBe(`/api/chat/mensajes/${r.body.id}/foto`);
    const enBase = (await pool.query('SELECT adjunto_url FROM chat_mensajes WHERE id = $1', [r.body.id])).rows[0].adjunto_url;
    expect(enBase).toBe(FOTO);
  });

  it('criterio 2: con 5 fotos, el hilo trae las rutas y no las fotos, y pesa menos de 50 KB', async () => {
    for (let i = 0; i < 5; i++) await enviar(s.rt, { tipoSala: 'global', contenido: `foto ${i + 1}`, adjuntoUrl: FOTO }).expect(201);
    const { res, mensajes } = await hiloPropio(s.firmante);
    expect(mensajes).toHaveLength(5);
    expect(mensajes.every((m) => /^\/api\/chat\/mensajes\/[0-9a-f-]{36}\/foto$/.test(m.adjuntoUrl ?? ''))).toBe(true);
    expect(res.text).not.toContain(bytesFoto.toString('base64').slice(0, 200));
    expect(Buffer.byteLength(res.text)).toBeLessThan(50 * 1024);
  });

  it('criterio 3: quien la envió y los demás del grupo obtienen la misma foto', async () => {
    const r = await enviar(s.rt, { tipoSala: 'global', contenido: '', adjuntoUrl: FOTO }).expect(201);
    for (const u of [s.rt, s.firmante, s.sec]) {
      const foto = await binario(como(u)(http().get(r.body.adjuntoUrl))).expect(200);
      expect(foto.headers['content-type']).toBe('image/jpeg');
      expect(foto.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(Buffer.compare(foto.body as Buffer, bytesFoto)).toBe(0);
    }
  });

  it('criterio 4: sin sesión 401; la foto de un privado la ven sus dos participantes y un tercero no (404)', async () => {
    const r = await enviar(s.rt, { tipoSala: 'directo', destinatarioId: s.firmante.id, contenido: '', adjuntoUrl: FOTO }).expect(201);
    await binario(http().get(r.body.adjuntoUrl)).expect(401);
    await binario(como(s.rt)(http().get(r.body.adjuntoUrl))).expect(200);
    await binario(como(s.firmante)(http().get(r.body.adjuntoUrl))).expect(200);
    const tercero = await binario(como(s.sec)(http().get(r.body.adjuntoUrl))).expect(404);
    expect(Buffer.compare(tercero.body as Buffer, bytesFoto)).not.toBe(0);
  });

  it('criterio 5: una foto de más de 600 KB responde 400 y no se guarda', async () => {
    const pesada = `data:image/jpeg;base64,${randomBytes(600 * 1024 + 1).toString('base64')}`;
    const r = await enviar(s.rt, { tipoSala: 'global', contenido: 'x', adjuntoUrl: pesada }).expect(400);
    expect(String(r.body.message)).toMatch(/demasiado pesada: puede pesar hasta 600 KB/);
    expect((await hiloPropio(s.firmante)).mensajes).toEqual([]);
  });
});

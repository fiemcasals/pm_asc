import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-19 RF-02): el hilo del chat contra PostgreSQL de verdad. Requiere la base levantada con `npm run db:up`.
loadEnvFileInto(process.env);

const PREFIJO = 'RF02-chat';
type Sesion = { token: string; usuario: string; id: string };
type Mensaje = { id: string; contenido: string };

describe('Chat: el hilo con más de 200 mensajes contra PostgreSQL real (HU-19 RF-02)', () => {
  let app: INestApplication;
  let pool: Pool;
  let warn: jest.SpyInstance;
  const s = {} as Record<'ana' | 'beto' | 'carla', Sesion>;

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    s.ana = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-ana`, rol: 'rt_calle' });
    s.beto = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-beto`, rol: 'rt_calle' });
    s.carla = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-carla`, rol: 'firmante' });
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
  const pedir = (u: Sesion, query: string) => como(u)(http().get(`/api/chat/mensajes${query}`)).expect(200);

  /** n mensajes de Ana a Beto, uno por segundo hacia atrás desde ahora: «m1» el más viejo y «m<n>» el más nuevo (alternando quién escribe). */
  async function llenarPrivado(n: number) {
    await pool.query(
      `INSERT INTO chat_mensajes (emisor_id, destinatario_id, tipo_sala, contenido, creado_en)
       SELECT CASE WHEN g % 2 = 0 THEN $1::uuid ELSE $2::uuid END, CASE WHEN g % 2 = 0 THEN $2::uuid ELSE $1::uuid END, 'directo', 'm' || g, now() - (($3::int - g) * interval '1 second')
         FROM generate_series(1, $3::int) g`,
      [s.ana.id, s.beto.id, n],
    );
  }
  const numeros = (lista: Mensaje[]) => lista.map((m) => Number(m.contenido.slice(1)));

  it('criterio 1: con 250 mensajes el chat privado muestra los 200 más nuevos, de más viejo a más nuevo, y lo ven igual los dos', async () => {
    await llenarPrivado(250);
    for (const [quien, otro] of [[s.ana, s.beto], [s.beto, s.ana]] as const) {
      const res = await pedir(quien, `?sala=${otro.id}`);
      expect(res.body).toHaveLength(200);
      expect(numeros(res.body)).toEqual(Array.from({ length: 200 }, (_, i) => 51 + i));
      expect(res.headers['x-hay-anteriores']).toBe('true');
    }
  });

  it('criterio 1: un mensaje enviado cuando ya hay más de 200 aparece al final del hilo de los dos', async () => {
    await llenarPrivado(250);
    await como(s.ana)(http().post('/api/chat/mensajes').send({ tipoSala: 'directo', destinatarioId: s.beto.id, contenido: 'el más nuevo' })).expect(201);
    for (const [quien, otro] of [[s.ana, s.beto], [s.beto, s.ana]] as const) {
      const res = await pedir(quien, `?sala=${otro.id}`);
      expect(res.body).toHaveLength(200);
      expect(res.body[199].contenido).toBe('el más nuevo');
    }
  });

  it('criterio 2: el último mensaje del hilo es el que la lista de chats muestra como último', async () => {
    await llenarPrivado(230);
    const hilo = await pedir(s.beto, `?sala=${s.ana.id}`);
    const canales = (await como(s.beto)(http().get('/api/chat/canales')).expect(200)).body as { id: string; ultimoMensaje?: string }[];
    expect(canales.find((c) => c.id === s.ana.id)?.ultimoMensaje).toBe(hilo.body[hilo.body.length - 1].contenido);
    expect(canales.find((c) => c.id === s.ana.id)?.ultimoMensaje).toBe('m230');
  });

  it('criterio 3: con el id del más viejo que se ve trae los 200 anteriores, sin repetir ni saltear ninguno, y avisa cuándo no quedan más', async () => {
    await llenarPrivado(450);
    const primera = await pedir(s.ana, `?sala=${s.beto.id}`);
    expect(numeros(primera.body)[0]).toBe(251);
    const segunda = await pedir(s.ana, `?sala=${s.beto.id}&antes=${primera.body[0].id}`);
    expect(numeros(segunda.body)).toEqual(Array.from({ length: 200 }, (_, i) => 51 + i));
    expect(segunda.headers['x-hay-anteriores']).toBe('true');
    const tercera = await pedir(s.ana, `?sala=${s.beto.id}&antes=${segunda.body[0].id}`);
    expect(numeros(tercera.body)).toEqual(Array.from({ length: 50 }, (_, i) => 1 + i));
    expect(tercera.headers['x-hay-anteriores']).toBe('false');
  });

  it('con exactamente 200 mensajes no hay anteriores', async () => {
    await llenarPrivado(200);
    const res = await pedir(s.ana, `?sala=${s.beto.id}`);
    expect(res.body).toHaveLength(200);
    expect(res.headers['x-hay-anteriores']).toBe('false');
  });

  it('mensajes con la MISMA fecha: paginar de a 2 los recorre todos una sola vez y en el mismo orden que el último de la lista', async () => {
    await pool.query(
      `INSERT INTO chat_mensajes (emisor_id, destinatario_id, tipo_sala, contenido, creado_en)
       SELECT $1::uuid, $2::uuid, 'directo', 'm' || g, '2026-01-01T10:00:00Z' FROM generate_series(1, 7) g`,
      [s.ana.id, s.beto.id],
    );
    const vistos: string[] = [];
    let antes = '';
    let ultimoDeLaPrimera = '';
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const res = await pedir(s.ana, `?sala=${s.beto.id}&limite=2${antes ? `&antes=${antes}` : ''}`);
      if (vuelta === 0) ultimoDeLaPrimera = res.body[res.body.length - 1].contenido;
      vistos.unshift(...res.body.map((m: Mensaje) => m.contenido));
      if (res.headers['x-hay-anteriores'] !== 'true') break;
      antes = res.body[0].id;
    }
    expect([...vistos].sort()).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']);
    expect(new Set(vistos).size).toBe(7);
    const canales = (await como(s.ana)(http().get('/api/chat/canales')).expect(200)).body as { id: string; ultimoMensaje?: string }[];
    expect(canales.find((c) => c.id === s.beto.id)?.ultimoMensaje).toBe(ultimoDeLaPrimera);
  });

  it('el grupo general también muestra los más nuevos: con más de 200 mensajes, el último que se envía aparece', async () => {
    await pool.query(
      `INSERT INTO chat_mensajes (emisor_id, tipo_sala, contenido, creado_en)
       SELECT $1::uuid, 'global', 'g' || g, now() - ((210 - g) * interval '1 second') FROM generate_series(1, 210) g`,
      [s.ana.id],
    );
    await como(s.carla)(http().post('/api/chat/mensajes').send({ tipoSala: 'global', contenido: 'g-ultimo' })).expect(201);
    const res = await pedir(s.beto, '?sala=global');
    expect(res.body).toHaveLength(200);
    expect(res.body[199].contenido).toBe('g-ultimo');
    expect(res.headers['x-hay-anteriores']).toBe('true');
    const canales = (await como(s.beto)(http().get('/api/chat/canales')).expect(200)).body as { id: string; ultimoMensaje?: string }[];
    expect(canales[0].ultimoMensaje).toBe('g-ultimo'); // la lista de chats muestra el mismo último mensaje del grupo
  });

  it('criterio 2 con la MISMA fecha en el grupo: el último de la lista es el mismo que cierra el hilo (se desempata por id)', async () => {
    await pool.query(
      `INSERT INTO chat_mensajes (id, emisor_id, tipo_sala, contenido, creado_en)
       VALUES ('00000000-0000-4000-8000-0000000000a1', $1, 'global', 'empate 1', '2999-01-01T00:00:00Z'),
              ('00000000-0000-4000-8000-0000000000a3', $1, 'global', 'empate 3', '2999-01-01T00:00:00Z'),
              ('00000000-0000-4000-8000-0000000000a2', $1, 'global', 'empate 2', '2999-01-01T00:00:00Z')`,
      [s.ana.id],
    );
    const hilo = await pedir(s.beto, '?sala=global');
    expect(hilo.body.slice(-3).map((m: Mensaje) => m.contenido)).toEqual(['empate 1', 'empate 2', 'empate 3']);
    const canales = (await como(s.beto)(http().get('/api/chat/canales')).expect(200)).body as { id: string; ultimoMensaje?: string }[];
    expect(canales[0].ultimoMensaje).toBe('empate 3');
  });

  it('lo anterior es de la misma conversación: pedir con «antes» desde un privado ajeno no trae mensajes de otra', async () => {
    await llenarPrivado(5);
    await como(s.carla)(http().post('/api/chat/mensajes').send({ tipoSala: 'directo', destinatarioId: s.beto.id, contenido: 'otro privado' })).expect(201);
    const delPrivadoAjeno = await pedir(s.carla, `?sala=${s.beto.id}`);
    // Ana pide «antes» de un mensaje de OTRA conversación: solo obtiene lo suyo con Beto que sea anterior en el tiempo
    const res = await pedir(s.ana, `?sala=${s.beto.id}&antes=${delPrivadoAjeno.body[0].id}`);
    expect(res.body.every((m: Mensaje) => /^m\d$/.test(m.contenido))).toBe(true);
  });

  it('pedidos inválidos: 400 y no 500', async () => {
    for (const q of ['?sala=global&antes=abc', '?sala=global&limite=0', '?sala=global&limite=201', '?sala=global&limite=x']) {
      await como(s.ana)(http().get(`/api/chat/mensajes${q}`)).expect(400);
    }
  });
});

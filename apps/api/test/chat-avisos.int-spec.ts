import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { ChatRepository } from '../src/chat/chat.repository';
import { runWithRlsContext } from '../src/database/rls-context';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-19 RF-10): el resumen de lo no leído para avisar en el navegador, contra PostgreSQL de verdad.
loadEnvFileInto(process.env);

const PREFIJO = 'RF10-chat';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
type Sesion = { token: string; usuario: string; id: string };
type Resumen = { total: number; conversaciones: { sala: string; noLeidos: number; ultimoMensaje: { id: string; emisorNombre: string; contenido: string; conFoto: boolean; creadoEn: string } }[] };

describe('Chat: el resumen para avisar contra PostgreSQL real (HU-19 RF-10)', () => {
  let app: INestApplication;
  let pool: Pool;
  let warn: jest.SpyInstance;
  const s = {} as Record<'ana' | 'beto' | 'carla' | 'eca', Sesion>;

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    s.ana = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-ana`, rol: 'rt_calle' });
    s.beto = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-beto`, rol: 'rt_calle' });
    s.carla = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-carla`, rol: 'firmante' });
    s.eca = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-eca`, rol: 'eca', eca: 'MAICON Mantenimiento' });
    await pool.query('UPDATE usuarios SET nombre = $2 WHERE id = $1', [s.ana.id, 'Ana Gómez']);
    await pool.query('UPDATE usuarios SET nombre = $2 WHERE id = $1', [s.carla.id, 'Carla Díaz']);
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
    await pool.query('DELETE FROM chat_lecturas WHERE usuario_id = ANY($1)', [ids]);
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
  const alGrupo = async (u: Sesion, contenido: string, adjuntoUrl?: string) => (await como(u)(http().post('/api/chat/mensajes').send({ tipoSala: 'global', contenido, adjuntoUrl })).expect(201)).body as { id: string };
  const aPrivado = async (u: Sesion, para: Sesion, contenido: string, adjuntoUrl?: string) =>
    (await como(u)(http().post('/api/chat/mensajes').send({ tipoSala: 'directo', destinatarioId: para.id, contenido, adjuntoUrl })).expect(201)).body as { id: string };
  const resumen = async (u: Sesion) => (await como(u)(http().get('/api/chat/no-leidos')).expect(200)).body as Resumen;

  it('el total de siempre y, además, de cada conversación con algo sin leer, el último mensaje de otra persona con su nombre real', async () => {
    await alGrupo(s.ana, 'g1');
    const g2 = await alGrupo(s.carla, 'g2 de Carla');
    await aPrivado(s.ana, s.beto, 'p1');
    const p2 = await aPrivado(s.ana, s.beto, 'p2 de Ana');
    const r = await resumen(s.beto);
    expect(r.total).toBe(4);
    expect(r.conversaciones.map((c) => c.sala)).toEqual(['global', s.ana.id]);
    expect(r.conversaciones[0]).toMatchObject({ noLeidos: 2, ultimoMensaje: { id: g2.id, emisorNombre: 'Carla Díaz', contenido: 'g2 de Carla', conFoto: false } });
    expect(r.conversaciones[1]).toMatchObject({ noLeidos: 2, ultimoMensaje: { id: p2.id, emisorNombre: 'Ana Gómez', contenido: 'p2 de Ana' } });
    expect(new Date(r.conversaciones[1].ultimoMensaje.creadoEn).toString()).not.toBe('Invalid Date');
  });

  it('una foto viaja como «conFoto» y NUNCA la imagen (la respuesta sigue siendo chica)', async () => {
    await aPrivado(s.ana, s.beto, '', PNG);
    const r = await resumen(s.beto);
    expect(r.conversaciones[0].ultimoMensaje).toMatchObject({ contenido: '📷 Foto adjunta', conFoto: true });
    expect(JSON.stringify(r)).not.toContain('base64');
    expect(JSON.stringify(r).length).toBeLessThan(1000);
  });

  it('un texto largo viaja recortado a 200 caracteres', async () => {
    await aPrivado(s.ana, s.beto, 'x'.repeat(1500));
    expect((await resumen(s.beto)).conversaciones[0].ultimoMensaje.contenido).toHaveLength(200);
  });

  it('lo que uno mismo escribió no aparece, y lo último de otro sí aunque después haya escrito uno mismo', async () => {
    await aPrivado(s.ana, s.beto, 'de Ana');
    await aPrivado(s.beto, s.ana, 'respuesta de Beto');
    expect((await resumen(s.beto)).conversaciones[0].ultimoMensaje.contenido).toBe('de Ana');
    expect(JSON.stringify(await resumen(s.beto))).not.toContain('respuesta de Beto');
    expect((await resumen(s.ana)).conversaciones[0].ultimoMensaje.contenido).toBe('respuesta de Beto');
  });

  it('con la MISMA fecha el último es el mismo que desempata el hilo (el de mayor identificador)', async () => {
    await pool.query(
      `INSERT INTO chat_mensajes (id, emisor_id, tipo_sala, contenido, creado_en)
       VALUES ('00000000-0000-4000-8000-0000000000d1', $1, 'global', 'e1', '2999-01-01T00:00:00Z'),
              ('00000000-0000-4000-8000-0000000000d3', $1, 'global', 'e3', '2999-01-01T00:00:00Z'),
              ('00000000-0000-4000-8000-0000000000d2', $1, 'global', 'e2', '2999-01-01T00:00:00Z')`,
      [s.ana.id],
    );
    expect((await resumen(s.beto)).conversaciones[0].ultimoMensaje.contenido).toBe('e3');
  });

  it('una conversación leída deja de aparecer y un mensaje nuevo vuelve a aparecer con su id', async () => {
    const m1 = await aPrivado(s.ana, s.beto, 'p1');
    await como(s.beto)(http().post('/api/chat/lecturas').send({ sala: s.ana.id, hasta: m1.id })).expect(200);
    expect(await resumen(s.beto)).toMatchObject({ total: 0, conversaciones: [] });
    const m2 = await aPrivado(s.ana, s.beto, 'p2');
    expect((await resumen(s.beto)).conversaciones[0].ultimoMensaje.id).toBe(m2.id);
  });

  it('privacidad: un tercero no recibe nada de los privados de otros', async () => {
    await aPrivado(s.ana, s.beto, 'secreto');
    await aPrivado(s.beto, s.ana, 'otro secreto');
    expect(await resumen(s.carla)).toMatchObject({ total: 0, conversaciones: [] });
  });

  it('lo que escribió un usuario dado de baja no aparece (no figura en la lista)', async () => {
    await aPrivado(s.ana, s.beto, 'p1');
    await alGrupo(s.carla, 'g1');
    await pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [s.ana.id]);
    try {
      const r = await resumen(s.beto);
      expect(r.conversaciones.map((c) => c.sala)).toEqual(['global']);
      expect(r.total).toBe(1);
    } finally {
      await pool.query('UPDATE usuarios SET activo = true WHERE id = $1', [s.ana.id]);
    }
  });

  it('el repositorio, directo contra la base: null si nadie más escribió en esa conversación, y el último de otro si lo hay', async () => {
    const repo = app.get(ChatRepository);
    const comoBeto = <T>(trabajo: () => Promise<T>) => runWithRlsContext({ eca: null, rol: 'rt_calle', usuario: s.beto.usuario, esExplicito: true }, trabajo);
    expect(await comoBeto(() => repo.ultimoDeOtros(s.beto.id, s.ana.id))).toBeNull();
    await alGrupo(s.beto, 'mío');
    await aPrivado(s.beto, s.ana, 'mío también');
    // lo propio no cuenta: en el grupo (donde puede haber mensajes viejos de otros) nunca devuelve el de Beto
    expect((await comoBeto(() => repo.ultimoDeOtros(s.beto.id, 'global')))?.contenido).not.toBe('mío');
    expect(await comoBeto(() => repo.ultimoDeOtros(s.beto.id, s.ana.id))).toBeNull();
    const m = await aPrivado(s.ana, s.beto, 'de Ana');
    expect(await comoBeto(() => repo.ultimoDeOtros(s.beto.id, s.ana.id))).toMatchObject({ id: m.id, emisorNombre: 'Ana Gómez', contenido: 'de Ana', conFoto: false });
  });

  it('la ECA sigue sin chat (403)', async () => {
    await como(s.eca)(http().get('/api/chat/no-leidos')).expect(403);
  });
});

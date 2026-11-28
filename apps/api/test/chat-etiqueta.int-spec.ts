import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-19 RF-07): la etiqueta de edificio de un mensaje la ven todos los que pueden leerlo, también un Técnico o un Firmante que
// no está asignado a ese edificio (la seguridad por edificio está puesta). Requiere la base levantada con `npm run db:up` y los datos de demo.
loadEnvFileInto(process.env);

const PREFIJO = 'RF07-chat';
type Sesion = { token: string; usuario: string; id: string };

describe('Chat: la etiqueta de edificio, contra PostgreSQL real (HU-19 RF-07)', () => {
  let app: INestApplication;
  let pool: Pool;
  let warn: jest.SpyInstance;
  let edificio = { id: '', nombre: '' };
  const s = {} as Record<'sec' | 'rt' | 'firmante', Sesion>;

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    s.sec = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-sec`, rol: 'secretaria' });
    s.rt = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-rt`, rol: 'rt_calle' });
    s.firmante = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-firmante`, rol: 'firmante' });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    const edificios = (await como(s.sec)(http().get('/api/consorcios')).expect(200)).body as { id: string; nombre: string }[];
    edificio = edificios[0];
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
  const delGrupo = async (u: Sesion, id: string) =>
    ((await como(u)(http().get('/api/chat/mensajes?sala=global')).expect(200)).body as { id: string; edificioNombre: string | null; maquinaRef: string | null }[]).find((m) => m.id === id);

  it('hay un edificio de demostración y ni el Técnico ni el Firmante temporales lo tienen asignado (no lo ven)', async () => {
    expect(edificio?.id).toMatch(/^[0-9a-f-]{36}$/);
    for (const u of [s.rt, s.firmante]) {
      const suyos = (await como(u)(http().get('/api/consorcios')).expect(200)).body as { id: string }[];
      expect(suyos.map((e) => e.id)).not.toContain(edificio.id);
    }
  });

  it('criterio 2: el nombre se guarda con el mensaje', async () => {
    const r = await enviar(s.sec, { tipoSala: 'global', contenido: 'revisar cables', consorcioId: edificio.id, maquinaRef: 'M1' }).expect(201);
    expect(r.body).toMatchObject({ consorcioId: edificio.id, edificioNombre: edificio.nombre, maquinaRef: 'M1' });
    const fila = (await pool.query('SELECT edificio_nombre FROM chat_mensajes WHERE id = $1', [r.body.id])).rows[0];
    expect(fila.edificio_nombre).toBe(edificio.nombre);
  });

  it('criterio 2: un Técnico y un Firmante que no están asignados a ese edificio ven la etiqueta igual que quien la puso', async () => {
    const r = await enviar(s.sec, { tipoSala: 'global', contenido: 'revisar cables', consorcioId: edificio.id, maquinaRef: 'M2' }).expect(201);
    for (const u of [s.sec, s.rt, s.firmante]) {
      expect(await delGrupo(u, r.body.id)).toMatchObject({ edificioNombre: edificio.nombre, maquinaRef: 'M2' });
    }
  });

  it('criterio 2: también en un privado (la Secretaría le escribe al Técnico)', async () => {
    const r = await enviar(s.sec, { tipoSala: 'directo', destinatarioId: s.rt.id, contenido: 'mirá este', consorcioId: edificio.id }).expect(201);
    const hilo = (await como(s.rt)(http().get(`/api/chat/mensajes?sala=${s.sec.id}`)).expect(200)).body as { id: string; edificioNombre: string | null }[];
    expect(hilo.find((m) => m.id === r.body.id)?.edificioNombre).toBe(edificio.nombre);
  });

  it('criterio 1: un mensaje sin edificio sale sin etiqueta', async () => {
    const r = await enviar(s.sec, { tipoSala: 'global', contenido: 'sin edificio' }).expect(201);
    expect(await delGrupo(s.rt, r.body.id)).toMatchObject({ edificioNombre: null, maquinaRef: null });
  });

  it('criterio 3: la máquina sin edificio no se guarda', async () => {
    const r = await enviar(s.sec, { tipoSala: 'global', contenido: 'solo máquina', maquinaRef: 'M1' }).expect(201);
    expect(r.body.maquinaRef).toBeNull();
  });

  it('criterio 4: quien no ve el edificio no lo puede elegir (400) y no se guarda nada', async () => {
    const r = await enviar(s.rt, { tipoSala: 'global', contenido: 'hola', consorcioId: edificio.id }).expect(400);
    expect(String(r.body.message)).toMatch(/no existe o no está disponible para vos/);
    expect((await pool.query('SELECT count(*)::int AS n FROM chat_mensajes WHERE emisor_id = $1', [s.rt.id])).rows[0].n).toBe(0);
  });

  it('la migración 040 dejó la columna y los mensajes viejos con edificio tienen su nombre', async () => {
    const col = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_mensajes' AND column_name = 'edificio_nombre'`);
    expect(col.rowCount).toBe(1);
    const sinNombre = await pool.query(`SELECT count(*)::int AS n FROM chat_mensajes m JOIN consorcios c ON c.id = m.consorcio_id WHERE m.edificio_nombre IS NULL`);
    expect(sinNombre.rows[0].n).toBe(0);
  });
});

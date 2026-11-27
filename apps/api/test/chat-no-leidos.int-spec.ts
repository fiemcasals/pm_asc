import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ChatRepository } from '../src/chat/chat.repository';
import { runWithRlsContext } from '../src/database/rls-context';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-19 RF-09): los no leídos del chat contra PostgreSQL de verdad. Requiere la base levantada con `npm run db:up`.
loadEnvFileInto(process.env);

const PREFIJO = 'RF09-chat';
type Sesion = { token: string; usuario: string; id: string };
type Canal = { id: string; noLeidos: number };

describe('Chat: los no leídos contra PostgreSQL real (HU-19 RF-09)', () => {
  let app: INestApplication;
  let pool: Pool;
  let warn: jest.SpyInstance;
  const s = {} as Record<'ana' | 'beto' | 'carla' | 'dora' | 'eca', Sesion>;

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    s.ana = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-ana`, rol: 'rt_calle' });
    s.beto = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-beto`, rol: 'rt_calle' });
    s.carla = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-carla`, rol: 'firmante' });
    s.dora = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-dora`, rol: 'secretaria' });
    s.eca = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-eca`, rol: 'eca', eca: 'MAICON Mantenimiento' });
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
  const alGrupo = async (u: Sesion, contenido: string) => (await como(u)(http().post('/api/chat/mensajes').send({ tipoSala: 'global', contenido })).expect(201)).body as { id: string };
  const aPrivado = async (u: Sesion, para: Sesion, contenido: string) =>
    (await como(u)(http().post('/api/chat/mensajes').send({ tipoSala: 'directo', destinatarioId: para.id, contenido })).expect(201)).body as { id: string };
  const canales = async (u: Sesion) => (await como(u)(http().get('/api/chat/canales')).expect(200)).body as Canal[];
  const delCanal = async (u: Sesion, id: string) => (await canales(u)).find((c) => c.id === id)?.noLeidos;
  const total = async (u: Sesion) => ((await como(u)(http().get('/api/chat/no-leidos')).expect(200)).body as { total: number }).total;
  // Llamar al repositorio directo, sin pasar por un pedido: se le pone el contexto de seguridad de ese usuario, como haría la sesión
  const sinPedido = <T>(u: Sesion, trabajo: () => Promise<T>) => runWithRlsContext({ eca: null, rol: 'rt_calle', usuario: u.usuario, esExplicito: true }, trabajo);
  const leer = (u: Sesion, sala: string, hasta: string) => como(u)(http().post('/api/chat/lecturas').send({ sala, hasta }));

  describe('el repositorio, directo contra la base', () => {
    it('sin mensajes no hay nada sin leer: el resultado está vacío (ni «global: 0» ni claves de más)', async () => {
      expect(await sinPedido(s.beto, () => app.get(ChatRepository).contarNoLeidos(s.beto.id))).toEqual({});
    });

    it('solo aparecen las conversaciones con algo sin leer, y lo que uno escribe no genera una clave propia', async () => {
      const repo = app.get(ChatRepository);
      await aPrivado(s.ana, s.beto, 'p1');
      await aPrivado(s.beto, s.ana, 'mío');
      expect(await sinPedido(s.beto, () => repo.contarNoLeidos(s.beto.id))).toEqual({ [s.ana.id]: 1 });
      expect(await sinPedido(s.ana, () => repo.contarNoLeidos(s.ana.id))).toEqual({ [s.beto.id]: 1 });
      expect(await sinPedido(s.carla, () => repo.contarNoLeidos(s.carla.id))).toEqual({});
    });

    it('cada conversación cuenta con su propio punto de lectura: haber leído otras no cambia el contador de una nueva', async () => {
      const g = await alGrupo(s.ana, 'g1');
      const p = await aPrivado(s.ana, s.beto, 'p1');
      await leer(s.beto, 'global', g.id).expect(200);
      await leer(s.beto, s.ana.id, p.id).expect(200);
      await aPrivado(s.carla, s.beto, 'c1');
      await aPrivado(s.carla, s.beto, 'c2');
      expect(await delCanal(s.beto, s.carla.id)).toBe(2);
      expect(await total(s.beto)).toBe(2);
      await alGrupo(s.carla, 'g2');
      expect(await delCanal(s.beto, 'global')).toBe(1);
    });
  });

  describe('criterio 1: el contador de cada conversación', () => {
    it('cuenta el grupo y los privados que le escribieron, cada uno en su conversación', async () => {
      await alGrupo(s.ana, 'g1');
      await alGrupo(s.ana, 'g2');
      await alGrupo(s.carla, 'g3');
      await aPrivado(s.ana, s.beto, 'p1');
      await aPrivado(s.ana, s.beto, 'p2');
      await aPrivado(s.dora, s.beto, 'p3');
      expect(await delCanal(s.beto, 'global')).toBe(3);
      expect(await delCanal(s.beto, s.ana.id)).toBe(2);
      expect(await delCanal(s.beto, s.dora.id)).toBe(1);
      expect(await delCanal(s.beto, s.carla.id)).toBe(0);
    });

    it('un mensaje nuevo suma uno', async () => {
      await aPrivado(s.ana, s.beto, 'a');
      expect(await delCanal(s.beto, s.ana.id)).toBe(1);
      await aPrivado(s.ana, s.beto, 'b');
      expect(await delCanal(s.beto, s.ana.id)).toBe(2);
    });

    it('la lista sigue empezando por el grupo y todos los contadores son números', async () => {
      await aPrivado(s.ana, s.beto, 'hola');
      const lista = await canales(s.beto);
      expect(lista[0].id).toBe('global');
      expect(lista.every((c) => typeof c.noLeidos === 'number')).toBe(true);
    });
  });

  describe('criterio 2: el total', () => {
    it('suma el grupo y los privados', async () => {
      await alGrupo(s.ana, 'g1');
      await aPrivado(s.ana, s.beto, 'p1');
      await aPrivado(s.dora, s.beto, 'p2');
      expect(await total(s.beto)).toBe(3);
    });

    it('lo que escribió un usuario dado de baja no cuenta en el total', async () => {
      await aPrivado(s.ana, s.beto, 'p1');
      await alGrupo(s.carla, 'g1');
      await pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [s.ana.id]);
      try {
        expect(await total(s.beto)).toBe(1);
      } finally {
        await pool.query('UPDATE usuarios SET activo = true WHERE id = $1', [s.ana.id]);
      }
    });

    it('la ECA no tiene chat: 403', async () => {
      await como(s.eca)(http().get('/api/chat/no-leidos')).expect(403);
      await como(s.eca)(http().post('/api/chat/lecturas').send({ sala: 'global', hasta: '00000000-0000-4000-8000-000000000000' })).expect(403);
    });
  });

  describe('criterio 3: al leer una conversación su contador vuelve a cero, y lo propio no cuenta', () => {
    it('lo que uno mismo envía nunca cuenta', async () => {
      await alGrupo(s.beto, 'mío');
      await aPrivado(s.beto, s.ana, 'mío también');
      expect(await total(s.beto)).toBe(0);
      expect(await delCanal(s.beto, 'global')).toBe(0);
    });

    it('marcar leído hasta el último deja la conversación en cero, devuelve lo que queda y el total, y no toca las demás', async () => {
      await alGrupo(s.carla, 'g1');
      await aPrivado(s.ana, s.beto, 'p1');
      const ultimo = await aPrivado(s.ana, s.beto, 'p2');
      const res = await leer(s.beto, s.ana.id, ultimo.id).expect(200);
      expect(res.body).toEqual({ sala: s.ana.id, noLeidos: 0, total: 1 });
      expect(await delCanal(s.beto, s.ana.id)).toBe(0);
      expect(await delCanal(s.beto, 'global')).toBe(1);
    });

    it('un mensaje que llega después de leer vuelve a contar', async () => {
      const m = await aPrivado(s.ana, s.beto, 'p1');
      await leer(s.beto, s.ana.id, m.id).expect(200);
      await aPrivado(s.ana, s.beto, 'p2');
      expect(await delCanal(s.beto, s.ana.id)).toBe(1);
    });

    it('leer hasta uno intermedio deja sin leer los posteriores, y la lectura solo avanza', async () => {
      const m1 = await alGrupo(s.ana, 'g1');
      await alGrupo(s.ana, 'g2');
      const m3 = await alGrupo(s.ana, 'g3');
      expect((await leer(s.beto, 'global', m1.id).expect(200)).body.noLeidos).toBe(2);
      await leer(s.beto, 'global', m3.id).expect(200);
      expect(await delCanal(s.beto, 'global')).toBe(0);
      expect((await leer(s.beto, 'global', m1.id).expect(200)).body.noLeidos).toBe(0);
      expect(await delCanal(s.beto, 'global')).toBe(0);
    });

    it('mensajes con la MISMA fecha: leer hasta uno deja los otros según el desempate por id, sin perder ni repetir ninguno', async () => {
      await pool.query(
        `INSERT INTO chat_mensajes (id, emisor_id, tipo_sala, contenido, creado_en)
         VALUES ('00000000-0000-4000-8000-0000000000b1', $1, 'global', 'e1', '2999-01-01T00:00:00Z'),
                ('00000000-0000-4000-8000-0000000000b2', $1, 'global', 'e2', '2999-01-01T00:00:00Z'),
                ('00000000-0000-4000-8000-0000000000b3', $1, 'global', 'e3', '2999-01-01T00:00:00Z')`,
        [s.ana.id],
      );
      expect(await delCanal(s.beto, 'global')).toBe(3);
      expect((await leer(s.beto, 'global', '00000000-0000-4000-8000-0000000000b2').expect(200)).body.noLeidos).toBe(1);
      expect((await leer(s.beto, 'global', '00000000-0000-4000-8000-0000000000b3').expect(200)).body.noLeidos).toBe(0);
    });

    it('el identificador de la conversación puede venir en mayúsculas', async () => {
      const m = await aPrivado(s.ana, s.beto, 'p1');
      const res = await leer(s.beto, s.ana.id.toUpperCase(), m.id.toUpperCase()).expect(200);
      expect(res.body.sala).toBe(s.ana.id);
      expect(res.body.noLeidos).toBe(0);
    });

    it('lo leído se guarda una sola vez por usuario y conversación', async () => {
      const m1 = await alGrupo(s.ana, 'g1');
      const m2 = await alGrupo(s.ana, 'g2');
      await leer(s.beto, 'global', m1.id).expect(200);
      await leer(s.beto, 'global', m2.id).expect(200);
      const filas = await pool.query('SELECT leido_id FROM chat_lecturas WHERE usuario_id = $1', [s.beto.id]);
      expect(filas.rows).toEqual([{ leido_id: m2.id }]);
    });
  });

  describe('criterio 4: lo leído vive en el servidor, por usuario', () => {
    it('al ingresar de nuevo (otra sesión, otro dispositivo) los contadores son los mismos', async () => {
      await alGrupo(s.ana, 'g1');
      await aPrivado(s.ana, s.beto, 'p1');
      const p2 = await aPrivado(s.ana, s.beto, 'p2');
      await leer(s.beto, s.ana.id, p2.id).expect(200);
      const antes = await canales(s.beto);
      // otra sesión del mismo usuario: se ingresa con usuario y contraseña, como desde otro dispositivo
      const login = await http().post('/api/auth/login').send({ usuario: s.beto.usuario, password: 'Clave-Segura-2026' }).expect(200);
      const otroDispositivo = { ...s.beto, token: login.body.accessToken };
      expect(otroDispositivo.token).not.toBe(s.beto.token);
      expect(await canales(otroDispositivo)).toEqual(antes);
      expect(await total(otroDispositivo)).toBe(await total(s.beto));
      expect(await delCanal(otroDispositivo, 'global')).toBe(1);
      expect(await delCanal(otroDispositivo, s.ana.id)).toBe(0);
    });

    it('lo que lee un usuario no lo lee otro', async () => {
      const m = await alGrupo(s.ana, 'g1');
      await leer(s.beto, 'global', m.id).expect(200);
      expect(await delCanal(s.beto, 'global')).toBe(0);
      expect(await delCanal(s.carla, 'global')).toBe(1);
    });

    it('un usuario nuevo no acumula lo que se escribió en el grupo antes de que existiera', async () => {
      await pool.query(
        `INSERT INTO chat_mensajes (emisor_id, tipo_sala, contenido, creado_en) VALUES ($1, 'global', 'de antes', now() - interval '2 days'), ($1, 'global', 'de antes también', now() - interval '1 day')`,
        [s.ana.id],
      );
      expect(await delCanal(s.beto, 'global')).toBe(0);
      await alGrupo(s.ana, 'de ahora');
      expect(await delCanal(s.beto, 'global')).toBe(1);
    });

    it('al leer, el punto queda guardado en chat_lecturas con la fecha y el id del mensaje', async () => {
      const m = await aPrivado(s.ana, s.beto, 'p1');
      await leer(s.beto, s.ana.id, m.id).expect(200);
      const fila = (await pool.query('SELECT sala, leido_id FROM chat_lecturas WHERE usuario_id = $1', [s.beto.id])).rows[0];
      expect(fila).toEqual({ sala: s.ana.id, leido_id: m.id });
    });
  });

  describe('criterio 5: nadie cuenta ni lee lo ajeno', () => {
    it('un tercero no tiene contadores por los privados de otros y su total no los suma', async () => {
      await aPrivado(s.ana, s.beto, 'secreto 1');
      await aPrivado(s.beto, s.ana, 'secreto 2');
      expect(await total(s.carla)).toBe(0);
      expect((await canales(s.carla)).every((c) => c.noLeidos === 0)).toBe(true);
      expect((await canales(s.dora)).every((c) => c.noLeidos === 0)).toBe(true);
    });

    it('el total de cada uno suma el grupo y SOLO sus propios privados', async () => {
      await alGrupo(s.ana, 'g1');
      await aPrivado(s.ana, s.beto, 'ana a beto');
      await aPrivado(s.ana, s.carla, 'ana a carla');
      await aPrivado(s.dora, s.carla, 'dora a carla');
      expect(await total(s.beto)).toBe(2); // el grupo + el de Ana
      expect(await total(s.carla)).toBe(3); // el grupo + el de Ana + el de Dora
      expect(await total(s.dora)).toBe(1); // solo el grupo
      expect(await total(s.ana)).toBe(0); // ella escribió todo
    });

    it('un tercero no puede marcar leído un mensaje de un privado ajeno (400)', async () => {
      const m = await aPrivado(s.ana, s.beto, 'secreto');
      await leer(s.carla, s.ana.id, m.id).expect(400);
      await leer(s.carla, s.beto.id, m.id).expect(400);
      await leer(s.carla, 'global', m.id).expect(400);
      expect(await delCanal(s.beto, s.ana.id)).toBe(1); // y no se movió nada
      const filas = await pool.query('SELECT 1 FROM chat_lecturas WHERE usuario_id = $1', [s.carla.id]);
      expect(filas.rowCount).toBe(0);
    });

    it('un mensaje del grupo no se puede marcar como leído en un privado, ni al revés', async () => {
      const g = await alGrupo(s.ana, 'g1');
      const p = await aPrivado(s.ana, s.beto, 'p1');
      await leer(s.beto, s.ana.id, g.id).expect(400);
      await leer(s.beto, 'global', p.id).expect(400);
    });
  });

  describe('pedidos inválidos: 400 y no 500', () => {
    it.each([
      ['sin conversación', { hasta: '00000000-0000-4000-8000-000000000000' }],
      ['conversación inválida', { sala: 'abc', hasta: '00000000-0000-4000-8000-000000000000' }],
      ['sin mensaje', { sala: 'global' }],
      ['mensaje inválido', { sala: 'global', hasta: "x'; DROP TABLE chat_lecturas; --" }],
      ['mensaje inexistente', { sala: 'global', hasta: '00000000-0000-4000-8000-000000000000' }],
    ])('%s', async (_n, cuerpo) => {
      await como(s.beto)(http().post('/api/chat/lecturas').send(cuerpo)).expect(400);
    });
  });
});

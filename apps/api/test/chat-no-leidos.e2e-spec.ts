import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { ChatRepository, InMemoryChatRepository } from '../src/chat/chat.repository';
import { createTestApp } from './create-test-app';
import { bearer, crearSesiones, NombreSesion, PASSWORD_E2E, USUARIO_DE } from './sesiones-e2e';

// HU-19 RF-09 — por la API real (sesiones de verdad): contadores en la lista, total, y marcar leído.
describe('Chat: no leídos, por la API (HU-19 RF-09)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;
  const ids = {} as Record<'rt_calle' | 'firmante' | 'administrador' | 'secretaria', string>;

  beforeEach(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
    // Los contactos del chat en memoria son los usuarios de la sesión, para poder escribirse entre ellos
    for (const rol of ['rt_calle', 'firmante', 'administrador', 'secretaria'] as const) {
      const res = await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: USUARIO_DE[rol], password: PASSWORD_E2E });
      ids[rol] = res.body.usuario.id;
    }
    (app.get(ChatRepository) as InMemoryChatRepository).setContactos(
      (['rt_calle', 'firmante', 'administrador', 'secretaria'] as const).map((rol) => ({ id: ids[rol], usuario: USUARIO_DE[rol], nombre: USUARIO_DE[rol], rol })),
    );
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const como = (rol: NombreSesion) => ({ Authorization: bearer(tokens[rol]) });
  const alGrupo = (rol: NombreSesion, contenido: string) => http().post('/api/chat/mensajes').set(como(rol)).send({ tipoSala: 'global', contenido }).expect(201);
  const aPrivado = (rol: NombreSesion, para: string, contenido: string) => http().post('/api/chat/mensajes').set(como(rol)).send({ tipoSala: 'directo', destinatarioId: para, contenido }).expect(201);
  const canales = async (rol: NombreSesion) => (await http().get('/api/chat/canales').set(como(rol)).expect(200)).body as { id: string; noLeidos: number }[];
  const total = async (rol: NombreSesion) => (await http().get('/api/chat/no-leidos').set(como(rol)).expect(200)).body as { total: number };

  it('criterio 1: la lista de chats trae el contador de cada conversación (siempre un número) y sigue empezando por el grupo', async () => {
    const sinNada = await canales('firmante');
    expect(sinNada[0].id).toBe('global');
    expect(sinNada.every((c) => c.noLeidos === 0)).toBe(true);
    await alGrupo('rt_calle', 'g1');
    await alGrupo('rt_calle', 'g2');
    await aPrivado('rt_calle', ids.firmante, 'p1');
    const lista = await canales('firmante');
    expect(lista.find((c) => c.id === 'global')?.noLeidos).toBe(2);
    expect(lista.find((c) => c.id === ids.rt_calle)?.noLeidos).toBe(1);
    expect(lista.find((c) => c.id === ids.secretaria)?.noLeidos).toBe(0);
  });

  it('criterio 2: GET /api/chat/no-leidos devuelve el total y lo que escribe uno mismo no cuenta', async () => {
    expect(await total('firmante')).toMatchObject({ total: 0 });
    await alGrupo('rt_calle', 'g1');
    await aPrivado('rt_calle', ids.firmante, 'p1');
    expect(await total('firmante')).toMatchObject({ total: 2 });
    expect(await total('rt_calle')).toMatchObject({ total: 0 });
  });

  it('criterio 3: POST /api/chat/lecturas deja la conversación en cero y devuelve lo que queda y el total', async () => {
    await alGrupo('rt_calle', 'g1');
    const p1 = await aPrivado('rt_calle', ids.firmante, 'p1');
    const p2 = await aPrivado('rt_calle', ids.firmante, 'p2');
    const res = await http().post('/api/chat/lecturas').set(como('firmante')).send({ sala: ids.rt_calle, hasta: p2.body.id }).expect(200);
    expect(res.body).toEqual({ sala: ids.rt_calle, noLeidos: 0, total: 1 });
    expect((await canales('firmante')).find((c) => c.id === ids.rt_calle)?.noLeidos).toBe(0);
    expect(await total('firmante')).toMatchObject({ total: 1 });
    // hacia atrás no se vuelve
    const atras = await http().post('/api/chat/lecturas').set(como('firmante')).send({ sala: ids.rt_calle, hasta: p1.body.id }).expect(200);
    expect(atras.body.noLeidos).toBe(0);
  });

  it('criterio 5: un tercero no tiene contadores por un privado ajeno ni puede marcarlo leído', async () => {
    const p = await aPrivado('rt_calle', ids.firmante, 'secreto');
    expect(await total('administrador')).toMatchObject({ total: 0 });
    expect((await canales('administrador')).every((c) => c.noLeidos === 0)).toBe(true);
    await http().post('/api/chat/lecturas').set(como('administrador')).send({ sala: ids.rt_calle, hasta: p.body.id }).expect(400);
    await http().post('/api/chat/lecturas').set(como('administrador')).send({ sala: ids.firmante, hasta: p.body.id }).expect(400);
  });

  it.each([
    ['sin cuerpo', {}],
    ['sin conversación', { hasta: '00000000-0000-4000-8000-000000000000' }],
    ['conversación inválida', { sala: 'abc', hasta: '00000000-0000-4000-8000-000000000000' }],
    ['sin mensaje', { sala: 'global' }],
    ['mensaje que no es un identificador', { sala: 'global', hasta: 'abc' }],
    ['mensaje que no existe', { sala: 'global', hasta: '00000000-0000-4000-8000-000000000000' }],
  ])('una lectura inválida (%s) responde 400 y no 500', async (_n, cuerpo) => {
    await http().post('/api/chat/lecturas').set(como('firmante')).send(cuerpo).expect(400);
  });

  it('el acceso: la ECA recibe 403 y sin sesión 401, en las dos rutas nuevas', async () => {
    await http().get('/api/chat/no-leidos').set(como('ecaPortena')).expect(403);
    await http().post('/api/chat/lecturas').set(como('ecaPortena')).send({ sala: 'global', hasta: 'x' }).expect(403);
    await http().get('/api/chat/no-leidos').expect(401);
    await http().post('/api/chat/lecturas').send({}).expect(401);
  });

  it('el resto del chat sigue igual: el grupo trae sus mensajes y la lista sus datos de siempre', async () => {
    await alGrupo('rt_calle', 'hola');
    const hilo = await http().get('/api/chat/mensajes?sala=global').set(como('firmante')).expect(200);
    expect(hilo.body.map((m: { contenido: string }) => m.contenido)).toEqual(['hola']);
    const lista = await canales('firmante');
    expect(lista[0]).toMatchObject({ id: 'global', tipo: 'global' });
  });
});

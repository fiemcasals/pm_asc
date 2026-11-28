import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { ChatRepository, InMemoryChatRepository } from '../src/chat/chat.repository';
import { createTestApp } from './create-test-app';
import { bearer, crearSesiones, NombreSesion, USUARIO_DE } from './sesiones-e2e';

// HU-19 RF-02 — por la API real: el hilo trae los más nuevos y, con «antes», los anteriores.
// HU-19 RF-11 — los 205 mensajes que hacen falta para pasar el límite de 200 se cargan directo en el repositorio (en memoria), no
// por 205 pedidos HTTP seguidos: eso tardaba segundos y dependía de la carga de la máquina. Escribir por HTTP ya lo prueban
// chat.e2e-spec y chat-validacion.e2e-spec; acá lo que se prueba es la LECTURA del hilo, que sigue siendo por HTTP y con sesión.
describe('Chat: el hilo por la API (HU-19 RF-02)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;
  let chat: InMemoryChatRepository;
  let emisorId: string;

  beforeEach(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
    chat = app.get(ChatRepository) as InMemoryChatRepository;
    emisorId = (await usuarios.buscarPorUsuario(USUARIO_DE.rt_calle))!.id; // el mismo RT que antes escribía por HTTP
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const escribir = async (n: number) => {
    for (let i = 1; i <= n; i++) {
      await http().post('/api/chat/mensajes').set('Authorization', bearer(tokens.rt_calle)).send({ tipoSala: 'global', contenido: `msg ${i}` }).expect(201);
    }
  };
  /** Carga `n` mensajes del grupo general («msg 1» … «msg n») directo en el repositorio, en el orden en que se escribirían. */
  const cargar = async (n: number) => {
    for (let i = 1; i <= n; i++) await chat.guardarMensaje(emisorId, { tipoSala: 'global', contenido: `msg ${i}` });
  };
  const pedir = (query: string) => http().get(`/api/chat/mensajes${query}`).set('Authorization', bearer(tokens.firmante));

  it('con más de 200 mensajes responde los 200 más nuevos (una lista) y avisa en un encabezado que quedan anteriores', async () => {
    await cargar(205);
    const res = await pedir('?sala=global').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(200);
    expect(res.body[0].contenido).toBe('msg 6');
    expect(res.body[199].contenido).toBe('msg 205');
    expect(res.headers['x-hay-anteriores']).toBe('true');
    expect(res.headers['access-control-expose-headers']).toContain('X-Hay-Anteriores');
  });

  it('con el id del más viejo que se ve, trae los anteriores y avisa que no quedan más', async () => {
    await cargar(205);
    const primera = await pedir('?sala=global').expect(200);
    const res = await pedir(`?sala=global&antes=${primera.body[0].id}`).expect(200);
    expect(res.body.map((m: { contenido: string }) => m.contenido)).toEqual(['msg 1', 'msg 2', 'msg 3', 'msg 4', 'msg 5']);
    expect(res.headers['x-hay-anteriores']).toBe('false');
  });

  it('con pocos mensajes no hay anteriores, y sin «sala» es el grupo general', async () => {
    await escribir(3);
    const res = await pedir('').expect(200);
    expect(res.body).toHaveLength(3);
    expect(res.headers['x-hay-anteriores']).toBe('false');
  });

  it('«limite» acota la cantidad', async () => {
    await escribir(20);
    const res = await pedir('?sala=global&limite=5').expect(200);
    expect(res.body.map((m: { contenido: string }) => m.contenido)).toEqual(['msg 16', 'msg 17', 'msg 18', 'msg 19', 'msg 20']);
    expect(res.headers['x-hay-anteriores']).toBe('true');
  });

  it.each(['?sala=global&antes=abc', "?sala=global&antes=' OR 1=1 --", '?sala=global&limite=0', '?sala=global&limite=201', '?sala=global&limite=abc', '?sala=global&limite=1.5', '?sala=global&limite=-3'])(
    'un pedido inválido (%s) responde 400 y no 500',
    async (query) => {
      await pedir(query).expect(400);
    },
  );

  it('sigue pidiendo sesión y la ECA sigue sin entrar', async () => {
    await http().get('/api/chat/mensajes?sala=global').expect(401);
    await http().get('/api/chat/mensajes?sala=global').set('Authorization', bearer(tokens.ecaPortena)).expect(403);
  });
});

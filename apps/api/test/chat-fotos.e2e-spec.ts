import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { ChatRepository, InMemoryChatRepository } from '../src/chat/chat.repository';
import { createTestApp } from './create-test-app';
import { bearer, crearSesiones, NombreSesion, PASSWORD_E2E, USUARIO_DE } from './sesiones-e2e';

// HU-19 RF-05 — por la API real: el hilo no lleva las fotos adentro (lleva la ruta), la foto se pide aparte, una vez, y solo la obtiene quien
// puede leer el mensaje; lo que pasa el tope se rechaza.
const bytesFoto = randomBytes(300 * 1024); // una foto ya reducida: 300 KB
const FOTO = `data:image/jpeg;base64,${bytesFoto.toString('base64')}`;

describe('Chat: las fotos van aparte del hilo (HU-19 RF-05)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;
  const ids = {} as Record<'rt_calle' | 'firmante' | 'administrador' | 'secretaria', string>;

  beforeEach(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
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
  const alGrupo = async (adjuntoUrl: string, contenido = '') =>
    (await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'global', contenido, adjuntoUrl }).expect(201)).body as { id: string; adjuntoUrl: string };
  const pedirFoto = (ruta: string, rol?: NombreSesion) => {
    const r = http().get(ruta).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    });
    return rol ? r.set(como(rol)) : r;
  };

  it('criterio 2: el mensaje y el hilo llevan la ruta de la foto, no la foto', async () => {
    const enviado = await alGrupo(FOTO);
    expect(enviado.adjuntoUrl).toBe(`/api/chat/mensajes/${enviado.id}/foto`);
    const hilo = await http().get('/api/chat/mensajes?sala=global').set(como('firmante')).expect(200);
    expect(hilo.body[0].adjuntoUrl).toBe(`/api/chat/mensajes/${enviado.id}/foto`);
    expect(hilo.text).not.toContain('base64');
  });

  it('criterio 2: con 5 fotos, cada actualización del hilo pesa menos de 50 KB', async () => {
    for (let i = 0; i < 5; i++) await alGrupo(FOTO, `foto ${i + 1}`);
    const hilo = await http().get('/api/chat/mensajes?sala=global').set(como('firmante')).expect(200);
    expect(hilo.body).toHaveLength(5);
    expect(Buffer.byteLength(hilo.text)).toBeLessThan(50 * 1024);
  });

  it('criterio 3: quien la envió y los demás del grupo obtienen la misma foto, como imagen y guardable por el navegador', async () => {
    const enviado = await alGrupo(FOTO);
    for (const rol of ['rt_calle', 'firmante', 'secretaria', 'administrador'] as const) {
      const res = await pedirFoto(enviado.adjuntoUrl, rol).expect(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(Buffer.compare(res.body as Buffer, bytesFoto)).toBe(0);
    }
  });

  it('criterio 4: sin sesión responde 401', async () => {
    const enviado = await alGrupo(FOTO);
    await pedirFoto(enviado.adjuntoUrl).expect(401);
  });

  it('criterio 4: la foto de un privado la obtienen sus dos participantes y un tercero no (404, como si no existiera)', async () => {
    const res = await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'directo', destinatarioId: ids.firmante, contenido: '', adjuntoUrl: FOTO }).expect(201);
    const ruta = res.body.adjuntoUrl as string;
    await pedirFoto(ruta, 'rt_calle').expect(200);
    await pedirFoto(ruta, 'firmante').expect(200);
    const tercero = await pedirFoto(ruta, 'secretaria').expect(404);
    expect(Buffer.compare(tercero.body as Buffer, bytesFoto)).not.toBe(0);
    await pedirFoto(ruta, 'administrador').expect(404);
  });

  it('criterio 4: la ECA no usa el chat (403) y un identificador inválido responde 400', async () => {
    const enviado = await alGrupo(FOTO);
    await pedirFoto(enviado.adjuntoUrl, 'ecaPortena').expect(403);
    await pedirFoto('/api/chat/mensajes/no-es-uuid/foto', 'firmante').expect(400);
    await pedirFoto('/api/chat/mensajes/00000000-0000-4000-8000-000000000000/foto', 'firmante').expect(404);
  });

  it('un mensaje sin foto no tiene foto que pedir (404)', async () => {
    const res = await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'global', contenido: 'solo texto' }).expect(201);
    expect(res.body.adjuntoUrl).toBeNull();
    await pedirFoto(`/api/chat/mensajes/${res.body.id}/foto`, 'firmante').expect(404);
  });

  it('criterio 5: una foto que pasa los 600 KB responde 400 con el motivo y no se guarda', async () => {
    const pesada = `data:image/jpeg;base64,${randomBytes(600 * 1024 + 1).toString('base64')}`;
    const res = await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'global', contenido: 'x', adjuntoUrl: pesada }).expect(400);
    expect(String(res.body.message)).toMatch(/demasiado pesada: puede pesar hasta 600 KB/);
    const hilo = await http().get('/api/chat/mensajes?sala=global').set(como('firmante')).expect(200);
    expect(hilo.body).toEqual([]);
  });
});

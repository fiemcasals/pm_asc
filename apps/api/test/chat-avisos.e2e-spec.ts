import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { ChatRepository, InMemoryChatRepository } from '../src/chat/chat.repository';
import { createTestApp } from './create-test-app';
import { bearer, crearSesiones, NombreSesion, PASSWORD_E2E, USUARIO_DE } from './sesiones-e2e';

// HU-19 RF-10 — por la API real: GET /api/chat/no-leidos trae, además del total, el último mensaje sin leer de cada conversación para avisar en el navegador.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

describe('Chat: el resumen para avisar, por la API (HU-19 RF-10)', () => {
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
  const resumen = async (rol: NombreSesion) => (await http().get('/api/chat/no-leidos').set(como(rol)).expect(200)).body;

  it('sin nada sin leer: total 0 y ninguna conversación (el «total» de siempre sigue estando)', async () => {
    expect(await resumen('firmante')).toEqual({ total: 0, conversaciones: [] });
  });

  it('cada conversación con algo sin leer trae su cantidad y el último mensaje: id, quién lo escribió, el comienzo del texto, si tiene foto y cuándo', async () => {
    await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'global', contenido: 'al grupo' }).expect(201);
    await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'directo', destinatarioId: ids.firmante, contenido: 'uno' }).expect(201);
    const ultimo = await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'directo', destinatarioId: ids.firmante, contenido: 'dos' }).expect(201);
    const r = await resumen('firmante');
    expect(r.total).toBe(3);
    expect(r.conversaciones.map((c: { sala: string }) => c.sala)).toEqual(['global', ids.rt_calle]);
    expect(r.conversaciones[1]).toMatchObject({ noLeidos: 2, ultimoMensaje: { id: ultimo.body.id, contenido: 'dos', conFoto: false } });
    expect(Object.keys(r.conversaciones[1].ultimoMensaje).sort()).toEqual(['conFoto', 'contenido', 'creadoEn', 'emisorNombre', 'id']);
    expect(typeof r.conversaciones[1].ultimoMensaje.emisorNombre).toBe('string');
  });

  it('una foto viaja como «conFoto» y nunca la imagen', async () => {
    await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'directo', destinatarioId: ids.firmante, contenido: '', adjuntoUrl: PNG }).expect(201);
    const r = await resumen('firmante');
    expect(r.conversaciones[0].ultimoMensaje).toMatchObject({ contenido: '📷 Foto adjunta', conFoto: true });
    expect(JSON.stringify(r)).not.toContain('base64');
  });

  it('lo que uno mismo escribe no aparece en su resumen', async () => {
    await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'directo', destinatarioId: ids.firmante, contenido: 'de la RT' }).expect(201);
    await http().post('/api/chat/mensajes').set(como('firmante')).send({ tipoSala: 'directo', destinatarioId: ids.rt_calle, contenido: 'respuesta del firmante' }).expect(201);
    expect((await resumen('firmante')).conversaciones[0].ultimoMensaje.contenido).toBe('de la RT');
    expect(JSON.stringify(await resumen('firmante'))).not.toContain('respuesta del firmante');
  });

  it('privacidad: un tercero no recibe nada de un privado ajeno', async () => {
    await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'directo', destinatarioId: ids.firmante, contenido: 'secreto' }).expect(201);
    expect(await resumen('administrador')).toEqual({ total: 0, conversaciones: [] });
  });

  it('una conversación leída deja de aparecer', async () => {
    const m = await http().post('/api/chat/mensajes').set(como('rt_calle')).send({ tipoSala: 'directo', destinatarioId: ids.firmante, contenido: 'p1' }).expect(201);
    await http().post('/api/chat/lecturas').set(como('firmante')).send({ sala: ids.rt_calle, hasta: m.body.id }).expect(200);
    expect(await resumen('firmante')).toEqual({ total: 0, conversaciones: [] });
  });

  it('el acceso: la ECA recibe 403 y sin sesión 401', async () => {
    await http().get('/api/chat/no-leidos').set(como('ecaPortena')).expect(403);
    await http().get('/api/chat/no-leidos').expect(401);
  });
});

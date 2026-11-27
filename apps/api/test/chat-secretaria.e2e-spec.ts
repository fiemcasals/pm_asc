import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';
import { bearer, crearSesiones, NombreSesion } from './sesiones-e2e';

// HU-19 RF-03 — por la API real (sesiones de verdad): quién entra al chat y que la Secretaría figure como contacto.
describe('Chat: la Secretaría como contacto, por la API (HU-19 RF-03)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;

  beforeEach(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it.each(['rt_calle', 'firmante', 'administrador'] as const)('%s ve a la Secretaría entre sus contactos del chat', async (rol) => {
    const res = await http().get('/api/chat/canales').set('Authorization', bearer(tokens[rol])).expect(200);
    const roles = res.body.filter((c: { tipo: string }) => c.tipo === 'directo').map((c: { rol: string }) => c.rol);
    expect(roles).toContain('secretaria');
  });

  // Que la Secretaría no se vea a sí misma depende de los identificadores reales de la base: lo cubren la prueba de integración y la unitaria.
  it('la Secretaría entra al chat y tiene como contactos a los otros tres roles', async () => {
    const res = await http().get('/api/chat/canales').set('Authorization', bearer(tokens.secretaria)).expect(200);
    expect(res.body[0].id).toBe('global');
    const directos = res.body.filter((c: { tipo: string }) => c.tipo === 'directo');
    expect(directos.map((c: { rol: string }) => c.rol)).toEqual(expect.arrayContaining(['rt_calle', 'firmante', 'administrador']));
  });

  it('un RT le escribe a la Secretaría por privado y la API lo acepta', async () => {
    const canales = await http().get('/api/chat/canales').set('Authorization', bearer(tokens.rt_calle)).expect(200);
    const sec = canales.body.find((c: { rol?: string }) => c.rol === 'secretaria');
    const res = await http()
      .post('/api/chat/mensajes')
      .set('Authorization', bearer(tokens.rt_calle))
      .send({ tipoSala: 'directo', destinatarioId: sec.id, contenido: 'Secretaría, ¿salió el remito?' })
      .expect(201);
    expect(res.body.destinatarioId).toBe(sec.id);
  });

  it('criterio 5: la ECA sigue sin chat: las tres rutas le responden 403', async () => {
    await http().get('/api/chat/canales').set('Authorization', bearer(tokens.ecaPortena)).expect(403);
    await http().get('/api/chat/mensajes?sala=global').set('Authorization', bearer(tokens.ecaPortena)).expect(403);
    await http()
      .post('/api/chat/mensajes')
      .set('Authorization', bearer(tokens.ecaPortena))
      .send({ tipoSala: 'global', contenido: 'no debería entrar' })
      .expect(403);
  });

  it('sin sesión el chat responde 401', async () => {
    await http().get('/api/chat/canales').expect(401);
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';
import { bearer, crearSesiones, NombreSesion } from './sesiones-e2e';

describe('Chat API (e2e)', () => {
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

  it('GET /api/chat/canales devuelve el canal general y los contactos de equipo', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/chat/canales')
      .set('Authorization', bearer(tokens['rt_calle']))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('global');
    expect(res.body[0].tipo).toBe('global');
    expect(res.body.length).toBeGreaterThan(1);
  });

  it('POST /api/chat/mensajes permite enviar un mensaje a la sala global', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/chat/mensajes')
      .set('Authorization', bearer(tokens['rt_calle']))
      .send({
        tipoSala: 'global',
        contenido: 'Aviso a la guardia: inspección iniciada en Corrientes 1234',
        maquinaRef: 'M1',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.tipoSala).toBe('global');
    expect(res.body.contenido).toContain('Corrientes 1234');
    expect(res.body.emisorRol).toBe('rt_calle');
  });

  it('POST /api/chat/mensajes permite enviar un mensaje directo 1 a 1', async () => {
    // Obtenemos los canales para sacar el ID del contacto firmante
    const canales = await request(app.getHttpServer())
      .get('/api/chat/canales')
      .set('Authorization', bearer(tokens['rt_calle']))
      .expect(200);

    const firmanteCanal = canales.body.find((c: { tipo: string }) => c.tipo === 'directo');
    expect(firmanteCanal).toBeDefined();

    const res = await request(app.getHttpServer())
      .post('/api/chat/mensajes')
      .set('Authorization', bearer(tokens['rt_calle']))
      .send({
        tipoSala: 'directo',
        destinatarioId: firmanteCanal.id,
        contenido: 'Ingeniero, adjunto foto de estado de cables https://example.com/cables',
        adjuntoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      })
      .expect(201);

    expect(res.body.tipoSala).toBe('directo');
    expect(res.body.destinatarioId).toBe(firmanteCanal.id);
    // HU-19 RF-05: el mensaje lleva la ruta de la foto, que se pide aparte
    expect(res.body.adjuntoUrl).toBe(`/api/chat/mensajes/${res.body.id}/foto`);
  });

  it('POST /api/chat/mensajes rechaza mensajes vacíos con HTTP 400', async () => {
    await request(app.getHttpServer())
      .post('/api/chat/mensajes')
      .set('Authorization', bearer(tokens['rt_calle']))
      .send({
        tipoSala: 'global',
        contenido: '   ',
      })
      .expect(400);
  });

  it('GET /api/chat/mensajes?sala=global devuelve los mensajes guardados', async () => {
    // Primero enviamos un mensaje
    await request(app.getHttpServer())
      .post('/api/chat/mensajes')
      .set('Authorization', bearer(tokens['rt_calle']))
      .send({
        tipoSala: 'global',
        contenido: 'Reporte para el grupo general',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/chat/mensajes?sala=global')
      .set('Authorization', bearer(tokens['firmante']))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.some((m: { contenido: string }) => m.contenido.includes('Reporte para el grupo general'))).toBe(true);
  });

  it('criterio 7: un usuario con rol ECA recibe 403 Forbidden', async () => {
    await request(app.getHttpServer())
      .get('/api/chat/canales')
      .set('Authorization', bearer(tokens['ecaPortena']))
      .expect(403);
  });
});

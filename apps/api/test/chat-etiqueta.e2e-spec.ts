import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { ChatRepository, InMemoryChatRepository } from '../src/chat/chat.repository';
import { createTestApp } from './create-test-app';
import { bearer, crearSesiones, NombreSesion } from './sesiones-e2e';

// HU-19 RF-07 — por la API real (sesiones de verdad): la etiqueta de edificio es parte del mensaje y la ve todo el que lo lee.
const EDIFICIO = '0f1e2d3c-4b5a-4968-8776-655443322110';

describe('Chat: la etiqueta de edificio por la API (HU-19 RF-07)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;

  beforeEach(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
    (app.get(ChatRepository) as InMemoryChatRepository).setConsorcios({ [EDIFICIO]: 'DEMO Cabildo 1540' });
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const enviar = (rol: NombreSesion, cuerpo: object) => http().post('/api/chat/mensajes').set('Authorization', bearer(tokens[rol])).send(cuerpo);
  const grupo = async (rol: NombreSesion) =>
    (await http().get('/api/chat/mensajes?sala=global').set('Authorization', bearer(tokens[rol])).expect(200)).body as { contenido: string; edificioNombre: string | null; maquinaRef: string | null }[];

  it('criterio 2: el mensaje sale con el nombre del edificio y la máquina, y los demás lo leen igual', async () => {
    const r = await enviar('rt_calle', { tipoSala: 'global', contenido: 'cables gastados', consorcioId: EDIFICIO, maquinaRef: 'M1' }).expect(201);
    expect(r.body).toMatchObject({ consorcioId: EDIFICIO, edificioNombre: 'DEMO Cabildo 1540', maquinaRef: 'M1' });
    for (const rol of ['firmante', 'secretaria', 'administrador'] as const) {
      expect((await grupo(rol))[0]).toMatchObject({ edificioNombre: 'DEMO Cabildo 1540', maquinaRef: 'M1' });
    }
  });

  it('criterio 1: cada mensaje lleva su propio edificio: el siguiente sin edificio sale sin etiqueta', async () => {
    await enviar('rt_calle', { tipoSala: 'global', contenido: 'con edificio', consorcioId: EDIFICIO }).expect(201);
    await enviar('rt_calle', { tipoSala: 'global', contenido: 'sin edificio' }).expect(201);
    const [primero, segundo] = await grupo('firmante');
    expect(primero).toMatchObject({ contenido: 'con edificio', edificioNombre: 'DEMO Cabildo 1540' });
    expect(segundo).toMatchObject({ contenido: 'sin edificio', edificioNombre: null, maquinaRef: null });
  });

  it('criterio 3: una máquina sin edificio no se guarda, y más de 40 caracteres se rechaza', async () => {
    const r = await enviar('rt_calle', { tipoSala: 'global', contenido: 'x', maquinaRef: 'M1' }).expect(201);
    expect(r.body.maquinaRef).toBeNull();
    await enviar('rt_calle', { tipoSala: 'global', contenido: 'x', consorcioId: EDIFICIO, maquinaRef: 'M'.repeat(40) }).expect(201);
    const largo = await enviar('rt_calle', { tipoSala: 'global', contenido: 'x', consorcioId: EDIFICIO, maquinaRef: 'M'.repeat(41) }).expect(400);
    expect(String(largo.body.message)).toMatch(/hasta 40 caracteres/);
  });

  it('criterio 4: un edificio que quien escribe no ve no se puede elegir', async () => {
    const r = await enviar('rt_calle', { tipoSala: 'global', contenido: 'x', consorcioId: '11111111-2222-4333-8444-555555555555' }).expect(400);
    expect(String(r.body.message)).toMatch(/no existe o no está disponible para vos/);
  });
});

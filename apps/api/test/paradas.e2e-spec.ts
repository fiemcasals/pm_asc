import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';

// HU-17 RF-03 por HTTP, con roles reales.
const PASSWORD = 'Clave-Segura-2026';
const MAQUINA = 'MAQ-CORRIENTES-M1';
const FOTO = 'data:image/jpeg;base64,AAAA';
jest.setTimeout(30_000);

describe('POST /api/paradas (HU-17 RF-03)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, undefined, undefined, undefined, { usuarios }));
    const hash = await bcrypt.hash(PASSWORD, 4);
    for (const rol of ['rt_calle', 'secretaria', 'firmante', 'eca'] as Rol[]) {
      await usuarios.crear({ usuario: rol, nombre: rol, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA-E2E' : null });
      tokens[rol] = (await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: rol, password: PASSWORD })).body.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  const post = (rol: string, cuerpo: Record<string, unknown>) => request(app.getHttpServer()).post('/api/paradas').set('Authorization', `Bearer ${tokens[rol]}`).send(cuerpo);
  const lista = (rol: string) => request(app.getHttpServer()).get('/api/paradas').set('Authorization', `Bearer ${tokens[rol]}`);

  it('el RT guarda el reporte con causa y foto → 201 a su nombre, y la Secretaría y el Firmante lo ven pendiente', async () => {
    const res = await post('rt_calle', { maquinaId: MAQUINA, causa: 'Sin energía en el tablero', fotos: [FOTO] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ reportadoPor: 'rt_calle', estado: 'Fuera de Servicio — Pendiente de confirmación', avisadoA: ['secretaria', 'firmante:gonza'] });
    for (const rol of ['secretaria', 'firmante']) {
      const l = await lista(rol);
      expect(l.status).toBe(200);
      expect(l.body.map((r: { maquinaId: string }) => r.maquinaId)).toEqual([MAQUINA]);
    }
  });

  it('sin causa o sin foto → 400', async () => {
    expect((await post('rt_calle', { maquinaId: 'MAQ-SANTAFE-M1', fotos: [FOTO] })).status).toBe(400);
    expect((await post('rt_calle', { maquinaId: 'MAQ-SANTAFE-M1', causa: 'x', fotos: [] })).status).toBe(400);
  });

  it('el Firmante y la ECA no reportan paradas (403); la ECA no ve la lista (403); sin sesión 401', async () => {
    expect((await post('firmante', { maquinaId: 'MAQ-SANTAFE-M1', causa: 'x', fotos: [FOTO] })).status).toBe(403);
    expect((await post('eca', { maquinaId: 'MAQ-SANTAFE-M1', causa: 'x', fotos: [FOTO] })).status).toBe(403);
    expect((await lista('eca')).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/paradas')).status).toBe(401);
  });
});

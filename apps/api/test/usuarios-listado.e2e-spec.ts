import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { COSTO_BCRYPT } from '../src/auth/auth.service';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';

const PASSWORD = 'Clave-Segura-2026';

// bcrypt costo 12 es lento a propósito.
jest.setTimeout(60_000);

describe('Listado de usuarios para el Administrador (GET /api/usuarios)', () => {
  let app: INestApplication;
  let usuarios: InMemoryUsuariosRepository;
  const http = () => request(app.getHttpServer());

  let hash: string;
  beforeAll(async () => {
    hash = await bcrypt.hash(PASSWORD, COSTO_BCRYPT);
  });

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp(
      { NODE_ENV: 'test', AUTH_JWT_SECRET: 'secreto-de-prueba-con-mas-de-32-caracteres' },
      undefined,
      undefined,
      undefined,
      { usuarios },
    ));
    await usuarios.crear({ usuario: 'jefa', nombre: 'Jefa', rol: 'administrador', passwordHash: hash });
    await usuarios.crear({
      usuario: 'ana',
      nombre: 'Ana',
      rol: 'secretaria',
      passwordHash: hash,
      email: 'ana@ejemplo.test',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function token(usuario: string): Promise<string> {
    const { body } = await http().post('/api/auth/login').send({ usuario, password: PASSWORD }).expect(200);
    return body.accessToken;
  }

  it('el Administrador ve la lista, sin hashes ni datos de más', async () => {
    // El token se pide antes de armar el pedido: anidar un await dentro de la cadena de
    // supertest deja el server a medio abrir y falla con "address of null".
    const auth = `Bearer ${await token('jefa')}`;
    const { body } = await http().get('/api/usuarios').set('Authorization', auth).expect(200);

    expect(body.map((u: { usuario: string }) => u.usuario)).toEqual(['ana', 'jefa']);
    expect(body[0]).toEqual({
      id: expect.any(String),
      usuario: 'ana',
      nombre: 'Ana',
      rol: 'secretaria',
      eca: null,
      email: 'ana@ejemplo.test',
    });
    expect(JSON.stringify(body)).not.toContain('$2');
  });

  it('se puede ingresar con el email, no sólo con el nombre de usuario', async () => {
    await http()
      .post('/api/auth/login')
      .send({ usuario: 'Ana@Ejemplo.test', password: PASSWORD })
      .expect(200);
    await http()
      .post('/api/auth/login')
      .send({ usuario: 'ana@ejemplo.test', password: 'Clave-Equivocada-1' })
      .expect(401);
  });

  it('otro rol recibe 403 y sin sesión 401', async () => {
    const auth = `Bearer ${await token('ana')}`;
    await http().get('/api/usuarios').set('Authorization', auth).expect(403);
    await http().get('/api/usuarios').expect(401);
  });
});

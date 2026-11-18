import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';

// HU-06 RF-04 por HTTP, con roles reales.
const PASSWORD = 'Clave-Segura-2026';
jest.setTimeout(30_000);

describe('Alertas de falla crítica: Firmante asignado y primera apertura, por HTTP (HU-06 RF-04)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, undefined, undefined, undefined, { usuarios }));
    const hash = await bcrypt.hash(PASSWORD, 4);
    const cuentas: [string, Rol][] = [['secretaria', 'secretaria'], ['administrador', 'administrador'], ['gonza', 'firmante'], ['otro.firmante', 'firmante'], ['rt1', 'rt_calle'], ['eca1', 'eca']];
    for (const [usuario, rol] of cuentas) {
      await usuarios.crear({ usuario, nombre: usuario, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA-E2E' : null });
      tokens[usuario] = (await request(app.getHttpServer()).post('/api/auth/login').send({ usuario, password: PASSWORD })).body.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const con = (usuario: string) => ({
    lista: () => http().get('/api/fallas-criticas/informes').set('Authorization', `Bearer ${tokens[usuario]}`),
    abrir: (id: string) => http().post(`/api/fallas-criticas/informes/${id}/abrir`).set('Authorization', `Bearer ${tokens[usuario]}`),
  });
  const informar = async () =>
    (await http().post('/api/fallas-criticas/informes').set('Authorization', `Bearer ${tokens.rt1}`).send({ maquinaId: 'MAQ-CORRIENTES-M1', inspector: 'rt1', fallasCriticas: ['BOTON_PARE_FALLA'] })).body.informe.id as string;

  it('criterio 1: el Firmante asignado ve la alerta en su lista; otro Firmante no; la Secretaría y el Administrador sí', async () => {
    await informar();

    expect((await con('gonza').lista()).body).toHaveLength(1);
    expect((await con('otro.firmante').lista()).body).toEqual([]);
    expect((await con('secretaria').lista()).body).toHaveLength(1);
    expect((await con('administrador').lista()).body).toHaveLength(1);
    expect((await con('gonza').lista()).body[0].firmanteUsername).toBe('gonza');
  });

  it('criterio 3: quien abre primero queda registrado; la segunda apertura devuelve la primera; la lista lo muestra', async () => {
    const id = await informar();

    const primera = await con('secretaria').abrir(id);
    const segunda = await con('gonza').abrir(id);

    expect(primera.status).toBe(200);
    expect(primera.body).toMatchObject({ abiertaPor: 'secretaria', primera: true });
    expect(segunda.body).toEqual({ abiertaPor: 'secretaria', abiertaEn: primera.body.abiertaEn, primera: false });
    const evento = (await con('secretaria').lista()).body.find((e: { informeId: string }) => e.informeId === id);
    expect(evento).toMatchObject({ abiertaPor: 'secretaria', abiertaEn: primera.body.abiertaEn });
  });

  it('un Firmante de otro edificio no abre la alerta (403) y no queda registrada; el RT y la ECA tampoco (403); sin sesión 401', async () => {
    const id = await informar();

    expect((await con('otro.firmante').abrir(id)).status).toBe(403);
    expect((await con('rt1').abrir(id)).status).toBe(403);
    expect((await con('eca1').abrir(id)).status).toBe(403);
    expect((await http().post(`/api/fallas-criticas/informes/${id}/abrir`)).status).toBe(401);
    expect((await con('secretaria').lista()).body.find((e: { informeId: string }) => e.informeId === id).abiertaPor).toBeNull();
  });

  it('abrir una alerta que no existe → 404', async () => {
    expect((await con('secretaria').abrir('INF-NO-EXISTE')).status).toBe(404);
  });

  it('la lista de alertas no es para el RT ni la ECA (403) y sin sesión da 401', async () => {
    expect((await con('rt1').lista()).status).toBe(403);
    expect((await con('eca1').lista()).status).toBe(403);
    expect((await http().get('/api/fallas-criticas/informes')).status).toBe(401);
  });
});

import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';

// HU-06 RF-05 por HTTP, con roles reales: el estado del ascensor lo marca el RT y lo confirma el Firmante asignado.
const PASSWORD = 'Clave-Segura-2026';
const MAQUINA = 'MAQ-CORRIENTES-M1'; // Firmante: gonza
const FOTO = 'data:image/jpeg;base64,AAAA';
jest.setTimeout(30_000);

describe('Estado del ascensor por HTTP (HU-06 RF-05)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, undefined, undefined, undefined, { usuarios }));
    const hash = await bcrypt.hash(PASSWORD, 4);
    const cuentas: [string, Rol][] = [['rt1', 'rt_calle'], ['secretaria', 'secretaria'], ['administrador', 'administrador'], ['gonza', 'firmante'], ['otro.firmante', 'firmante'], ['eca1', 'eca']];
    for (const [usuario, rol] of cuentas) {
      await usuarios.crear({ usuario, nombre: usuario, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA-E2E' : null });
      tokens[usuario] = (await request(app.getHttpServer()).post('/api/auth/login').send({ usuario, password: PASSWORD })).body.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const con = (u: string) => ({
    marcar: (estado: string) => http().post('/api/paradas').set('Authorization', `Bearer ${tokens[u]}`).send({ maquinaId: MAQUINA, estado, causa: 'Ruido fuerte', fotos: [FOTO] }),
    resolver: (id: string, accion: 'confirmar' | 'rechazar', cuerpo: Record<string, unknown> = {}) =>
      http().post(`/api/paradas/${id}/${accion}`).set('Authorization', `Bearer ${tokens[u]}`).send(cuerpo),
    normalizar: (cuerpo: Record<string, unknown>) => http().post(`/api/paradas/maquinas/${MAQUINA}/normalizar`).set('Authorization', `Bearer ${tokens[u]}`).send(cuerpo),
    maquinas: () => http().get('/api/eca/maquinas').query({ eca: 'porteña' }).set('Authorization', `Bearer ${tokens[u]}`),
  });
  const estadoEnPortalEca = async () => {
    const m = (await con('secretaria').maquinas()).body.find((x: { id: string }) => x.id === MAQUINA);
    return { estado: m.estadoOperativo, confirmacion: m.confirmacionEstado };
  };

  it('el flujo completo: el RT marca, el Firmante confirma, el portal de la ECA lo muestra y el RT lo vuelve a Normal con una foto', async () => {
    const marcado = await con('rt1').marcar('Reparación Urgente');
    expect(marcado.status).toBe(201);
    expect(await estadoEnPortalEca()).toEqual({ estado: 'Reparación Urgente', confirmacion: 'Pendiente de confirmación' });

    const confirmado = await con('gonza').resolver(marcado.body.id, 'confirmar');
    expect(confirmado.status).toBe(200);
    expect(confirmado.body.estado).toBe('Reparación Urgente — Confirmado');
    expect(await estadoEnPortalEca()).toEqual({ estado: 'Reparación Urgente', confirmacion: 'Confirmado' });

    expect((await con('rt1').normalizar({})).status).toBe(400); // sin foto
    expect(await estadoEnPortalEca()).toMatchObject({ estado: 'Reparación Urgente' });
    expect((await con('rt1').normalizar({ fotos: [FOTO] })).status).toBe(200);
    expect(await estadoEnPortalEca()).toEqual({ estado: 'Normal', confirmacion: undefined });
  });

  it('criterio 2: otro rol (Secretaría, Administrador, RT, ECA) o un Firmante de otro edificio recibe 403 al confirmar y al rechazar', async () => {
    const id = (await con('rt1').marcar('Fuera de Servicio')).body.id;

    for (const u of ['secretaria', 'administrador', 'rt1', 'eca1', 'otro.firmante']) {
      expect((await con(u).resolver(id, 'confirmar')).status).toBe(403);
      expect((await con(u).resolver(id, 'rechazar', { motivo: 'x' })).status).toBe(403);
    }
    expect((await http().post(`/api/paradas/${id}/confirmar`)).status).toBe(401);
    expect(await estadoEnPortalEca()).toMatchObject({ confirmacion: 'Pendiente de confirmación' });
    expect((await con('gonza').resolver(id, 'rechazar', {})).status).toBe(400); // sin motivo
    expect((await con('gonza').resolver(id, 'rechazar', { motivo: 'Falsa alarma' })).status).toBe(200);
    expect(await estadoEnPortalEca()).toEqual({ estado: 'Normal', confirmacion: 'Rechazado' });
  });

  it('sólo el RT vuelve el equipo a Normal: la Secretaría y el Firmante reciben 403', async () => {
    const id = (await con('rt1').marcar('Fuera de Servicio')).body.id;
    await con('gonza').resolver(id, 'confirmar');

    expect((await con('secretaria').normalizar({ fotos: [FOTO] })).status).toBe(403);
    expect((await con('gonza').normalizar({ fotos: [FOTO] })).status).toBe(403);
    expect((await con('rt1').normalizar({ fotos: [FOTO] })).status).toBe(200);
  });

  it('un estado que no existe → 400', async () => {
    expect((await con('rt1').marcar('Normal')).status).toBe(400);
  });
});

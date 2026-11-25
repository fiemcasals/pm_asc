import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { createTestApp } from './create-test-app';

/** HU-11 / RF-13: el historial de envíos de WhatsApp pide la sesión de la Secretaría o del Administrador. */

const PASSWORD = 'Clave-Segura-2026';
const ROLES: Rol[] = ['secretaria', 'administrador', 'rt_calle', 'firmante', 'eca'];

describe('GET /api/whatsapp/historial pide sesión de Secretaría o Administrador (HU-11 / RF-13)', () => {
  let app: INestApplication;
  const tokens = {} as Record<Rol, string>;

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, undefined, undefined, undefined, { usuarios }));
    const hash = await bcrypt.hash(PASSWORD, 4);
    for (const rol of ROLES) {
      await usuarios.crear({ usuario: `u.${rol}`, nombre: rol, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA Uno' : null });
      tokens[rol] = (await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: `u.${rol}`, password: PASSWORD })).body.accessToken;
      expect(tokens[rol]).toBeTruthy();
    }
    // Un envío en el historial (sin proveedor configurado queda «no_configurado»), con su teléfono.
    await app.get(WhatsAppConnectorService).enviarMensajeAlerta({
      telefonoDestino: '+5491155550000',
      nombreEca: 'ECA Uno',
      consorcio: 'Consorcio Prueba',
      equipo: 'M1',
      estado: 'Fuera de servicio',
      detalle: 'Freno',
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const historial = () => request(app.getHttpServer()).get('/api/whatsapp/historial');

  it('criterio 1: sin sesión responde 401 y no muestra ningún envío', async () => {
    const res = await historial().expect(401);
    expect(JSON.stringify(res.body)).not.toContain('5491155550000');
  });

  it('criterio 1: con un token inválido también responde 401', async () => {
    await historial().set('Authorization', 'Bearer no-es-un-token').expect(401);
  });

  it.each(['rt_calle', 'firmante', 'eca'] as Rol[])('criterio 2: un usuario %s recibe 403 y no ve los envíos', async (rol) => {
    const res = await historial().set('Authorization', `Bearer ${tokens[rol]}`).expect(403);
    expect(JSON.stringify(res.body)).not.toContain('5491155550000');
  });

  it.each(['secretaria', 'administrador'] as Rol[])('criterio 3: la %s recibe 200 con los envíos', async (rol) => {
    const res = await historial().set('Authorization', `Bearer ${tokens[rol]}`).expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.registros).toEqual(expect.arrayContaining([expect.objectContaining({ telefonoDestino: '+5491155550000', estadoEntrega: 'no_configurado' })]));
  });

  // HU-11 RF-15: el estado del proveedor (lo usa el cartel de la bandeja, de la Secretaría y el Administrador) ya no es público.
  it('el estado de WhatsApp (el cartel de la bandeja) pide sesión de Secretaría o Administrador y no expone envíos', async () => {
    const estado = () => request(app.getHttpServer()).get('/api/whatsapp/estado');
    await estado().expect(401);
    for (const rol of ['rt_calle', 'firmante', 'eca'] as Rol[]) await estado().set('Authorization', `Bearer ${tokens[rol]}`).expect(403);
    for (const rol of ['secretaria', 'administrador'] as Rol[]) {
      const res = await estado().set('Authorization', `Bearer ${tokens[rol]}`).expect(200);
      expect(res.body).toEqual({ configurado: false, proveedor: null });
    }
  });
});

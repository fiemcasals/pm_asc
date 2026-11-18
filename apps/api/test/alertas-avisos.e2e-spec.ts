import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { FakeDatabase, createTestApp, fakeDatabase } from './create-test-app';

// HU-10 RF-04 por HTTP: los recordatorios y avisos de alertas sin acuse, con la base falsa que se comporta como PostgreSQL.
// Las alertas de ejemplo se detectaron el 6/11/2026: hoy ya pasaron las 24 h y las 48 h.
const PASSWORD = 'Clave-Segura-2026';
const CP = 'ALT-CP-001';
const M1 = 'ALT-MAICON-001';
const M2 = 'ALT-MAICON-002';
jest.setTimeout(30_000);

describe('Recordatorio a las 24 h y aviso a las 48 h sin acuse, por HTTP (HU-10 RF-04)', () => {
  let app: INestApplication;
  let db: FakeDatabase;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    db = fakeDatabase();
    // MAICON-002 se acusó 2 h después de detectada (7:45Z → 9:45Z): no debe tener recordatorio ni aviso.
    db.acuses.push({ id: 'previo', alerta_id: M2, eca: 'MAICON Mantenimiento', usuario: 'maicon.operador', fecha_hora: new Date('2026-11-06T09:45:00Z') });
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, db, undefined, undefined, { usuarios }));
    const hash = await bcrypt.hash(PASSWORD, 4);
    const roles: Rol[] = ['secretaria', 'administrador', 'rt_calle', 'firmante', 'eca'];
    for (const rol of roles) {
      await usuarios.crear({ usuario: rol, nombre: rol, rol, passwordHash: hash, eca: rol === 'eca' ? 'MAICON Mantenimiento' : null });
      const login = await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: rol, password: PASSWORD });
      expect(login.status).toBe(200);
      tokens[rol] = login.body.accessToken;
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  // La Secretaría ve la lista de cualquier ECA (HU-15 RF-02: el portal ECA pide sesión).
  const alertas = async (eca: string) => (await http().get('/api/eca/alertas').set('Authorization', `Bearer ${tokens.secretaria}`).query({ eca })).body.alertas as { alerta: { id: string; historial: { tipo: string; eca: string; edificio: string }[] } }[];
  const historialDe = async (eca: string, alertaId: string) => (await alertas(eca)).find((a) => a.alerta.id === alertaId)!.alerta.historial;
  const avisos = (rol?: string) => {
    const r = http().get('/api/eca/avisos-secretaria');
    return rol ? r.set('Authorization', `Bearer ${tokens[rol]}`) : r;
  };

  it('criterio 1: la alerta sin acuse muestra el recordatorio a las 24 h en su historial', async () => {
    const historial = await historialDe('Conservación Porteña S.R.L.', CP);

    expect(historial.map((e) => e.tipo)).toEqual(['recordatorio_eca_24h', 'aviso_secretaria_48h']);
    expect(historial[0]).toMatchObject({ eca: 'Conservación Porteña S.R.L.', edificio: 'Consorcio Corrientes 1234' });
  });

  it('criterio 3: la alerta que la ECA acusó a las 2 h no tiene recordatorio ni aviso', async () => {
    expect(await historialDe('maicon', M2)).toEqual([]);
    expect((await historialDe('maicon', M1)).map((e) => e.tipo)).toEqual(['recordatorio_eca_24h', 'aviso_secretaria_48h']); // la otra de MAICON sí
  });

  it('criterio 2: la Secretaría y el Administrador ven el aviso con el edificio y la ECA, y sólo de las alertas sin acuse', async () => {
    for (const rol of ['secretaria', 'administrador']) {
      const res = await avisos(rol);

      expect(res.status).toBe(200);
      expect(res.body.map((a: { alertaId: string }) => a.alertaId).sort()).toEqual([CP, M1].sort());
      expect(res.body.find((a: { alertaId: string }) => a.alertaId === M1)).toMatchObject({ eca: 'MAICON Mantenimiento', edificio: 'Consorcio Santa Fe 3200' });
      expect(res.body[0].mensaje).toContain('no acusó recibo en 48 horas');
    }
  });

  it.each(['rt_calle', 'firmante', 'eca'])('los avisos a la Secretaría no son para el rol %s (403) y sin sesión da 401', async (rol) => {
    expect((await avisos(rol)).status).toBe(403);
    expect((await avisos()).status).toBe(401);
  });

  it('criterio 4: abrir las alertas y los avisos muchas veces no repite ningún registro', async () => {
    await alertas('Conservación Porteña S.R.L.');
    await avisos('secretaria');
    await alertas('maicon');
    await avisos('secretaria');

    const guardados = db.avisos.map((a) => `${a.alerta_id}|${a.tipo}`).sort();
    expect(guardados).toEqual([`${CP}|aviso_secretaria_48h`, `${CP}|recordatorio_eca_24h`, `${M1}|aviso_secretaria_48h`, `${M1}|recordatorio_eca_24h`].sort());
  });
});

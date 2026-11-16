import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { InMemoryPagosRepository } from '../src/pagos/pagos.repository';
import { InMemoryVisitasFallidasRepository } from '../src/visitas-fallidas/visitas-fallidas.repository';
import { createTestApp, fakeDatabase } from './create-test-app';

// HU-02 RF-04: abono y porcentajes por máquina, con los roles reales.
const PASSWORD = 'Clave-Segura-2026';
const CONSORCIO = 'c-pagos';
const MAQUINA = 'm-pagos';
jest.setTimeout(30_000);

describe('PUT /api/consorcios/:id/maquinas/:id/pago (HU-02 RF-04)', () => {
  let app: INestApplication;
  let pagos: InMemoryPagosRepository;
  let visitas: InMemoryVisitasFallidasRepository;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    pagos = new InMemoryPagosRepository();
    visitas = new InMemoryVisitasFallidasRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, visitas, { usuarios }, undefined, pagos));
    const hash = await bcrypt.hash(PASSWORD, 4);
    const roles: Rol[] = ['administrador', 'secretaria', 'rt_calle', 'firmante', 'eca'];
    for (const rol of roles) {
      await usuarios.crear({ usuario: rol, nombre: rol, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA-E2E' : null });
      const login = await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: rol, password: PASSWORD });
      tokens[rol] = login.body.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    pagos.pagos.clear();
    pagos.cambios.length = 0;
    pagos.agregarMaquina(CONSORCIO, MAQUINA);
    visitas.pagos.clear();
  });

  const url = `/api/consorcios/${CONSORCIO}/maquinas/${MAQUINA}/pago`;
  const como = (rol: string) => ({
    guardar: (c: Record<string, unknown>) => request(app.getHttpServer()).put(url).set('Authorization', `Bearer ${tokens[rol]}`).send(c),
    ver: () => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${tokens[rol]}`),
    historial: () => request(app.getHttpServer()).get(`${url}/historial`).set('Authorization', `Bearer ${tokens[rol]}`),
  });

  it('la Secretaría y el Administrador editan y ven el pago; el cambio queda con el usuario que lo hizo', async () => {
    const res = await como('secretaria').guardar({ abonoMensual: 180000, porcentajeRt: 55 });

    expect(res.status).toBe(200);
    expect(res.body.pago).toMatchObject({ abonoMensual: 180000, porcentajeRt: 55, porcentajeFirmante: 25 });
    const hist = await como('administrador').historial();
    expect(hist.body).toHaveLength(2);
    expect(hist.body.map((c: { usuario: string }) => c.usuario)).toEqual(['secretaria', 'secretaria']);
    expect((await como('administrador').ver()).body).toMatchObject({ abonoMensual: 180000, porcentajeRt: 55 });
  });

  it.each(['rt_calle', 'firmante', 'eca'])('%s no ve ni edita el pago (403)', async (rol) => {
    expect((await como(rol).guardar({ abonoMensual: 1 })).status).toBe(403);
    expect((await como(rol).ver()).status).toBe(403);
    expect((await como(rol).historial()).status).toBe(403);
    expect(pagos.cambios).toEqual([]);
  });

  it('sin sesión → 401; porcentajes inválidos → 400 con el motivo; máquina que no existe → 404', async () => {
    expect((await request(app.getHttpServer()).put(url).send({ abonoMensual: 1 })).status).toBe(401);
    const mal = await como('administrador').guardar({ porcentajeRt: 90, porcentajeFirmante: 20 });
    expect(mal.status).toBe(400);
    expect(JSON.stringify(mal.body)).toContain('no puede superar 100');
    const no = await request(app.getHttpServer()).get(`/api/consorcios/${CONSORCIO}/maquinas/nada/pago`).set('Authorization', `Bearer ${tokens.administrador}`);
    expect(no.status).toBe(404);
  });

  it('la liquidación usa el abono y los porcentajes guardados de la máquina', async () => {
    visitas.pagos.set(MAQUINA, { abonoMensual: 200000, porcentajeRt: 50, porcentajeFirmante: 30 });

    const res = await request(app.getHttpServer())
      .post('/api/visitas-fallidas/liquidar-maquina')
      .set('Authorization', `Bearer ${tokens.administrador}`)
      .send({ consorcioId: CONSORCIO, maquinaId: MAQUINA, referenciaAgc: 'M1', montoBase: 100000 });

    expect(res.body).toMatchObject({ montoBase: 200000, origenAbono: 'maquina', porcentajeRt: 50, porcentajeFirmante: 30, montoRt: 100000, montoFirmante: 60000 });
  });

  it('sin abono cargado se usa el que manda quien liquida o, si no, el valor por defecto; los porcentajes son los de siempre', async () => {
    const send = (c: Record<string, unknown>) =>
      request(app.getHttpServer()).post('/api/visitas-fallidas/liquidar-maquina').set('Authorization', `Bearer ${tokens.administrador}`).send({ consorcioId: CONSORCIO, maquinaId: MAQUINA, referenciaAgc: 'M1', ...c });

    expect((await send({ montoBase: 90000 })).body).toMatchObject({ montoBase: 90000, origenAbono: 'parametro', porcentajeRt: 60, porcentajeFirmante: 25, montoRt: 54000, montoFirmante: 22500 });
    expect((await send({})).body).toMatchObject({ montoBase: 150000, origenAbono: 'por_defecto' });
  });
});

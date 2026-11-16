import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { InMemoryVisitasFallidasRepository } from '../src/visitas-fallidas/visitas-fallidas.repository';
import { createTestApp, fakeDatabase } from './create-test-app';

// HU-07 RF-04, criterios 3 y 4: sólo un Administrador anula el recargo, con motivo, y queda registrado.
const PASSWORD = 'Clave-Segura-2026';
const CONSORCIO = 'consorcio-anulacion-e2e';
jest.setTimeout(30_000);

describe('POST /api/visitas-fallidas/recargos/anular (HU-07 RF-04)', () => {
  let app: INestApplication;
  let repo: InMemoryVisitasFallidasRepository;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    repo = new InMemoryVisitasFallidasRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, repo, { usuarios }));
    const hash = await bcrypt.hash(PASSWORD, 4);
    const roles: Rol[] = ['administrador', 'secretaria', 'rt_calle', 'firmante', 'eca'];
    for (const rol of roles) {
      await usuarios.crear({ usuario: rol, nombre: rol, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA-E2E' : null });
      const login = await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: rol, password: PASSWORD });
      expect(login.status).toBe(200);
      tokens[rol] = login.body.accessToken;
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const como = (rol: string) => ({
    registrar: () =>
      http().post('/api/visitas-fallidas').set('Authorization', `Bearer ${tokens[rol]}`).send({
        consorcioId: CONSORCIO, fotoFrenteUrl: 'https://f/1.jpg', gps: { latitud: -34.6, longitud: -58.4 },
      }),
    anular: (cuerpo: Record<string, unknown>) =>
      http().post('/api/visitas-fallidas/recargos/anular').set('Authorization', `Bearer ${tokens[rol]}`).send(cuerpo),
    liquidar: (periodo: string, maquinaId = 'maq-1') =>
      http().post('/api/visitas-fallidas/liquidar-maquina').set('Authorization', `Bearer ${tokens[rol]}`).send({ consorcioId: CONSORCIO, maquinaId, referenciaAgc: 'M1', periodo, montoBase: 100000 }),
  });
  const mesActual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7);

  beforeEach(async () => {
    repo.registros.length = 0;
    repo.anulaciones.length = 0;
    for (let i = 0; i < 3; i++) expect((await como('secretaria').registrar()).status).toBe(201);
  });

  it('criterio 3: el Administrador anula con motivo → 201, queda registrado con su usuario, y la liquidación deja de incluir el recargo', async () => {
    const antes = await como('administrador').liquidar(mesActual());
    expect(antes.body.recargoAplicado).toBe(true);

    const res = await como('administrador').anular({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: 'Error de carga de la Secretaría' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ consorcioId: CONSORCIO, maquinaId: 'maq-1', usuario: 'administrador', motivo: 'Error de carga de la Secretaría' });
    expect(Number.isNaN(Date.parse(res.body.fecha))).toBe(false);
    expect(repo.anulaciones).toHaveLength(1);
    const despues = await como('administrador').liquidar(mesActual());
    expect(despues.body).toMatchObject({ recargoAplicado: false, montoRecargo: 0, recargoNoAplicadoPor: 'anulado' });
    expect(despues.body.recargoAnulado).toMatchObject({ usuario: 'administrador', motivo: 'Error de carga de la Secretaría' });
  });

  it('criterio 3: el usuario lo pone el servidor desde la sesión, no el cuerpo', async () => {
    const res = await como('administrador').anular({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: 'x', usuario: 'otra.persona' });

    expect(res.status).toBe(201);
    expect(res.body.usuario).toBe('administrador');
  });

  it('criterio 3: sin motivo → 400 y no registra nada', async () => {
    const res = await como('administrador').anular({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: '   ' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('motivo es obligatorio');
    expect(repo.anulaciones).toHaveLength(0);
  });

  it.each(['secretaria', 'rt_calle', 'firmante', 'eca'])('criterio 4: el rol %s recibe 403 y el recargo no se anula', async (rol) => {
    const res = await como(rol).anular({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: 'quiero anularlo' });

    expect(res.status).toBe(403);
    expect(repo.anulaciones).toHaveLength(0);
    expect((await como('administrador').liquidar(mesActual())).body.recargoAplicado).toBe(true);
  });

  it('criterio 4: sin sesión recibe 401', async () => {
    const res = await http().post('/api/visitas-fallidas/recargos/anular').send({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: 'x' });

    expect(res.status).toBe(401);
    expect(repo.anulaciones).toHaveLength(0);
  });

  it('anular dos veces el mismo recargo → 409', async () => {
    await como('administrador').anular({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: 'primera' });

    const res = await como('administrador').anular({ consorcioId: CONSORCIO, maquinaId: 'maq-1', motivo: 'segunda' });

    expect(res.status).toBe(409);
    expect(repo.anulaciones).toHaveLength(1);
  });
});

import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { InMemoryVisitasFallidasRepository } from '../src/visitas-fallidas/visitas-fallidas.repository';
import { createTestApp, fakeDatabase } from './create-test-app';

// HU-07 RF-05 por HTTP, con roles reales: el recorrido del RT, el desbloqueo por la Secretaría y el mínimo de 1 día entre visitas.
const PASSWORD = 'Clave-Segura-2026';
const A = 'edificio-a';
const B = 'edificio-b';
jest.setTimeout(30_000);

async function armar(env: Record<string, string>) {
  const usuarios = new InMemoryUsuariosRepository();
  const repo = new InMemoryVisitasFallidasRepository();
  repo.edificios = [{ id: A, nombre: 'Edificio A', direccion: 'Calle A 1' }, { id: B, nombre: 'Edificio B', direccion: 'Calle B 2' }];
  const { app } = await createTestApp({ NODE_ENV: 'development', ...env }, fakeDatabase(), undefined, repo, { usuarios });
  const hash = await bcrypt.hash(PASSWORD, 4);
  const tokens: Record<string, string> = {};
  const roles: Rol[] = ['administrador', 'secretaria', 'rt_calle', 'firmante', 'eca'];
  for (const rol of roles) {
    await usuarios.crear({ usuario: rol, nombre: rol, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA-E2E' : null });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: rol, password: PASSWORD });
    tokens[rol] = login.body.accessToken;
  }
  return { app, repo, tokens };
}

describe('Recorrido del RT y desbloqueo por la Secretaría (HU-07 RF-05)', () => {
  let app: INestApplication;
  let repo: InMemoryVisitasFallidasRepository;
  let tokens: Record<string, string>;

  beforeAll(async () => {
    ({ app, repo, tokens } = await armar({ VISITAS_FALLIDAS_MIN_DIAS: '0' })); // acá se registran varias visitas seguidas
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    repo.registros.length = 0;
    repo.desbloqueos.length = 0;
    repo.inspecciones.clear();
  });

  const http = () => request(app.getHttpServer());
  const como = (rol: string) => ({
    fallar: (consorcioId = A) =>
      http().post('/api/visitas-fallidas').set('Authorization', `Bearer ${tokens[rol]}`).send({ consorcioId, fotoFrenteUrl: 'https://f/1.jpg', gps: { latitud: -34.6, longitud: -58.4 } }),
    recorrido: () => http().get('/api/recorrido').set('Authorization', `Bearer ${tokens[rol]}`),
    desbloquear: (cuerpo: Record<string, unknown>, consorcioId = A) =>
      http().post(`/api/visitas-fallidas/consorcio/${consorcioId}/desbloquear`).set('Authorization', `Bearer ${tokens[rol]}`).send(cuerpo),
  });
  const bloquearA = async () => {
    for (let i = 0; i < 3; i++) expect((await como('secretaria').fallar()).status).toBe(201);
  };
  /** Pasan dos días: un edificio con visita fallida de hoy no está en el recorrido del RT (HU-07 RF-06), así que estas pruebas miran al día siguiente. */
  const pasaronDosDias = () => {
    for (const r of repo.registros) r.fechaHora = new Date(Date.parse(r.fechaHora) - 2 * 86_400_000).toISOString();
  };

  it('criterio 1: el edificio bloqueado no aparece en el recorrido del RT; sí en el de la Secretaría y el Administrador, con el estado', async () => {
    await bloquearA();

    const rt = await como('rt_calle').recorrido();
    expect(rt.status).toBe(200);
    expect(rt.body.map((e: { id: string }) => e.id)).toEqual([B]);
    for (const rol of ['secretaria', 'administrador']) {
      const todos = await como(rol).recorrido();
      expect(todos.body.map((e: { id: string; bloqueado: boolean }) => `${e.id}:${e.bloqueado}`)).toEqual([`${A}:true`, `${B}:false`]);
    }
  });

  it.each(['firmante', 'eca'])('el recorrido no es para el rol %s (403) y sin sesión da 401', async (rol) => {
    expect((await como(rol).recorrido()).status).toBe(403);
    expect((await http().get('/api/recorrido')).status).toBe(401);
  });

  it.each(['secretaria', 'administrador'])('criterio 2: %s desbloquea con motivo → 201, a su nombre; el edificio vuelve al recorrido del RT', async (rol) => {
    await bloquearA();
    pasaronDosDias();

    const res = await como(rol).desbloquear({ motivo: 'Se coordinó con el encargado' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ consorcioId: A, usuario: rol, motivo: 'Se coordinó con el encargado' });
    expect(Number.isNaN(Date.parse(res.body.fecha))).toBe(false);
    expect(repo.desbloqueos).toHaveLength(1);
    expect((await como('rt_calle').recorrido()).body.map((e: { id: string }) => e.id)).toEqual([A, B]);
  });

  it('el usuario del desbloqueo sale de la sesión, no del cuerpo', async () => {
    await bloquearA();

    const res = await como('secretaria').desbloquear({ motivo: 'x', usuario: 'otra.persona' });

    expect(res.body.usuario).toBe('secretaria');
  });

  it('criterio 2: sin motivo → 400 y sigue bloqueado', async () => {
    await bloquearA();

    for (const motivo of [undefined, '', '   ']) expect((await como('secretaria').desbloquear({ motivo })).status).toBe(400);

    expect(repo.desbloqueos).toHaveLength(0);
    expect((await como('rt_calle').recorrido()).body.map((e: { id: string }) => e.id)).toEqual([B]);
  });

  it.each(['rt_calle', 'firmante', 'eca'])('el rol %s no desbloquea (403) y sin sesión da 401', async (rol) => {
    await bloquearA();

    expect((await como(rol).desbloquear({ motivo: 'x' })).status).toBe(403);
    expect((await http().post(`/api/visitas-fallidas/consorcio/${A}/desbloquear`).send({ motivo: 'x' })).status).toBe(401);
    expect(repo.desbloqueos).toHaveLength(0);
  });

  it('un edificio que no está bloqueado → 409; dos veces → 409', async () => {
    expect((await como('secretaria').desbloquear({ motivo: 'x' }, B)).status).toBe(409);

    await bloquearA();
    expect((await como('secretaria').desbloquear({ motivo: 'primera' })).status).toBe(201);
    expect((await como('secretaria').desbloquear({ motivo: 'segunda' })).status).toBe(409);
  });

  it('criterio 4: una visita exitosa (inspección) reinicia el contador: el edificio deja de estar bloqueado y la próxima falla es Advertencia 1', async () => {
    await bloquearA();
    pasaronDosDias();
    repo.inspecciones.set(A, new Date().toISOString());
    await new Promise((r) => setTimeout(r, 5));

    expect((await como('rt_calle').recorrido()).body.map((e: { id: string }) => e.id)).toEqual([A, B]);
    const nueva = await como('secretaria').fallar();
    expect(nueva.body.numeroAdvertencia).toBe(1);
  });

  describe('criterio 3: con el mínimo de 1 día entre visitas fallidas (la configuración por defecto)', () => {
    let app1: INestApplication;
    let tokens1: Record<string, string>;
    beforeAll(async () => {
      ({ app: app1, tokens: tokens1 } = await armar({ VISITAS_FALLIDAS_MIN_DIAS: '1' }));
    });
    afterAll(async () => {
      await app1?.close();
    });
    const fallar = (consorcioId: string) =>
      request(app1.getHttpServer()).post('/api/visitas-fallidas').set('Authorization', `Bearer ${tokens1.secretaria}`).send({ consorcioId, fotoFrenteUrl: 'https://f/1.jpg', gps: { latitud: -34.6, longitud: -58.4 } });

    it('una segunda visita fallida del mismo edificio el mismo día responde 409 y no suma advertencia; otro edificio sí puede', async () => {
      expect((await fallar('edificio-dia-1')).status).toBe(201);

      const repetida = await fallar('edificio-dia-1');

      expect(repetida.status).toBe(409);
      expect(repetida.body.message).toContain('ya tiene una visita fallida de hoy');
      expect((await request(app1.getHttpServer()).get('/api/visitas-fallidas/consorcio/edificio-dia-1').set('Authorization', `Bearer ${tokens1.secretaria}`)).body.totalAdvertencias).toBe(1);
      expect((await fallar('edificio-dia-2')).status).toBe(201);
    });
  });
});

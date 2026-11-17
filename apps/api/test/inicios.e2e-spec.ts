import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { InMemoryIniciosRepository } from '../src/inicios-inspeccion/inicios.repository';
import { createTestApp, fakeDatabase, MailerDePrueba } from './create-test-app';

// HU-16 RF-02 por HTTP, con roles reales: iniciar la inspección a 30 m o menos, o «Sin buena señal GPS» con foto y justificación.
const PASSWORD = 'Clave-Segura-2026';
const EDIFICIO = 'edif-inicio';
const SIN_PUNTO = 'edif-sin-punto';
const PUNTO = { latitud: -34.6118, longitud: -58.396 };
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
jest.setTimeout(30_000);

describe('Inicio de la inspección con validación de presencia (HU-16 RF-02)', () => {
  let app: INestApplication;
  let repo: InMemoryIniciosRepository;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    repo = new InMemoryIniciosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, undefined, { usuarios }, undefined, undefined, new MailerDePrueba(), undefined, undefined, repo));
    const hash = await bcrypt.hash(PASSWORD, 4);
    const roles: Rol[] = ['administrador', 'secretaria', 'rt_calle', 'firmante', 'eca'];
    for (const rol of roles) {
      await usuarios.crear({ usuario: rol, nombre: rol, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA-E2E' : null });
      tokens[rol] = (await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: rol, password: PASSWORD })).body.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    repo.inicios.length = 0;
    repo.edificios.clear();
    repo.edificios.set(EDIFICIO, PUNTO);
    repo.edificios.set(SIN_PUNTO, null);
  });

  const http = () => request(app.getHttpServer());
  const ahora = () => new Date().toISOString();
  const cuerpo = (extra: Record<string, unknown> = {}, gps: Record<string, unknown> = {}) => ({
    consorcioId: EDIFICIO,
    gps: { latitud: PUNTO.latitud + 0.00025, longitud: PUNTO.longitud, precision: 6, timestamp: ahora(), ...gps }, // a unos 27,8 m
    horaDispositivo: ahora(),
    ...extra,
  });
  const iniciar = (c: Record<string, unknown>, rol = 'rt_calle') => http().post('/api/inicios-inspeccion').set('Authorization', `Bearer ${tokens[rol]}`).send(c);
  const lista = (rol: string, q = '') => http().get(`/api/inicios-inspeccion${q}`).set('Authorization', `Bearer ${tokens[rol]}`);

  describe('criterio 2: a 30 m o menos se puede iniciar; más lejos, no', () => {
    it('a 27,8 m con buena señal → 201 con la distancia medida por la API, sin revisión', async () => {
      const res = await iniciar(cuerpo());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ consorcioId: EDIFICIO, distanciaM: 27.8, sinBuenaSenal: false, revision: 'no_requiere', fotoFrenteUrl: null, justificacion: null });
    });

    it('a 33,4 m con buena señal → 409 que dice a cuántos metros está, y no se guarda nada', async () => {
      const res = await iniciar(cuerpo({}, { latitud: PUNTO.latitud + 0.0003 }));

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Estás a 33 m del edificio.*30 m o menos/);
      expect(repo.inicios).toHaveLength(0);
    });

    it('la distancia la mide la API: la «distanciaM» que mande el celular se ignora y queda la medida (27,8 m)', async () => {
      const res = await iniciar(cuerpo({ distanciaM: 1, usuario: 'otra.persona' }));

      expect(res.status).toBe(201);
      expect(res.body.distanciaM).toBe(27.8);
      expect(res.body.usuario).toBe('rt_calle');
    });

    it('un «sinBuenaSenal» o una «distanciaM» que mande el celular no abren el paso a más de 30 m', async () => {
      const res = await iniciar(cuerpo({ distanciaM: 1, sinBuenaSenal: true }, { latitud: PUNTO.latitud + 0.01 }));

      expect(res.status).toBe(409);
    });
  });

  describe('criterio 3: «Sin buena señal GPS» exige foto del frente y justificación, y marca la visita para revisión', () => {
    const mala = { precision: 80 };

    it('con foto y justificación → 201, sin buena señal, pendiente de revisión de la Secretaría', async () => {
      const res = await iniciar(cuerpo({ fotoFrenteUrl: FOTO, justificacion: '  Entre edificios altos, el GPS no mejora  ' }, mala));

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ sinBuenaSenal: true, revision: 'pendiente', fotoFrenteUrl: FOTO, justificacion: 'Entre edificios altos, el GPS no mejora' });
    });

    it.each([
      ['sin foto', { justificacion: 'Entre edificios altos, el GPS no mejora' }],
      ['sin justificación', { fotoFrenteUrl: FOTO }],
      ['con una justificación de espacios', { fotoFrenteUrl: FOTO, justificacion: '          ' }],
      ['con una justificación demasiado corta', { fotoFrenteUrl: FOTO, justificacion: 'no anda' }],
      ['con una justificación demasiado larga', { fotoFrenteUrl: FOTO, justificacion: 'x'.repeat(501) }],
      ['sin nada', {}],
    ])('%s → 400 que dice qué falta y no se guarda', async (_n, extra) => {
      const res = await iniciar(cuerpo(extra, mala));

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.errores)).toMatch(/Sin buena señal GPS: hace falta/);
      expect(repo.inicios).toHaveLength(0);
    });

    it('el mensaje nombra lo que falta: la foto, la justificación o las dos', async () => {
      expect(JSON.stringify((await iniciar(cuerpo({ justificacion: 'Entre edificios altos' }, mala))).body.errores)).toMatch(/la foto del frente/);
      expect(JSON.stringify((await iniciar(cuerpo({ fotoFrenteUrl: FOTO }, mala))).body.errores)).toMatch(/justificación escrita/);
      expect(JSON.stringify((await iniciar(cuerpo({}, mala))).body.errores)).toMatch(/la foto del frente del edificio y una justificación/);
    });

    it('con mala señal no importa a cuántos metros esté: se acepta con foto y justificación y queda para revisar', async () => {
      const res = await iniciar(cuerpo({ fotoFrenteUrl: FOTO, justificacion: 'No hay señal en el subsuelo' }, { ...mala, latitud: PUNTO.latitud + 0.01 }));

      expect(res.status).toBe(201);
      expect(res.body.distanciaM).toBeGreaterThan(1000);
      expect(res.body.revision).toBe('pendiente');
    });

    it('un edificio sin punto en el mapa no se puede verificar: también pide foto y justificación', async () => {
      expect((await iniciar(cuerpo({ consorcioId: SIN_PUNTO }))).status).toBe(400);

      const ok = await iniciar(cuerpo({ consorcioId: SIN_PUNTO, fotoFrenteUrl: FOTO, justificacion: 'El edificio no tiene punto en el mapa' }));

      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ sinBuenaSenal: true, distanciaM: null, revision: 'pendiente' });
    });

    it('la foto y la justificación de una visita con buena señal no se guardan (no hacen falta)', async () => {
      const res = await iniciar(cuerpo({ fotoFrenteUrl: FOTO, justificacion: 'No hacía falta decir nada' }));

      expect(res.body).toMatchObject({ sinBuenaSenal: false, fotoFrenteUrl: null, justificacion: null });
    });

    it('la Secretaría ve las visitas pendientes de revisión y las marca como revisadas (una sola vez)', async () => {
      const a = await iniciar(cuerpo({ fotoFrenteUrl: FOTO, justificacion: 'Entre edificios altos' }, mala));
      await iniciar(cuerpo()); // con buena señal: no requiere revisión

      const pendientes = await lista('secretaria', '?revision=pendiente');
      expect(pendientes.body.map((i: { id: string }) => i.id)).toEqual([a.body.id]);
      expect((await lista('administrador')).body).toHaveLength(2);

      const rev = await http().post(`/api/inicios-inspeccion/${a.body.id}/revisar`).set('Authorization', `Bearer ${tokens.secretaria}`);
      expect(rev.status).toBe(201);
      expect(rev.body).toMatchObject({ revision: 'revisada', revisadaPor: 'secretaria' });
      expect((await lista('secretaria', '?revision=pendiente')).body).toEqual([]);
      expect((await http().post(`/api/inicios-inspeccion/${a.body.id}/revisar`).set('Authorization', `Bearer ${tokens.secretaria}`)).status).toBe(404);
    });

    it('un valor de revisión inválido → 400', async () => {
      expect((await lista('secretaria', '?revision=cualquiera')).status).toBe(400);
    });
  });

  describe('criterio 4: se registran coordenadas, precisión, hora del dispositivo y hora del servidor; nada se edita', () => {
    it('guarda todo, con la hora del servidor puesta por la API y el usuario de la sesión', async () => {
      const antes = Date.now();
      const horaCelular = new Date(antes - 120_000).toISOString();
      const res = await iniciar(cuerpo({ horaDispositivo: horaCelular, horaServidor: '2020-01-01T00:00:00Z', usuario: 'otra.persona' }, { timestamp: new Date(antes - 130_000).toISOString() }));

      expect(res.status).toBe(201);
      expect(res.body.gps).toEqual({ latitud: PUNTO.latitud + 0.00025, longitud: PUNTO.longitud, precision: 6 });
      expect(res.body.horaDispositivo).toBe(horaCelular);
      expect(Date.parse(res.body.horaServidor)).toBeGreaterThanOrEqual(antes);
      expect(res.body.usuario).toBe('rt_calle');
    });

    it('no hay forma de editarlo por la API (PUT, PATCH y DELETE no existen)', async () => {
      const r = await iniciar(cuerpo());

      for (const metodo of ['put', 'patch', 'delete'] as const) {
        const res = await http()[metodo](`/api/inicios-inspeccion/${r.body.id}`).set('Authorization', `Bearer ${tokens.administrador}`).send({ gps: { latitud: 0 } });
        expect(res.status).toBe(404);
      }
      expect(repo.inicios[0].gps.latitud).toBe(PUNTO.latitud + 0.00025);
    });

    it.each([
      ['sin consorcioId', { consorcioId: undefined }],
      ['sin hora del dispositivo', { horaDispositivo: undefined }],
      ['con una hora que no es fecha', { horaDispositivo: 'ayer' }],
      ['sin gps', { gps: undefined }],
      ['con latitud fuera de rango', { gps: { latitud: 91, longitud: 0, precision: 5 } }],
      ['con longitud fuera de rango', { gps: { latitud: 0, longitud: 181, precision: 5 } }],
      ['con precisión negativa', { gps: { latitud: PUNTO.latitud, longitud: PUNTO.longitud, precision: -1 } }],
      ['con latitud en texto', { gps: { latitud: '-34.6', longitud: PUNTO.longitud, precision: 5 } }],
    ])('%s → 400', async (_n, extra) => {
      expect((await iniciar({ ...cuerpo(), ...extra })).status).toBe(400);
      expect(repo.inicios).toHaveLength(0);
    });

    it('una ubicación de hace más de 5 minutos se rechaza (400): hay que verificar de nuevo; una de hace 4 minutos sirve', async () => {
      const vieja = await iniciar(cuerpo({}, { timestamp: new Date(Date.now() - 6 * 60_000).toISOString() }));
      expect(vieja.status).toBe(400);
      expect(JSON.stringify(vieja.body.errores)).toMatch(/ubicación es vieja/);

      expect((await iniciar(cuerpo({}, { timestamp: new Date(Date.now() - 4 * 60_000).toISOString() }))).status).toBe(201);
    });

    it('una ubicación del futuro respecto de la hora del dispositivo se rechaza', async () => {
      expect((await iniciar(cuerpo({}, { timestamp: new Date(Date.now() + 5 * 60_000).toISOString() }))).status).toBe(400);
    });
  });

  describe('roles y edificios', () => {
    it.each(['secretaria', 'administrador', 'firmante', 'eca'])('el rol %s no inicia inspecciones (403)', async (rol) => {
      expect((await iniciar(cuerpo(), rol)).status).toBe(403);
      expect(repo.inicios).toHaveLength(0);
    });

    it.each(['rt_calle', 'firmante', 'eca'])('el rol %s no ve la lista ni revisa (403); sin sesión 401', async (rol) => {
      expect((await lista(rol)).status).toBe(403);
      expect((await http().post('/api/inicios-inspeccion/x/revisar').set('Authorization', `Bearer ${tokens[rol]}`)).status).toBe(403);
      expect((await http().get('/api/inicios-inspeccion')).status).toBe(401);
      expect((await http().post('/api/inicios-inspeccion').send(cuerpo())).status).toBe(401);
    });

    it('un edificio que no existe o que el RT no tiene asignado → 404', async () => {
      expect((await iniciar(cuerpo({ consorcioId: 'no-existe' }))).status).toBe(404);
    });
  });
});

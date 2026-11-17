import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { InMemoryHorariosRepository } from '../src/horarios/horarios.repository';
import { createTestApp, fakeDatabase, MailerDePrueba } from './create-test-app';

// HU-01 RF-04 por HTTP, con roles reales.
const PASSWORD = 'Clave-Segura-2026';
const EDIFICIO = 'edificio-horarios';
const DOS = [{ desde: '08:00', hasta: '12:00' }, { desde: '17:00', hasta: '20:00' }];
jest.setTimeout(30_000);

describe('Horarios de atención por edificio (HU-01 RF-04)', () => {
  let app: INestApplication;
  let repo: InMemoryHorariosRepository;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    repo = new InMemoryHorariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, undefined, { usuarios }, undefined, undefined, new MailerDePrueba(), repo));
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
    repo.edificios.clear();
    repo.horarios.clear();
    repo.agregarEdificio(EDIFICIO);
  });

  const url = `/api/consorcios/${EDIFICIO}/horarios`;
  const como = (rol: string) => ({
    ver: () => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${tokens[rol]}`),
    guardar: (c: Record<string, unknown>) => request(app.getHttpServer()).put(url).set('Authorization', `Bearer ${tokens[rol]}`).send(c),
    abierto: (en?: string) => request(app.getHttpServer()).get(`${url}/abierto`).query(en ? { en } : {}).set('Authorization', `Bearer ${tokens[rol]}`),
  });

  it('criterio 1: un edificio nuevo arranca con lunes a viernes de 08:00 a 12:00 y de 17:00 a 20:00', async () => {
    const res = await como('secretaria').ver();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ aCoordinar: false, porDefecto: true });
    expect(Object.keys(res.body.franjas)).toEqual(['lunes', 'martes', 'miercoles', 'jueves', 'viernes']);
    expect(res.body.franjas.viernes).toEqual(DOS);
  });

  it.each(['secretaria', 'administrador'])('criterio 2: %s edita las franjas por día y queda quién lo hizo', async (rol) => {
    const res = await como(rol).guardar({ franjas: { lunes: DOS, sabado: [{ desde: '09:00', hasta: '13:00' }] } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ porDefecto: false, actualizadoPor: rol, franjas: { lunes: DOS, sabado: [{ desde: '09:00', hasta: '13:00' }] } });
    expect((await como('secretaria').ver()).body.franjas.martes).toBeUndefined(); // lo no mandado queda cerrado
  });

  it.each([
    ['fin anterior al inicio', { lunes: [{ desde: '12:00', hasta: '08:00' }] }, /posterior a la de inicio/],
    ['franjas superpuestas', { lunes: [{ desde: '08:00', hasta: '12:00' }, { desde: '10:00', hasta: '14:00' }] }, /se superponen/],
    ['3 franjas', { lunes: [...DOS, { desde: '21:00', hasta: '22:00' }] }, /como máximo 2/],
  ])('criterio 2: %s → 400 con el motivo y no se guarda', async (_n, franjas, motivo) => {
    const res = await como('secretaria').guardar({ franjas });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.errores)).toMatch(motivo);
    expect(repo.horarios.size).toBe(0);
  });

  it('criterio 3: «A coordinar» reemplaza las franjas', async () => {
    await como('secretaria').guardar({ franjas: { lunes: DOS } });

    const res = await como('secretaria').guardar({ aCoordinar: true });

    expect(res.body).toMatchObject({ aCoordinar: true, franjas: {}, porDefecto: false });
    expect((await como('secretaria').ver()).body).toMatchObject({ aCoordinar: true, franjas: {} });
  });

  it('criterio 4: informa si está abierto en un momento dado (martes 10:00 sí, martes 12:00 no)', async () => {
    const si = await como('rt_calle').abierto('2026-11-17T10:00:00-03:00');
    const no = await como('rt_calle').abierto('2026-11-17T12:00:00-03:00');

    expect(si.body).toMatchObject({ abierto: true, motivo: 'dentro_de_franja', franjaVigente: { desde: '08:00', hasta: '12:00' } });
    expect(no.body).toMatchObject({ abierto: false, motivo: 'fuera_de_franja' });
  });

  it('criterio 4: los feriados cuentan como cerrado (lunes 23/11/2026) y la lista se puede consultar', async () => {
    const res = await como('rt_calle').abierto('2026-11-23T10:00:00-03:00');

    expect(res.body).toMatchObject({ abierto: false, motivo: 'feriado' });
    const lista = await request(app.getHttpServer()).get('/api/feriados').set('Authorization', `Bearer ${tokens.rt_calle}`);
    expect(lista.body.feriados).toContain('2026-11-23');
  });

  it('criterio 4: un edificio «A coordinar» no está abierto', async () => {
    await como('secretaria').guardar({ aCoordinar: true });

    expect((await como('firmante').abierto('2026-11-17T10:00:00-03:00')).body).toMatchObject({ abierto: false, motivo: 'a_coordinar' });
  });

  it('sin indicar el momento se evalúa ahora; un momento inválido → 400', async () => {
    const ahora = await como('secretaria').abierto();
    expect(Math.abs(Date.parse(ahora.body.en) - Date.now())).toBeLessThan(5000);

    expect((await como('secretaria').abierto('ayer')).status).toBe(400);
  });

  it.each(['rt_calle', 'firmante', 'eca'])('el rol %s no edita (403) y no cambia nada', async (rol) => {
    expect((await como(rol).guardar({ aCoordinar: true })).status).toBe(403);
    expect(repo.horarios.size).toBe(0);
  });

  it('el RT y el Firmante ven los horarios; la ECA no (403); sin sesión 401; un edificio que no existe 404', async () => {
    expect((await como('rt_calle').ver()).status).toBe(200);
    expect((await como('firmante').ver()).status).toBe(200);
    expect((await como('eca').ver()).status).toBe(403);
    expect((await como('eca').abierto()).status).toBe(403);
    expect((await request(app.getHttpServer()).get(url)).status).toBe(401);
    expect((await request(app.getHttpServer()).put(url).send({ aCoordinar: true })).status).toBe(401);
    const noExiste = await request(app.getHttpServer()).get('/api/consorcios/nada/horarios').set('Authorization', `Bearer ${tokens.secretaria}`);
    expect(noExiste.status).toBe(404);
  });
});

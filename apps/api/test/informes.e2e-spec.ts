import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { InMemoryInformesRepository } from '../src/informes/informes.repository';
import { createTestApp, fakeDatabase, MailerDePrueba } from './create-test-app';

// HU-18 RF-01 por HTTP, con roles reales: cerrar el informe con la firma del encargado o «Sin firma».
const PASSWORD = 'Clave-Segura-2026';
const EDIFICIO = 'edif-informe';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
const TRAZO = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);
jest.setTimeout(30_000);

describe('Informe consolidado de la visita: firma y «Sin firma» (HU-18 RF-01)', () => {
  let app: INestApplication;
  let repo: InMemoryInformesRepository;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    repo = new InMemoryInformesRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, undefined, { usuarios }, undefined, undefined, new MailerDePrueba(), undefined, undefined, undefined, undefined, undefined, repo));
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
    repo.informes.length = 0;
    repo.edificios.clear();
    repo.edificios.add(EDIFICIO);
  });

  const http = () => request(app.getHttpServer());
  const equipo = (extra: Record<string, unknown> = {}) => ({ maquinaId: 'm1', referenciaAgc: 'M1', tipo: 'traccion', estadoEquipo: 'en_uso', respuestas: { sala_maquinas: { item1: 'ok' } }, observaciones: {}, fotos: {}, ...extra });
  const firma = (extra: Record<string, unknown> = {}) => ({ nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', dni: '12.345.678', imagen: PNG, trazos: [TRAZO], ...extra });
  const informe = (extra: Record<string, unknown> = {}) => ({ consorcioId: EDIFICIO, horaDispositivo: new Date().toISOString(), equipos: [equipo()], firma: firma(), ...extra });
  const cerrar = (cuerpo: unknown, rol = 'rt_calle') => http().post('/api/informes-visita').set('Authorization', `Bearer ${tokens[rol]}`).send(cuerpo as object);
  const ver = (rol: string, ruta = '') => http().get(`/api/informes-visita${ruta}`).set('Authorization', `Bearer ${tokens[rol]}`);

  it('cierra el informe con la firma del encargado → 201, a nombre del RT de la sesión, sin revisión', async () => {
    const res = await cerrar(informe({ usuario: 'otra.persona', requiereRevision: true }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ consorcioId: EDIFICIO, usuario: 'rt_calle', requiereRevision: false, sinFirma: null });
    expect(res.body.firma).toMatchObject({ nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', dni: '12345678' });
    expect(Number.isNaN(Date.parse(res.body.horaServidor))).toBe(false);
    expect(repo.informes).toHaveLength(1);
  });

  it('criterio 3: sin DNI es válido; sin nombre, apellido o carácter → 400 y no se guarda', async () => {
    expect((await cerrar(informe({ firma: firma({ dni: undefined }) }))).status).toBe(201);
    repo.informes.length = 0;
    for (const extra of [{ nombre: '' }, { apellido: '' }, { caracter: 'Vecino' }, { caracter: undefined }]) {
      expect((await cerrar(informe({ firma: firma(extra) }))).status).toBe(400);
    }
    expect(repo.informes).toHaveLength(0);
  });

  it('criterio 2: la firma vacía (sin trazos o con un trazo mínimo) → 400 y no se guarda', async () => {
    const res = await cerrar(informe({ firma: firma({ trazos: [] }) }));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.errores)).toMatch(/La firma está vacía/);
    expect((await cerrar(informe({ firma: firma({ trazos: [[[5, 5], [6, 5]]] }) }))).status).toBe(400);
    expect(repo.informes).toHaveLength(0);
  });

  it('criterio 4: «Sin firma» con motivo y foto → 201 marcado para revisión; sin foto o sin motivo → 400', async () => {
    const ok = await cerrar(informe({ firma: undefined, sinFirma: { motivo: 'El encargado no está y nadie atiende', foto: JPG } }));

    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ requiereRevision: true, firma: null, sinFirma: { motivo: 'El encargado no está y nadie atiende' } });
    expect((await cerrar(informe({ firma: undefined, sinFirma: { motivo: 'El encargado no está y nadie atiende' } }))).status).toBe(400);
    expect((await cerrar(informe({ firma: undefined, sinFirma: { foto: JPG } }))).status).toBe(400);
    expect(repo.informes).toHaveLength(1);
  });

  it('la firma y «Sin firma» juntas, o ninguna de las dos, → 400', async () => {
    expect((await cerrar(informe({ sinFirma: { motivo: 'El encargado no está', foto: JPG } }))).status).toBe(400);
    expect((await cerrar(informe({ firma: undefined }))).status).toBe(400);
  });

  it('acepta un informe con fotos que superan los 100 KB (el límite del cuerpo se subió a 25 MB)', async () => {
    const fotoGrande = `data:image/jpeg;base64,${'A'.repeat(600_000)}`;

    const res = await cerrar(informe({ equipos: [equipo({ fotos: { a: { dataUrl: fotoGrande }, b: { dataUrl: fotoGrande } } })] }));

    expect(res.status).toBe(201);
    expect(repo.informes[0].equipos[0].fotos).toHaveProperty('b');
  });

  it('los informes «Sin firma» los ven la Secretaría, el Administrador y el Firmante, filtrados y sin la firma ni las fotos en el listado', async () => {
    await cerrar(informe());
    const sin = await cerrar(informe({ firma: undefined, sinFirma: { motivo: 'El encargado no está y nadie atiende', foto: JPG } }));

    for (const rol of ['secretaria', 'administrador', 'firmante']) {
      const lista = await ver(rol, '?sinFirma=true');
      expect(lista.status).toBe(200);
      expect(lista.body).toEqual([expect.objectContaining({ id: sin.body.id, requiereRevision: true, motivoSinFirma: 'El encargado no está y nadie atiende', firmante: null, equipos: 1 })]);
      expect(JSON.stringify(lista.body)).not.toContain('data:image');
    }
    expect((await ver('secretaria', '?sinFirma=false')).body).toHaveLength(1);
    expect((await ver('secretaria')).body).toHaveLength(2);
    expect((await ver('secretaria', '?sinFirma=quizas')).status).toBe(400);
  });

  it('el detalle de un informe trae todo y uno que no existe da 404', async () => {
    const r = await cerrar(informe());

    const res = await ver('firmante', `/${r.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.firma.imagen).toBe(PNG);
    expect((await ver('firmante', '/no-existe')).status).toBe(404);
  });

  it('un edificio que no existe o que el RT no tiene asignado → 404', async () => {
    expect((await cerrar(informe({ consorcioId: 'no-existe' }))).status).toBe(404);
    expect(repo.informes).toHaveLength(0);
  });

  it.each(['secretaria', 'administrador', 'firmante', 'eca'])('el rol %s no cierra informes (403); sin sesión 401', async (rol) => {
    expect((await cerrar(informe(), rol)).status).toBe(403);
    expect((await http().post('/api/informes-visita').send(informe())).status).toBe(401);
    expect(repo.informes).toHaveLength(0);
  });

  it.each(['rt_calle', 'eca'])('el rol %s no ve los informes (403); sin sesión 401', async (rol) => {
    expect((await ver(rol)).status).toBe(403);
    expect((await http().get('/api/informes-visita')).status).toBe(401);
  });
});

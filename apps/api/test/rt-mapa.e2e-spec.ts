import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { InMemoryHorariosRepository } from '../src/horarios/horarios.repository';
import { InMemoryRtMapaRepository } from '../src/rt-mapa/rt-mapa.repository';
import { InMemoryVisitasFallidasRepository } from '../src/visitas-fallidas/visitas-fallidas.repository';
import { createTestApp, fakeDatabase, MailerDePrueba } from './create-test-app';

// HU-16 RF-01 por HTTP, con roles reales: la zona del RT y los edificios que muestra su mapa.
const PASSWORD = 'Clave-Segura-2026';
const A = 'edif-a';
const B = 'edif-b';
const C = 'edif-c';
jest.setTimeout(30_000);

describe('Mapa del RT (HU-16 RF-01)', () => {
  let app: INestApplication;
  let visitas: InMemoryVisitasFallidasRepository;
  let horarios: InMemoryHorariosRepository;
  let rtMapa: InMemoryRtMapaRepository;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    visitas = new InMemoryVisitasFallidasRepository();
    horarios = new InMemoryHorariosRepository();
    rtMapa = new InMemoryRtMapaRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, visitas, { usuarios }, undefined, undefined, new MailerDePrueba(), horarios, rtMapa));
    const hash = await bcrypt.hash(PASSWORD, 4);
    const roles: Rol[] = ['administrador', 'secretaria', 'rt_calle', 'firmante', 'eca'];
    for (const rol of roles) {
      const u = await usuarios.crear({ usuario: rol, nombre: rol === 'rt_calle' ? 'Ing. Aliado 1' : rol, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA-E2E' : null });
      ids[rol] = u!.id;
      tokens[rol] = (await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: rol, password: PASSWORD })).body.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    visitas.registros.length = 0;
    visitas.desbloqueos.length = 0;
    visitas.inspecciones.clear();
    visitas.edificios = [
      { id: A, nombre: 'Edificio A', direccion: 'Calle A 1' },
      { id: B, nombre: 'Edificio B', direccion: 'Calle B 2' },
      { id: C, nombre: 'Edificio C', direccion: 'Calle C 3' },
    ];
    horarios.edificios.clear();
    horarios.horarios.clear();
    rtMapa.edificios.clear();
    for (const [id, lat, lng] of [[A, -34.6, -58.4], [B, -34.58, -58.42], [C, -34.62, -58.38]] as const) {
      horarios.agregarEdificio(id);
      rtMapa.edificios.set(id, { ubicacion: { latitud: lat, longitud: lng }, maquinas: 2, inspeccionadasHoy: 0, encargado: { nombre: `Encargado ${id}`, telefono: '11 5555-0000' } });
    }
  });

  const http = () => request(app.getHttpServer());
  const mapa = (rol = 'rt_calle') => http().get('/api/rt/mapa').set('Authorization', `Bearer ${tokens[rol]}`);
  const fallar = (consorcioId: string) =>
    http().post('/api/visitas-fallidas').set('Authorization', `Bearer ${tokens.secretaria}`).send({ consorcioId, fotoFrenteUrl: 'https://f/1.jpg', gps: { latitud: -34.6, longitud: -58.4 } });
  const zona = (rol: string, id: string, cuerpo: unknown) => http().put(`/api/usuarios/${id}/zona`).set('Authorization', `Bearer ${tokens[rol]}`).send(cuerpo as object);

  describe('el encabezado: nombre, zona y hora del servidor', () => {
    it('trae el nombre del RT, su zona (null si no tiene), la hora del servidor y los feriados', async () => {
      const antes = Date.now();
      const sinZona = await mapa();

      expect(sinZona.status).toBe(200);
      expect(sinZona.body.rt).toEqual({ nombre: 'Ing. Aliado 1', zona: null });
      expect(Math.abs(Date.parse(sinZona.body.ahora) - antes)).toBeLessThan(5000);
      expect(sinZona.body.feriados).toContain('2026-11-23');
      expect(sinZona.body.presencia).toEqual({ radioM: 30, precisionMaxM: 30 });

      expect((await zona('administrador', ids.rt_calle, { zona: 'Norte' })).status).toBe(200);
      expect((await mapa()).body.rt).toEqual({ nombre: 'Ing. Aliado 1', zona: 'Norte' });
    });

    it('sólo el Administrador carga la zona y sólo a un RT; el texto se limpia y vacío o null la borra', async () => {
      expect((await zona('secretaria', ids.rt_calle, { zona: 'Sur' })).status).toBe(403);
      expect((await zona('rt_calle', ids.rt_calle, { zona: 'Sur' })).status).toBe(403);
      expect((await zona('administrador', ids.secretaria, { zona: 'Sur' })).status).toBe(409);
      expect((await zona('administrador', 'no-existe', { zona: 'Sur' })).status).toBe(404);

      expect((await zona('administrador', ids.rt_calle, { zona: '  Zona Sur  ' })).body.zona).toBe('Zona Sur');
      expect((await zona('administrador', ids.rt_calle, { zona: '   ' })).body.zona).toBeNull();
      await zona('administrador', ids.rt_calle, { zona: 'Oeste' });
      expect((await zona('administrador', ids.rt_calle, { zona: null })).body.zona).toBeNull();
    });

    it.each([[{}], [{ zona: 5 }], [{ zona: 'x'.repeat(41) }]])('una zona inválida (%j) → 400', async (cuerpo) => {
      expect((await zona('administrador', ids.rt_calle, cuerpo)).status).toBe(400);
    });

    it('la zona no viaja en la sesión de otros roles ni en /auth/me', async () => {
      await zona('administrador', ids.rt_calle, { zona: 'Norte' });

      const yo = await http().get('/api/auth/me').set('Authorization', `Bearer ${tokens.rt_calle}`);
      expect(Object.keys(yo.body)).not.toContain('zona');
    });
  });

  describe('criterio 4: qué edificios muestra', () => {
    it('trae los edificios pendientes con su ubicación, sus horarios y si son «A coordinar»', async () => {
      await http().put(`/api/consorcios/${B}/horarios`).set('Authorization', `Bearer ${tokens.secretaria}`).send({ aCoordinar: true });
      await http().put(`/api/consorcios/${C}/horarios`).set('Authorization', `Bearer ${tokens.secretaria}`).send({ franjas: { lunes: [{ desde: '09:00', hasta: '13:00' }] } });

      const res = await mapa();

      expect(res.body.edificios.map((e: { id: string }) => e.id)).toEqual([A, B, C]);
      const [a, b, c] = res.body.edificios;
      expect(a).toMatchObject({ nombre: 'Edificio A', direccion: 'Calle A 1', ubicacion: { latitud: -34.6, longitud: -58.4 }, aCoordinar: false });
      expect(Object.keys(a.franjas)).toEqual(['lunes', 'martes', 'miercoles', 'jueves', 'viernes']); // el horario por defecto
      expect(b).toMatchObject({ aCoordinar: true, franjas: {} });
      expect(a.encargado).toEqual({ nombre: 'Encargado edif-a', telefono: '11 5555-0000' }); // para llamarlo desde la tarjeta
      expect(a.encargado).not.toBeUndefined();
      expect(c.franjas).toEqual({ lunes: [{ desde: '09:00', hasta: '13:00' }] });
    });

    it('no muestra los edificios bloqueados (3 visitas fallidas)', async () => {
      for (let i = 0; i < 3; i++) expect((await fallar(A)).status).toBe(201);
      for (const r of visitas.registros) r.fechaHora = new Date(Date.parse(r.fechaHora) - 2 * 86_400_000).toISOString(); // que no sea «de hoy»

      expect((await mapa()).body.edificios.map((e: { id: string }) => e.id)).toEqual([B, C]);
    });

    it('no muestra el edificio con una visita fallida de hoy', async () => {
      await fallar(B);

      expect((await mapa()).body.edificios.map((e: { id: string }) => e.id)).toEqual([A, C]);
    });

    it('no muestra los edificios resueltos en el día (todos sus equipos inspeccionados hoy), pero sí los que están a medias', async () => {
      rtMapa.edificios.get(A)!.inspeccionadasHoy = 2; // 2 de 2
      rtMapa.edificios.get(B)!.inspeccionadasHoy = 1; // 1 de 2

      expect((await mapa()).body.edificios.map((e: { id: string }) => e.id)).toEqual([B, C]);
    });

    it('un edificio sin equipos no se da por resuelto, y uno sin ubicación aparece con ubicacion null', async () => {
      rtMapa.edificios.set(A, { ubicacion: null, maquinas: 0, inspeccionadasHoy: 0 });

      const res = await mapa();

      expect(res.body.edificios[0]).toMatchObject({ id: A, ubicacion: null, encargado: { nombre: null, telefono: null } });
    });

    it('un edificio del que no hay datos en la base (no es del RT) no sale', async () => {
      rtMapa.edificios.delete(C);

      expect((await mapa()).body.edificios.map((e: { id: string }) => e.id)).toEqual([A, B]);
    });
  });

  it.each(['secretaria', 'administrador', 'firmante', 'eca'])('el rol %s no tiene mapa de RT (403) y sin sesión da 401', async (rol) => {
    expect((await mapa(rol)).status).toBe(403);
    expect((await http().get('/api/rt/mapa')).status).toBe(401);
  });
});

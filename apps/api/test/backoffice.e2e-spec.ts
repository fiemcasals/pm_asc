import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { InMemoryReclamosRepository } from '../src/backoffice/reclamos.repository';
import { InMemoryRemitosRepository } from '../src/backoffice/remitos.repository';
import { createTestApp, fakeDatabase, MailerDePrueba } from './create-test-app';

// HU-05 RF-01 por HTTP, con roles reales: GET /api/backoffice/monitoreo y POST /api/backoffice/remito-eca.
const PASSWORD = 'Clave-Segura-2026';
jest.setTimeout(30_000);

describe('API de monitoreo del backoffice (HU-05 RF-01)', () => {
  let app: INestApplication;
  let remitos: InMemoryRemitosRepository;
  let reclamos: InMemoryReclamosRepository;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    remitos = new InMemoryRemitosRepository();
    reclamos = new InMemoryReclamosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, undefined, { usuarios }, undefined, undefined, new MailerDePrueba(), undefined, undefined, undefined, remitos, reclamos));
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
    remitos.remitos.length = 0;
    reclamos.reclamos.length = 0;
  });

  const http = () => request(app.getHttpServer());
  const monitoreo = (rol: string, q = '') => http().get(`/api/backoffice/monitoreo${q}`).set('Authorization', `Bearer ${tokens[rol]}`);
  const remito = (rol: string, cuerpo: unknown) => http().post('/api/backoffice/remito-eca').set('Authorization', `Bearer ${tokens[rol]}`).send(cuerpo as object);

  describe('criterio 1: GET /api/backoffice/monitoreo', () => {
    it.each(['secretaria', 'administrador'])('el rol %s recibe el listado paginado con el estado de cada visita', async (rol) => {
      const res = await monitoreo(rol);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 5, pagina: 1, porPagina: 20, totalPaginas: 1 });
      expect(res.body.items[0]).toMatchObject({ direccion: 'Av. Callao 850, CABA', eca: 'Elevadores San Martín', inspector: 'germanG', estadoVisita: 'Advertencia' });
    });

    it('filtra por dirección, ECA e inspector desde la URL y pagina', async () => {
      const dir = await monitoreo('secretaria', '?direccion=santa%20fe');
      const eca = await monitoreo('secretaria', '?eca=San%20Mart%C3%ADn');
      const insp = await monitoreo('secretaria', '?inspector=german');
      const pag = await monitoreo('secretaria', '?porPagina=2&pagina=3');

      expect(dir.body.items.map((f: { codigoAGC: string }) => f.codigoAGC)).toEqual(['M2', 'M1']);
      expect(dir.body.total).toBe(2);
      expect(eca.body.total).toBe(1);
      expect(insp.body.items[0].inspector).toBe('germanG');
      expect(pag.body).toMatchObject({ total: 5, totalPaginas: 3, items: [expect.objectContaining({ maquinaId: 'MAQ-CORRIENTES-M2' })] });
    });

    it('un filtro inválido → 400 con el motivo', async () => {
      const res = await monitoreo('secretaria', '?estado=Aprobada');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/estado tiene que ser Recorrida, Pendiente de Visita, Advertencia/);
      expect((await monitoreo('secretaria', '?porPagina=500')).status).toBe(400);
    });

    it.each(['rt_calle', 'firmante', 'eca'])('el rol %s no ve el monitoreo (403); sin sesión 401', async (rol) => {
      expect((await monitoreo(rol)).status).toBe(403);
      expect((await http().get('/api/backoffice/monitoreo')).status).toBe(401);
    });
  });

  describe('criterio 2: POST /api/backoffice/remito-eca', () => {
    it.each(['secretaria', 'administrador'])('el rol %s registra el envío a su nombre → 201', async (rol) => {
      const res = await remito(rol, { maquinaId: 'MAQ-SANTAFE-M1' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ maquinaId: 'MAQ-SANTAFE-M1', visitaId: 'VIS-2026-11-301', eca: 'MAICON Mantenimiento', enviadoPor: rol });
      expect(Number.isNaN(Date.parse(res.body.enviadoEn))).toBe(false);
      remitos.remitos.length = 0;
    });

    it('el usuario sale de la sesión, no del cuerpo; y el listado muestra el remito', async () => {
      const res = await remito('secretaria', { maquinaId: 'MAQ-SANTAFE-M1', enviadoPor: 'otra.persona' });

      expect(res.body.enviadoPor).toBe('secretaria');
      const fila = (await monitoreo('administrador', '?direccion=santa%20fe')).body.items.find((f: { maquinaId: string }) => f.maquinaId === 'MAQ-SANTAFE-M1');
      expect(fila.remito).toMatchObject({ enviadoPor: 'secretaria' });
    });

    it('la segunda vez es 409; un equipo sin visita es 409; uno inexistente 404; sin maquinaId 400', async () => {
      expect((await remito('secretaria', { maquinaId: 'MAQ-CALLAO-M1' })).status).toBe(201);
      expect((await remito('administrador', { maquinaId: 'MAQ-CALLAO-M1' })).status).toBe(409);
      expect((await remito('secretaria', { maquinaId: 'MAQ-CORRIENTES-M2' })).status).toBe(409);
      expect((await remito('secretaria', { maquinaId: 'NO-EXISTE' })).status).toBe(404);
      expect((await remito('secretaria', {})).status).toBe(400);
      expect(remitos.remitos).toHaveLength(1);
    });

    it.each(['rt_calle', 'firmante', 'eca'])('el rol %s no registra remitos (403); sin sesión 401', async (rol) => {
      expect((await remito(rol, { maquinaId: 'MAQ-CALLAO-M1' })).status).toBe(403);
      expect((await http().post('/api/backoffice/remito-eca').send({ maquinaId: 'MAQ-CALLAO-M1' })).status).toBe(401);
      expect(remitos.remitos).toHaveLength(0);
    });
  });

  describe('HU-05 RF-02: detalle de la visita y reclamo a la administración', () => {
    const detalle = (rol: string, id: string) => http().get(`/api/backoffice/visitas/${id}`).set('Authorization', `Bearer ${tokens[rol]}`);
    const reclamo = (rol: string, cuerpo: unknown) => http().post('/api/backoffice/reclamo-admin').set('Authorization', `Bearer ${tokens[rol]}`).send(cuerpo as object);

    it.each(['secretaria', 'administrador'])('el rol %s ve el detalle con las fotos y el checklist', async (rol) => {
      const res = await detalle(rol, 'MAQ-CORRIENTES-M1');

      expect(res.status).toBe(200);
      expect(res.body.fotos).toHaveLength(2);
      expect(res.body).toMatchObject({ direccion: 'Av. Corrientes 1234, CABA', inspector: 'dev-ma-2' });
      expect((await detalle(rol, 'NO-EXISTE')).status).toBe(404);
    });

    it('reclama a la administración una visita con advertencia → 201 a nombre de la sesión; la segunda vez 409; una Recorrida 409', async () => {
      const ok = await reclamo('secretaria', { maquinaId: 'MAQ-CALLAO-M1', reclamadoPor: 'otra.persona' });

      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ visitaId: 'VIS-2026-11-201', reclamadoPor: 'secretaria' });
      expect((await reclamo('administrador', { maquinaId: 'MAQ-CALLAO-M1' })).status).toBe(409);
      expect((await reclamo('secretaria', { maquinaId: 'MAQ-SANTAFE-M1' })).status).toBe(409);
      expect((await reclamo('secretaria', { maquinaId: 'NO-EXISTE' })).status).toBe(404);
      expect((await reclamo('secretaria', {})).status).toBe(400);
      expect(reclamos.reclamos).toHaveLength(1);
      const fila = (await monitoreo('secretaria', '?direccion=callao')).body.items[0];
      expect(fila.reclamo).toMatchObject({ reclamadoPor: 'secretaria' });
    });

    it.each(['rt_calle', 'firmante', 'eca'])('el rol %s no ve el detalle ni reclama (403); sin sesión 401', async (rol) => {
      expect((await detalle(rol, 'MAQ-CORRIENTES-M1')).status).toBe(403);
      expect((await reclamo(rol, { maquinaId: 'MAQ-CALLAO-M1' })).status).toBe(403);
      expect((await http().get('/api/backoffice/visitas/MAQ-CORRIENTES-M1')).status).toBe(401);
      expect((await http().post('/api/backoffice/reclamo-admin').send({ maquinaId: 'MAQ-CALLAO-M1' })).status).toBe(401);
      expect(reclamos.reclamos).toHaveLength(0);
    });
  });
});

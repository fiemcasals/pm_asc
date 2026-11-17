import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-05 RF-01): el remito a la ECA se guarda en la base, con RLS y sin edición. Requiere `npm run db:up` y
// DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET.
loadEnvFileInto(process.env);

const P = 'RF01bo-int';

describe('Monitoreo del backoffice y remito a la ECA contra PostgreSQL real (HU-05 RF-01)', () => {
  let app: INestApplication;
  let admin: Pool;
  let tokenSec = '';
  let tokenAdmin = '';
  let tokenRt = '';

  beforeAll(async () => {
    const config = loadConfig();
    admin = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    tokenSec = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-sec`, rol: 'secretaria' })).token;
    tokenAdmin = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-admin`, rol: 'administrador' })).token;
    tokenRt = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-rt`, rol: 'rt_calle' })).token;
    await admin.query('DELETE FROM remitos_eca WHERE enviado_por LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM reclamos_admin WHERE reclamado_por LIKE $1', [`${P}%`]);
  });

  afterAll(async () => {
    await admin.query('DELETE FROM remitos_eca WHERE enviado_por LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM reclamos_admin WHERE reclamado_por LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM intentos_login WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await admin.end();
  });

  const http = () => request(app.getHttpServer());
  const con = (token: string) => ({
    ver: (q = '') => http().get(`/api/backoffice/monitoreo${q}`).set('Authorization', `Bearer ${token}`),
    remito: (c: object) => http().post('/api/backoffice/remito-eca').set('Authorization', `Bearer ${token}`).send(c),
  });

  it('criterio 1: el listado responde paginado y filtrable', async () => {
    const res = await con(tokenSec).ver('?porPagina=2&inspector=dev-ma');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pagina: 1, porPagina: 2 });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    expect(res.body.items.every((f: { inspector: string }) => f.inspector.includes('dev-ma'))).toBe(true);
  });

  it('criterio 2: el remito se guarda en la base con quién y cuándo; la fila del listado lo trae; la segunda vez es 409 (una por visita)', async () => {
    const res = await con(tokenSec).remito({ maquinaId: 'MAQ-SANTAFE-M2' });

    expect(res.status).toBe(201);
    const [fila] = (await admin.query('SELECT * FROM remitos_eca WHERE visita_id = $1', [res.body.visitaId])).rows;
    expect(fila).toMatchObject({ maquina_id: 'MAQ-SANTAFE-M2', eca: 'MAICON Mantenimiento', direccion: 'Av. Santa Fe 3200, CABA', enviado_por: `${P}-sec` });
    expect(Math.abs(new Date(fila.enviado_en).getTime() - Date.now())).toBeLessThan(10_000);
    const lista = await con(tokenAdmin).ver('?direccion=santa%20fe');
    expect(lista.body.items.find((f: { maquinaId: string }) => f.maquinaId === 'MAQ-SANTAFE-M2').remito).toMatchObject({ enviadoPor: `${P}-sec` });

    expect((await con(tokenAdmin).remito({ maquinaId: 'MAQ-SANTAFE-M2' })).status).toBe(409);
    expect((await admin.query('SELECT count(*)::int AS n FROM remitos_eca WHERE visita_id = $1', [res.body.visitaId])).rows[0].n).toBe(1);
  });

  it('el rol de la aplicación no modifica ni borra remitos enviados (constancia) y una visita no puede tener dos', async () => {
    const client = await admin.connect();
    try {
      for (const sql of ["UPDATE remitos_eca SET enviado_por = 'otro'", 'DELETE FROM remitos_eca']) {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ascensores_app');
        await client.query("SELECT set_config('app.rol_actual', 'administrador', true)");
        await expect(client.query(sql)).rejects.toThrow(/permission denied/);
        await client.query('ROLLBACK');
      }
    } finally {
      client.release();
    }
    await expect(
      admin.query("INSERT INTO remitos_eca (maquina_id, visita_id, eca, direccion, enviado_por) VALUES ('x', 'VIS-2026-11-302', 'e', 'd', $1)", [`${P}-sec`]),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('la RLS deja la tabla sólo a la Secretaría y al Administrador', async () => {
    const pol = await admin.query("SELECT policyname, cmd FROM pg_policies WHERE tablename = 'remitos_eca'");

    expect(pol.rows).toEqual([{ policyname: 'rls_remitos_eca_admin_secretaria', cmd: 'ALL' }]);
  });

  it('el RT no ve el monitoreo ni registra remitos (403)', async () => {
    expect((await con(tokenRt).ver()).status).toBe(403);
    expect((await con(tokenRt).remito({ maquinaId: 'MAQ-CALLAO-M1' })).status).toBe(403);
  });

  describe('HU-05 RF-02: reclamo a la administración', () => {
    it('el reclamo de una visita con advertencia queda en la base (uno por visita) y la fila del listado lo muestra', async () => {
      const res = await http().post('/api/backoffice/reclamo-admin').set('Authorization', `Bearer ${tokenSec}`).send({ maquinaId: 'MAQ-CALLAO-M1' });

      expect(res.status).toBe(201);
      const [fila] = (await admin.query('SELECT * FROM reclamos_admin WHERE visita_id = $1', ['VIS-2026-11-201'])).rows;
      expect(fila).toMatchObject({ maquina_id: 'MAQ-CALLAO-M1', direccion: 'Av. Callao 850, CABA', reclamado_por: `${P}-sec` });
      const lista = await con(tokenAdmin).ver('?direccion=callao');
      expect(lista.body.items[0].reclamo).toMatchObject({ reclamadoPor: `${P}-sec` });
      expect((await http().post('/api/backoffice/reclamo-admin').set('Authorization', `Bearer ${tokenAdmin}`).send({ maquinaId: 'MAQ-CALLAO-M1' })).status).toBe(409);
      expect((await http().post('/api/backoffice/reclamo-admin').set('Authorization', `Bearer ${tokenSec}`).send({ maquinaId: 'MAQ-SANTAFE-M1' })).status).toBe(409);
    });

    it('el rol de la aplicación no modifica ni borra reclamos, y la RLS es sólo de la Secretaría y el Administrador', async () => {
      const client = await admin.connect();
      try {
        for (const sql of ["UPDATE reclamos_admin SET reclamado_por = 'otro'", 'DELETE FROM reclamos_admin']) {
          await client.query('BEGIN');
          await client.query('SET LOCAL ROLE ascensores_app');
          await client.query("SELECT set_config('app.rol_actual', 'administrador', true)");
          await expect(client.query(sql)).rejects.toThrow(/permission denied/);
          await client.query('ROLLBACK');
        }
      } finally {
        client.release();
      }
      const pol = await admin.query("SELECT policyname, cmd FROM pg_policies WHERE tablename = 'reclamos_admin'");
      expect(pol.rows).toEqual([{ policyname: 'rls_reclamos_admin_admin_secretaria', cmd: 'ALL' }]);
    });

    it('el detalle de la visita responde con las fotos y el RT no lo ve (403)', async () => {
      const res = await http().get('/api/backoffice/visitas/MAQ-CORRIENTES-M1').set('Authorization', `Bearer ${tokenSec}`);

      expect(res.status).toBe(200);
      expect(res.body.fotos).toHaveLength(2);
      expect((await http().get('/api/backoffice/visitas/MAQ-CORRIENTES-M1').set('Authorization', `Bearer ${tokenRt}`)).status).toBe(403);
    });
  });
});

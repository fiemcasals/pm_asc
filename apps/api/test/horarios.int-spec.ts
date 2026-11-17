import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-01 RF-04): los horarios viven en la base, con su RLS y su restricción. Requiere `npm run db:up` y
// DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET.
loadEnvFileInto(process.env);

const P = 'RF04hor-int';
const DOS = [{ desde: '08:00', hasta: '12:00' }, { desde: '17:00', hasta: '20:00' }];

describe('Horarios de atención por edificio contra PostgreSQL real (HU-01 RF-04)', () => {
  let app: INestApplication;
  let admin: Pool;
  let tokenAdmin = '';
  let tokenSecretaria = '';
  let tokenRt = '';
  let tokenOtroRt = '';
  const consorcios: string[] = [];
  let propio = '';

  beforeAll(async () => {
    const config = loadConfig();
    admin = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    tokenAdmin = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-admin`, rol: 'administrador' })).token;
    tokenSecretaria = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-sec`, rol: 'secretaria' })).token;
    tokenRt = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-rt`, rol: 'rt_calle' })).token;
    tokenOtroRt = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-otro`, rol: 'rt_calle' })).token;
    const alta = await request(app.getHttpServer()).post('/api/consorcios').set('Authorization', `Bearer ${tokenAdmin}`).send({ nombre: `${P} edificio`, direccion: 'Calle Horario 1', maquinas: [{ referenciaAgc: 'M1' }] });
    expect(alta.status).toBe(201);
    propio = alta.body.id;
    consorcios.push(propio);
    const roles = await request(app.getHttpServer()).put(`/api/consorcios/${propio}/roles`).set('Authorization', `Bearer ${tokenAdmin}`).send({
      rtCalle: { nombre: `${P}-rt`, telefono: '11 0000-0000', email: 'rt@rt.com' },
      firmante: { nombre: 'Firmante', email: 'f@f.com' },
      eca: { nombre: 'ECA', email: 'e@e.com' },
    });
    expect(roles.status).toBe(200);
  });

  afterAll(async () => {
    if (consorcios.length > 0) await admin.query('DELETE FROM consorcios WHERE id = ANY($1::uuid[])', [consorcios]); // borra también los horarios
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM intentos_login WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await admin.end();
  });

  const url = () => `/api/consorcios/${propio}/horarios`;
  const con = (token: string) => ({
    ver: () => request(app.getHttpServer()).get(url()).set('Authorization', `Bearer ${token}`),
    guardar: (c: Record<string, unknown>) => request(app.getHttpServer()).put(url()).set('Authorization', `Bearer ${token}`).send(c),
    abierto: (en: string) => request(app.getHttpServer()).get(`${url()}/abierto`).query({ en }).set('Authorization', `Bearer ${token}`),
  });
  const filas = async () => (await admin.query('SELECT a_coordinar, franjas, actualizado_por FROM horarios_edificio WHERE consorcio_id = $1', [propio])).rows;

  it('criterio 1: un edificio nuevo arranca con el horario por defecto y sin fila en la base', async () => {
    const res = await con(tokenSecretaria).ver();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ porDefecto: true, aCoordinar: false });
    expect(res.body.franjas.lunes).toEqual(DOS);
    expect(await filas()).toEqual([]);
  });

  it('criterio 2: la Secretaría guarda franjas distintas por día; quedan en la base con quién las editó y se pueden volver a editar', async () => {
    const a = await con(tokenSecretaria).guardar({ franjas: { lunes: DOS, sabado: [{ desde: '09:00', hasta: '13:00' }] } });
    expect(a.status).toBe(200);
    expect(await filas()).toEqual([{ a_coordinar: false, franjas: { lunes: DOS, sabado: [{ desde: '09:00', hasta: '13:00' }] }, actualizado_por: `${P}-sec` }]);

    const b = await con(tokenAdmin).guardar({ franjas: { martes: [{ desde: '10:00', hasta: '15:00' }] } });
    expect(b.status).toBe(200);
    const [fila] = await filas();
    expect(fila).toMatchObject({ franjas: { martes: [{ desde: '10:00', hasta: '15:00' }] }, actualizado_por: `${P}-admin` });
    expect((await con(tokenSecretaria).ver()).body).toMatchObject({ porDefecto: false, franjas: { martes: [{ desde: '10:00', hasta: '15:00' }] } });
  });

  it('criterio 2: las franjas inválidas se rechazan con 400 y la base queda como estaba', async () => {
    const antes = await filas();

    expect((await con(tokenSecretaria).guardar({ franjas: { lunes: [{ desde: '12:00', hasta: '08:00' }] } })).status).toBe(400);
    expect((await con(tokenSecretaria).guardar({ franjas: { lunes: [{ desde: '08:00', hasta: '12:00' }, { desde: '11:00', hasta: '14:00' }] } })).status).toBe(400);
    expect(await filas()).toEqual(antes);
  });

  it('la base también exige que franjas sea un objeto', async () => {
    await expect(admin.query("UPDATE horarios_edificio SET franjas = '[]'::jsonb WHERE consorcio_id = $1", [propio])).rejects.toThrow(/check/i);
  });

  it('criterio 3: «A coordinar» reemplaza las franjas en la base', async () => {
    await con(tokenSecretaria).guardar({ aCoordinar: true });

    expect(await filas()).toEqual([{ a_coordinar: true, franjas: {}, actualizado_por: `${P}-sec` }]);
    expect((await con(tokenRt).abierto('2026-11-17T10:00:00-03:00')).body).toMatchObject({ abierto: false, motivo: 'a_coordinar' });
  });

  it('criterio 4: informa si está abierto, y los feriados cuentan como cerrado', async () => {
    await con(tokenSecretaria).guardar({ franjas: { lunes: DOS, martes: DOS } });

    expect((await con(tokenSecretaria).abierto('2026-11-17T09:00:00-03:00')).body).toMatchObject({ abierto: true, motivo: 'dentro_de_franja' });
    expect((await con(tokenSecretaria).abierto('2026-11-17T14:00:00-03:00')).body).toMatchObject({ abierto: false, motivo: 'fuera_de_franja' });
    expect((await con(tokenSecretaria).abierto('2026-11-23T09:00:00-03:00')).body).toMatchObject({ abierto: false, motivo: 'feriado' });
  });

  it('el RT asignado al edificio ve los horarios pero no los edita; un RT de otro edificio no los ve (RLS)', async () => {
    await con(tokenSecretaria).guardar({ franjas: { lunes: DOS } });

    const propioRt = await con(tokenRt).ver();
    expect(propioRt.status).toBe(200);
    expect(propioRt.body).toMatchObject({ porDefecto: false, franjas: { lunes: DOS } });
    expect((await con(tokenRt).guardar({ aCoordinar: true })).status).toBe(403);
    const ajeno = await con(tokenOtroRt).ver();
    expect([403, 404]).toContain(ajeno.status);
    expect(JSON.stringify(ajeno.body)).not.toContain('08:00');
  });

  it('la política de escritura de horarios_edificio es sólo de la Secretaría y el Administrador (RLS)', async () => {
    const pol = await admin.query("SELECT policyname, cmd FROM pg_policies WHERE tablename = 'horarios_edificio' ORDER BY policyname");

    expect(pol.rows.map((r) => `${r.policyname}:${r.cmd}`)).toEqual(['rls_horarios_edificio_admin_secretaria:ALL', 'rls_horarios_edificio_rt_firmante_select:SELECT']);
  });
});

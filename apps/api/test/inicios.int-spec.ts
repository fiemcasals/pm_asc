import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-16 RF-02): el inicio de la inspección se valida contra el punto PostGIS del edificio, con RLS y sin edición.
// Requiere `npm run db:up` y DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET.
loadEnvFileInto(process.env);

const P = 'RF02ini-int';
const PUNTO = { latitud: -34.6118, longitud: -58.396 };
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';

describe('Inicio de la inspección contra PostgreSQL real (HU-16 RF-02)', () => {
  let app: INestApplication;
  let admin: Pool;
  let tokenAdmin = '';
  let tokenSecretaria = '';
  let tokenRt = '';
  let tokenOtroRt = '';
  const consorcios: string[] = [];
  const edif: Record<string, string> = {};

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
    const edificio = async (clave: string, rt: string, ubicacion: typeof PUNTO | null) => {
      const alta = await request(app.getHttpServer()).post('/api/consorcios').set('Authorization', `Bearer ${tokenAdmin}`).send({ nombre: `${P} ${clave}`, direccion: `Calle ${clave} 1`, ...(ubicacion ? { ubicacion } : {}), maquinas: [{ referenciaAgc: 'M1' }] });
      expect(alta.status).toBe(201);
      consorcios.push(alta.body.id);
      edif[clave] = alta.body.id;
      const roles = await request(app.getHttpServer()).put(`/api/consorcios/${alta.body.id}/roles`).set('Authorization', `Bearer ${tokenAdmin}`).send({
        rtCalle: { nombre: rt, telefono: '11 0000-0000', email: 'rt@rt.com' }, firmante: { nombre: 'Firmante', email: 'f@f.com' }, eca: { nombre: 'ECA', email: 'e@e.com' },
      });
      expect(roles.status).toBe(200);
    };
    await edificio('con punto', `${P}-rt`, PUNTO);
    await edificio('sin punto', `${P}-rt`, null);
    await edificio('ajeno', `${P}-otro`, PUNTO);
  });

  afterAll(async () => {
    if (consorcios.length > 0) await admin.query('DELETE FROM consorcios WHERE id = ANY($1::uuid[])', [consorcios]); // borra también los inicios
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM intentos_login WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await admin.end();
  });

  const http = () => request(app.getHttpServer());
  const ahora = () => new Date().toISOString();
  const cuerpo = (clave: string, extra: Record<string, unknown> = {}, gps: Record<string, unknown> = {}) => ({
    consorcioId: edif[clave], gps: { latitud: PUNTO.latitud + 0.00025, longitud: PUNTO.longitud, precision: 6, timestamp: ahora(), ...gps }, horaDispositivo: ahora(), ...extra,
  });
  const iniciar = (token: string, c: Record<string, unknown>) => http().post('/api/inicios-inspeccion').set('Authorization', `Bearer ${token}`).send(c);
  const filas = async (clave: string) => (await admin.query('SELECT * FROM inicios_inspeccion WHERE consorcio_id = $1 ORDER BY hora_servidor', [edif[clave]])).rows;

  it('a 27,8 m del punto PostGIS con buena señal: queda guardado con coordenadas, precisión, hora del dispositivo y hora del servidor', async () => {
    const antes = Date.now();
    const res = await iniciar(tokenRt, cuerpo('con punto'));

    expect(res.status).toBe(201);
    const [f] = await filas('con punto');
    expect(f).toMatchObject({ usuario: `${P}-rt`, gps_latitud: PUNTO.latitud + 0.00025, gps_longitud: PUNTO.longitud, gps_precision: 6, distancia_m: 27.8, sin_buena_senal: false, revision: 'no_requiere' });
    expect(new Date(f.hora_servidor).getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(Math.abs(new Date(f.hora_dispositivo).getTime() - antes)).toBeLessThan(10_000);
  });

  it('criterio 2: a 33,4 m con buena señal → 409 y no queda fila', async () => {
    const antes = (await filas('con punto')).length;

    const res = await iniciar(tokenRt, cuerpo('con punto', {}, { latitud: PUNTO.latitud + 0.0003 }));

    expect(res.status).toBe(409);
    expect((await filas('con punto')).length).toBe(antes);
  });

  it('criterio 3: sin buena señal exige foto y justificación y queda pendiente de revisión de la Secretaría', async () => {
    expect((await iniciar(tokenRt, cuerpo('con punto', {}, { precision: 90 }))).status).toBe(400);

    const ok = await iniciar(tokenRt, cuerpo('con punto', { fotoFrenteUrl: FOTO, justificacion: 'Entre edificios altos no mejora' }, { precision: 90 }));

    expect(ok.status).toBe(201);
    const pendientes = await http().get('/api/inicios-inspeccion').query({ revision: 'pendiente' }).set('Authorization', `Bearer ${tokenSecretaria}`);
    expect(pendientes.body.map((i: { id: string }) => i.id)).toContain(ok.body.id);
    const rev = await http().post(`/api/inicios-inspeccion/${ok.body.id}/revisar`).set('Authorization', `Bearer ${tokenSecretaria}`);
    expect(rev.body).toMatchObject({ revision: 'revisada', revisadaPor: `${P}-sec` });
  });

  it('un edificio sin punto en el mapa se trata como sin buena señal', async () => {
    expect((await iniciar(tokenRt, cuerpo('sin punto'))).status).toBe(400);

    const ok = await iniciar(tokenRt, cuerpo('sin punto', { fotoFrenteUrl: FOTO, justificacion: 'El edificio no tiene punto cargado' }));

    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ distanciaM: null, sinBuenaSenal: true, revision: 'pendiente' });
  });

  it('el RT no inicia en un edificio que no tiene asignado (RLS → 404) y no queda fila', async () => {
    const res = await iniciar(tokenRt, cuerpo('ajeno'));

    expect(res.status).toBe(404);
    expect(await filas('ajeno')).toEqual([]);
    expect((await iniciar(tokenOtroRt, cuerpo('ajeno'))).status).toBe(201);
  });

  it('la base también cierra el paso: el rol de la aplicación no inserta un inicio de otro edificio ni con otro rol', async () => {
    const pol = await admin.query("SELECT policyname, cmd FROM pg_policies WHERE tablename = 'inicios_inspeccion' ORDER BY policyname");

    expect(pol.rows.map((r) => `${r.policyname}:${r.cmd}`)).toEqual([
      'rls_inicios_inspeccion_admin_secretaria:ALL', 'rls_inicios_inspeccion_rt_insert:INSERT', 'rls_inicios_inspeccion_rt_select:SELECT',
    ]);
  });

  it('criterio 4: el registro no se edita con el rol de la aplicación (ni GPS, ni hora, ni foto, ni justificación), pero sí se revisa', async () => {
    const campos: [string, string][] = [
      ['gps_latitud', '0'], ['gps_longitud', '0'], ['gps_precision', '1'], ['distancia_m', '1'], ['hora_dispositivo', 'now()'], ['hora_servidor', 'now()'],
      ['usuario', "'otro'"], ['foto_frente_url', "'otra'"], ['justificacion', "'otra'"], ['sin_buena_senal', 'false'],
    ];
    const client = await admin.connect();
    try {
      for (const [col, valor] of campos) {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ascensores_app');
        await client.query("SELECT set_config('app.rol_actual', 'administrador', true)");
        await expect(client.query(`UPDATE inicios_inspeccion SET ${col} = ${valor} WHERE consorcio_id = $1`, [edif['con punto']])).rejects.toThrow(/no se puede modificar/);
        await client.query('ROLLBACK');
      }
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ascensores_app');
      await client.query("SELECT set_config('app.rol_actual', 'administrador', true)");
      const ok = await client.query("UPDATE inicios_inspeccion SET revisada_por = 'x' WHERE consorcio_id = $1", [edif['con punto']]);
      expect(ok.rowCount).toBeGreaterThan(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('la base exige foto y justificación cuando no hay buena señal (CHECK)', async () => {
    await expect(
      admin.query("INSERT INTO inicios_inspeccion (consorcio_id, usuario, gps_latitud, gps_longitud, gps_precision, hora_dispositivo, sin_buena_senal, revision) VALUES ($1, 'x', 0, 0, 90, now(), true, 'pendiente')", [edif['con punto']]),
    ).rejects.toThrow(/check/i);
  });

  it('sólo el RT inicia: el Administrador recibe 403', async () => {
    expect((await iniciar(tokenAdmin, cuerpo('con punto'))).status).toBe(403);
  });
});

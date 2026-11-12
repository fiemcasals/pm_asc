import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { COSTO_BCRYPT } from '../src/auth/auth.service';
import { hashRefresco } from '../src/auth/tokens';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';

// Integración real (HU-14 RF-01): usuarios, sesiones e intentos contra PostgreSQL + PostGIS.
// Requiere la base levantada con `npm run db:up`.
loadEnvFileInto(process.env);

const PREFIJO = 'int-auth-';
const PASSWORD = 'Clave-Segura-2026';

describe('Autenticación contra PostgreSQL real (HU-14 RF-01)', () => {
  let app: INestApplication;
  let pool: Pool;
  const http = () => request(app.getHttpServer());

  async function limpiar(): Promise<void> {
    await pool.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${PREFIJO}%`]);
    await pool.query('DELETE FROM intentos_login WHERE usuario LIKE $1', [`${PREFIJO}%`]);
  }

  async function alta(usuario: string, rol: string): Promise<void> {
    await pool.query(
      'INSERT INTO usuarios (usuario, nombre, rol, password_hash) VALUES ($1, $1, $2, $3)',
      [usuario, rol, await bcrypt.hash(PASSWORD, COSTO_BCRYPT)],
    );
  }

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    await limpiar();
    await alta(`${PREFIJO}admin`, 'administrador');
    await alta(`${PREFIJO}rt`, 'rt_calle');
  });

  afterAll(async () => {
    await limpiar();
    await app?.close();
    await pool?.end();
  });

  it('la migración 005 crea usuarios, sesiones e intentos_login', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name IN ('usuarios', 'sesiones', 'intentos_login') ORDER BY table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(['intentos_login', 'sesiones', 'usuarios']);
  });

  it('login, alta por el Administrador con hash bcrypt 12 y 403 para otro rol', async () => {
    const admin = await http().post('/api/auth/login').send({ usuario: `${PREFIJO}admin`, password: PASSWORD }).expect(200);
    await http().post('/api/auth/login').send({ usuario: `${PREFIJO}admin`, password: 'otra-clave-x' }).expect(401);

    await http()
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${admin.body.accessToken}`)
      .send({ usuario: `${PREFIJO}firmante`, nombre: 'Firmante', rol: 'firmante', password: PASSWORD })
      .expect(201);
    const { rows } = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM usuarios WHERE usuario = $1',
      [`${PREFIJO}firmante`],
    );
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(rows[0].password_hash).not.toContain(PASSWORD);

    const rt = await http().post('/api/auth/login').send({ usuario: `${PREFIJO}rt`, password: PASSWORD }).expect(200);
    await http()
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${rt.body.accessToken}`)
      .send({ usuario: `${PREFIJO}otro`, nombre: 'Otro', rol: 'eca', password: PASSWORD })
      .expect(403);
    await http().post('/api/usuarios').send({ usuario: `${PREFIJO}otro`, nombre: 'Otro', rol: 'eca', password: PASSWORD }).expect(401);
  });

  it('la sesión se guarda como hash y el refresco la rota', async () => {
    const login = await http().post('/api/auth/login').send({ usuario: `${PREFIJO}rt`, password: PASSWORD }).expect(200);
    const cookie = ([] as string[]).concat(login.headers['set-cookie'])[0].split(';')[0];
    const token = decodeURIComponent(cookie.split('=')[1]);

    const guardada = await pool.query('SELECT 1 FROM sesiones WHERE refresh_hash = $1', [hashRefresco(token)]);
    expect(guardada.rowCount).toBe(1);
    const enClaro = await pool.query('SELECT 1 FROM sesiones WHERE refresh_hash = $1', [token]);
    expect(enClaro.rowCount).toBe(0);

    await http().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    const despues = await pool.query('SELECT 1 FROM sesiones WHERE refresh_hash = $1', [hashRefresco(token)]);
    expect(despues.rowCount).toBe(0);
    await http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('5 intentos fallidos dejan el bloqueo guardado en la base y el 6.º responde 429', async () => {
    const usuario = `${PREFIJO}rt`;
    for (let i = 0; i < 5; i++) {
      await http().post('/api/auth/login').send({ usuario, password: 'mala-clave-xx' }).expect(401);
    }
    const res = await http().post('/api/auth/login').send({ usuario, password: PASSWORD }).expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(890);

    const { rows } = await pool.query<{ minutos: string }>(
      `SELECT extract(epoch FROM bloqueado_hasta - now()) / 60 AS minutos FROM intentos_login WHERE usuario = $1`,
      [usuario],
    );
    expect(Number(rows[0].minutos)).toBeGreaterThan(14);
    expect(Number(rows[0].minutos)).toBeLessThanOrEqual(15);
  });
});

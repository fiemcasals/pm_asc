import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { MENSAJE_TEXTO_INVALIDO } from '../src/database/database-error.filter';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (RNF-01): el carácter NUL contra PostgreSQL de verdad. Requiere la base
// levantada con `npm run db:up` y DATABASE_URL (en el .env de la raíz o en el entorno).
loadEnvFileInto(process.env);

const PREFIJO = 'RNF01-int';

describe('Carácter NUL contra PostgreSQL + PostGIS real (RNF-01)', () => {
  let app: INestApplication;
  let pool: Pool;
  let warn: jest.SpyInstance;
  let authToken = '';

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    const u = await asegurarUsuarioPrueba(pool, config, { usuario: 'texto_int_admin', rol: 'secretaria' });
    authToken = u.token;
  });

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  afterAll(async () => {
    await pool.query('DELETE FROM consorcios WHERE nombre LIKE $1', [`${PREFIJO}%`]);
    await pool.query('DELETE FROM usuarios WHERE usuario = $1', ['texto_int_admin']);
    await app.close();
    await pool.end();
  });

  const http = () => {
    const req = request(app.getHttpServer());
    return {
      post: (url: string) => req.post(url).set('Authorization', `Bearer ${authToken}`),
      get: (url: string) => req.get(url).set('Authorization', `Bearer ${authToken}`),
      put: (url: string) => req.put(url).set('Authorization', `Bearer ${authToken}`),
      delete: (url: string) => req.delete(url).set('Authorization', `Bearer ${authToken}`),
    };
  };
  const filas = async (tabla: 'consorcios' | 'maquinas') =>
    Number((await pool.query(`SELECT count(*) AS n FROM ${tabla}`)).rows[0].n);

  it('criterio 1: POST con NUL en nombre → 400 con message y errores, y no guarda ninguna fila', async () => {
    const antes = { consorcios: await filas('consorcios'), maquinas: await filas('maquinas') };

    const res = await http()
      .post('/api/consorcios')
      .send({ nombre: `${PREFIJO} con nulo \u0000 adentro`, direccion: 'Calle 1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos inválidos');
    expect(res.body.errores).toEqual([MENSAJE_TEXTO_INVALIDO]);
    expect({ consorcios: await filas('consorcios'), maquinas: await filas('maquinas') }).toEqual(antes);
  });

  it('criterio 1 (rollback): un NUL en la 2.ª máquina no deja el consorcio ni la 1.ª máquina guardados', async () => {
    const nombre = `${PREFIJO} rollback`;

    const res = await http()
      .post('/api/consorcios')
      .send({
        nombre,
        direccion: 'Calle 1',
        maquinas: [
          { referenciaAgc: 'M1', descripcion: 'Derecha' },
          { referenciaAgc: 'M2', descripcion: 'Izq\u0000uierda' },
        ],
      });

    expect(res.status).toBe(400);
    expect((await pool.query('SELECT 1 FROM consorcios WHERE nombre = $1', [nombre])).rowCount).toBe(0);
  });

  it('criterio 2: PUT con NUL en la descripción de una máquina → 400 y la ficha no cambia', async () => {
    const creado = await http()
      .post('/api/consorcios')
      .send({
        nombre: `${PREFIJO} put`,
        direccion: 'Calle 1',
        maquinas: [{ referenciaAgc: 'M1', descripcion: 'Derecha' }],
      });
    expect(creado.status).toBe(201);
    const antes = (await http().get(`/api/consorcios/${creado.body.id}`)).body;

    const res = await http()
      .put(`/api/consorcios/${creado.body.id}`)
      .send({
        nombre: `${PREFIJO} put cambiado`,
        direccion: 'Otra 99',
        maquinas: [{ referenciaAgc: 'M9', descripcion: 'con \u0000 nulo' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos inválidos');
    const despues = (await http().get(`/api/consorcios/${creado.body.id}`)).body;
    expect(despues).toEqual(antes);
    expect(despues.maquinas.map((m: { referenciaAgc: string }) => m.referenciaAgc)).toEqual(['M1']);
  });

  it('criterio 3: la respuesta no trae el texto de PostgreSQL ni trazas, y el error real queda en el log', async () => {
    const res = await http()
      .post('/api/consorcios')
      .send({ nombre: `${PREFIJO} log \u0000`, direccion: 'Calle 1' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body).sort()).toEqual(['errores', 'message']);
    expect(JSON.stringify(res.body)).not.toMatch(/byte sequence|0x00|UTF8|22021|severity|stack/i);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SQLSTATE 22021'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid byte sequence for encoding "UTF8": 0x00'));
  });

  it('después del error la API sigue sana y acepta altas (el pool no quedó dañado)', async () => {
    await http().post('/api/consorcios').send({ nombre: `${PREFIJO} x \u0000`, direccion: 'd' });

    expect((await http().get('/api/health')).status).toBe(200);
    const ok = await http().post('/api/consorcios').send({ nombre: `${PREFIJO} válido`, direccion: 'Calle 1' });
    expect(ok.status).toBe(201);
  });
});

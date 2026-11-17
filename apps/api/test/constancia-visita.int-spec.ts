import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-07 RF-06): el RT de Calle registra la constancia de su edificio (RLS), con causa, hora del dispositivo y del
// servidor, y la constancia no se puede editar. Requiere `npm run db:up` y DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET.
loadEnvFileInto(process.env);

const P = 'RF06vf-int';
const CAUSA = 'Encargado o responsable ausente';

describe('Constancia de visita fallida del RT contra PostgreSQL real (HU-07 RF-06)', () => {
  let app: INestApplication;
  let admin: Pool;
  let tokenAdmin = '';
  let tokenRt = '';
  let tokenOtroRt = '';
  const consorcios: string[] = [];
  let propio = '';
  let ajeno = '';

  beforeAll(async () => {
    const config = loadConfig();
    admin = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    tokenAdmin = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-admin`, rol: 'administrador' })).token;
    tokenRt = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-rt`, rol: 'rt_calle' })).token;
    tokenOtroRt = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-otro`, rol: 'rt_calle' })).token;
    const edificio = async (clave: string, rt: string) => {
      const alta = await request(app.getHttpServer()).post('/api/consorcios').set('Authorization', `Bearer ${tokenAdmin}`).send({ nombre: `${P} ${clave}`, direccion: `Calle ${clave}`, maquinas: [{ referenciaAgc: 'M1' }] });
      expect(alta.status).toBe(201);
      consorcios.push(alta.body.id);
      const roles = await request(app.getHttpServer()).put(`/api/consorcios/${alta.body.id}/roles`).set('Authorization', `Bearer ${tokenAdmin}`).send({
        rtCalle: { nombre: rt, telefono: '11 0000-0000', email: 'rt@rt.com' },
        firmante: { nombre: 'Firmante', email: 'f@f.com' },
        eca: { nombre: 'ECA', email: 'e@e.com' },
      });
      expect(roles.status).toBe(200);
      return alta.body.id as string;
    };
    propio = await edificio('propio', `${P}-rt`);
    ajeno = await edificio('ajeno', `${P}-otro`);
  });

  afterAll(async () => {
    if (consorcios.length > 0) {
      await admin.query('DELETE FROM visitas_fallidas WHERE consorcio_id = ANY($1::text[])', [consorcios]);
      await admin.query('DELETE FROM consorcios WHERE id = ANY($1::uuid[])', [consorcios]);
    }
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM intentos_login WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await admin.end();
  });

  const http = () => request(app.getHttpServer());
  const registrar = (token: string, consorcioId: string, extra: Record<string, unknown> = {}) =>
    http().post('/api/visitas-fallidas').set('Authorization', `Bearer ${token}`).send({
      consorcioId, causa: CAUSA, fotoFrenteUrl: 'data:image/jpeg;base64,AAAA', gps: { latitud: -34.6, longitud: -58.4, precision: 12.5 },
      horaDispositivo: '2026-11-16T10:00:00.000Z', ...extra,
    });
  const filas = async (consorcioId: string) => (await admin.query('SELECT * FROM visitas_fallidas WHERE consorcio_id = $1', [consorcioId])).rows;

  it('la lista de causas sale de la configuración y la primera es la de por defecto', async () => {
    const res = await http().get('/api/visitas-fallidas/causas').set('Authorization', `Bearer ${tokenRt}`);

    expect(res.status).toBe(200);
    expect(res.body.porDefecto).toBe(res.body.causas[0]);
    expect(res.body.causas).toContain(CAUSA);
  });

  it('el RT registra la constancia de su edificio: quedan causa, GPS, precisión, hora del dispositivo y hora del servidor', async () => {
    const antes = Date.now();
    const res = await registrar(tokenRt, propio);

    expect(res.status).toBe(201);
    const [fila] = await filas(propio);
    expect(fila).toMatchObject({ motivo: CAUSA, inspector: `${P}-rt`, gps_latitud: -34.6, gps_longitud: -58.4, gps_precision: 12.5, numero_advertencia: 1 });
    expect(new Date(fila.hora_dispositivo).toISOString()).toBe('2026-11-16T10:00:00.000Z');
    expect(new Date(fila.fecha_hora).getTime()).toBeGreaterThanOrEqual(antes - 1000); // la hora del servidor, no la del celular
  });

  it('el pin desaparece del recorrido del RT ese día; un segundo intento → 409 y no suma', async () => {
    const recorrido = await http().get('/api/recorrido').set('Authorization', `Bearer ${tokenRt}`);
    expect(recorrido.body.map((e: { id: string }) => e.id)).not.toContain(propio);

    const otra = await registrar(tokenRt, propio);
    expect(otra.status).toBe(409);
    expect(otra.body.message).toMatch(/ya tiene una visita fallida de hoy/);
    expect(await filas(propio)).toHaveLength(1);

    const sec = await http().get('/api/recorrido').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(sec.body.find((e: { id: string }) => e.id === propio)).toMatchObject({ visitaFallidaHoy: true });
  });

  it('el RT no puede registrar en un edificio que no tiene asignado (RLS): no queda ninguna fila', async () => {
    const res = await registrar(tokenRt, ajeno);

    expect(res.status).not.toBe(201);
    expect(await filas(ajeno)).toHaveLength(0);
  });

  it('sin causa o con una causa que no está en la lista → 400', async () => {
    expect((await registrar(tokenOtroRt, ajeno, { causa: undefined })).status).toBe(400);
    expect((await registrar(tokenOtroRt, ajeno, { causa: 'Otra cosa' })).status).toBe(400);
    expect(await filas(ajeno)).toHaveLength(0);
  });

  it('la constancia no se edita con el rol de la aplicación (GPS, hora, foto, causa ni inspector), pero el resto sí se actualiza', async () => {
    const campos: [string, string][] = [
      ['gps_latitud', '0'], ['gps_longitud', '0'], ['gps_precision', '1'], ['gps_timestamp', "now()"],
      ['hora_dispositivo', "now()"], ['fecha_hora', "now()"], ['foto_frente_url', "'otra'"], ['motivo', "'otra causa'"], ['inspector', "'otro'"],
    ];
    const client = await admin.connect();
    try {
      for (const [col, valor] of campos) {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ascensores_app');
        await client.query("SELECT set_config('app.rol_actual', 'administrador', true)");
        await expect(client.query(`UPDATE visitas_fallidas SET ${col} = ${valor} WHERE consorcio_id = $1`, [propio])).rejects.toThrow(/no se puede modificar/);
        await client.query('ROLLBACK');
      }
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ascensores_app');
      await client.query("SELECT set_config('app.rol_actual', 'administrador', true)");
      const ok = await client.query(`UPDATE visitas_fallidas SET email_notificacion = '{}'::jsonb WHERE consorcio_id = $1`, [propio]);
      expect(ok.rowCount).toBe(1);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});

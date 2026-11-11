import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';

// Integración real (HU-07 RF-03): persistencia de visitas fallidas contra PostgreSQL + PostGIS de verdad.
// Requiere la base levantada con `npm run db:up` y DATABASE_URL configurado.
loadEnvFileInto(process.env);

const PREFIJO = 'RF03-VF-INT';

describe('Visitas fallidas contra PostgreSQL + PostGIS real (HU-07 RF-03)', () => {
  let app: INestApplication | null = null;
  let pool: Pool;
  let warn: jest.SpyInstance;
  const consorciosCreados: string[] = [];
  const prefijosLimpieza = [`${PREFIJO}-`];

  async function arrancarApi(): Promise<INestApplication> {
    const config = loadConfig();
    const nuevaApp = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(nuevaApp, config);
    await nuevaApp.init();
    return nuevaApp;
  }

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    app = await arrancarApi();
  });

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  afterAll(async () => {
    for (const prefix of prefijosLimpieza) {
      await pool.query('DELETE FROM visitas_fallidas WHERE consorcio_id LIKE $1', [`${prefix}%`]);
    }
    if (consorciosCreados.length > 0) {
      await pool.query('DELETE FROM visitas_fallidas WHERE consorcio_id = ANY($1::text[])', [
        consorciosCreados,
      ]);
      await pool.query('DELETE FROM consorcios WHERE id = ANY($1)', [consorciosCreados]);
    }
    if (app) await app.close();
    await pool.end();
  });

  const totalVisitas = async (consorcioId?: string) => {
    const res = consorcioId
      ? await pool.query('SELECT count(*) AS n FROM visitas_fallidas WHERE consorcio_id = $1', [consorcioId])
      : await pool.query('SELECT count(*) AS n FROM visitas_fallidas');
    return Number(res.rows[0].n);
  };

  it('criterio 1: al registrar una visita fallida, queda guardada en PostgreSQL con todos sus datos', async () => {
    const http = request(app!.getHttpServer());

    // Crear consorcio real en PostgreSQL para validar también resolución de datos y máquinas
    const resCons = await http.post('/api/consorcios').send({
      nombre: `${PREFIJO} Edificio Anchorena`,
      direccion: 'Anchorena 1450, CABA',
      administracion: {
        nombre: 'Admin Anchorena',
        telefono: '11 5555-0001',
        email: 'admin@anchorena.test',
      },
      maquinas: [{ referenciaAgc: 'M1', descripcion: 'Ascensor Principal' }],
    });
    expect(resCons.status).toBe(201);
    const consorcioId: string = resCons.body.id;
    consorciosCreados.push(consorcioId);

    const gpsTimestamp = '2026-11-11T14:15:00.000Z';
    const resVisita = await http.post('/api/visitas-fallidas').send({
      consorcioId,
      motivo: 'Sala de máquinas bajo llave sin encargado',
      fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/anchorena-frente.jpg',
      gps: {
        latitud: -34.594123,
        longitud: -58.404567,
        precision: 3.8,
        timestamp: gpsTimestamp,
      },
      inspector: 'Inspector Carlos Méndez (RT)',
    });

    expect(resVisita.status).toBe(201);
    expect(resVisita.body.numeroAdvertencia).toBe(1);
    expect(resVisita.body.consorcioNombre).toBe(`${PREFIJO} Edificio Anchorena`);
    expect(resVisita.body.emailNotificacion.destinatario).toBe('admin@anchorena.test');

    // Verificar en PostgreSQL que están todos los campos exactos
    const dbRes = await pool.query('SELECT * FROM visitas_fallidas WHERE id = $1', [resVisita.body.id]);
    expect(dbRes.rowCount).toBe(1);
    const row = dbRes.rows[0];
    expect(row.consorcio_id).toBe(consorcioId);
    expect(row.consorcio_nombre).toBe(`${PREFIJO} Edificio Anchorena`);
    expect(row.direccion).toBe('Anchorena 1450, CABA');
    expect(Number(row.numero_advertencia)).toBe(1);
    expect(row.motivo).toBe('Sala de máquinas bajo llave sin encargado');
    expect(row.foto_frente_url).toBe('https://storage.maicon.com.ar/fotos/anchorena-frente.jpg');
    expect(Number(row.gps_latitud)).toBeCloseTo(-34.594123, 6);
    expect(Number(row.gps_longitud)).toBeCloseTo(-58.404567, 6);
    expect(Number(row.gps_precision)).toBeCloseTo(3.8, 2);
    expect(new Date(row.gps_timestamp).toISOString()).toBe(gpsTimestamp);
    expect(row.inspector).toBe('Inspector Carlos Méndez (RT)');
    expect(row.email_notificacion).toMatchObject({
      destinatario: 'admin@anchorena.test',
      remitente: 'notificaciones@maicon.com.ar',
      estado: 'enviado',
    });
  });

  it('criterio 2: después de reiniciar la API, conserva el historial y la siguiente visita continúa la numeración', async () => {
    const consorcioId = `${PREFIJO}-reinicio-${Date.now()}`;
    const http1 = request(app!.getHttpServer());

    // 1ra y 2da visita antes del reinicio
    const v1 = await http1.post('/api/visitas-fallidas').send({
      consorcioId,
      motivo: 'Visita 1 pre-reinicio',
      fotoFrenteUrl: 'https://storage.maicon.com.ar/v1.jpg',
      gps: { latitud: -34.601, longitud: -58.381 },
      emailAdministracion: 'admin@reinicio.test',
    });
    expect(v1.status).toBe(201);
    expect(v1.body.numeroAdvertencia).toBe(1);

    const v2 = await http1.post('/api/visitas-fallidas').send({
      consorcioId,
      motivo: 'Visita 2 pre-reinicio',
      fotoFrenteUrl: 'https://storage.maicon.com.ar/v2.jpg',
      gps: { latitud: -34.602, longitud: -58.382 },
      emailAdministracion: 'admin@reinicio.test',
    });
    expect(v2.status).toBe(201);
    expect(v2.body.numeroAdvertencia).toBe(2);

    // REINICIO REAL DE LA API: cerrar la instancia completa y levantar otra limpia
    await app!.close();
    app = await arrancarApi();
    const http2 = request(app.getHttpServer());

    // Al consultar tras el reinicio, conserva ambas visitas intactas
    const histRes = await http2.get(`/api/visitas-fallidas/consorcio/${consorcioId}`).expect(200);
    expect(histRes.body.totalAdvertencias).toBe(2);
    expect(histRes.body.ultimaAdvertencia).toBe(2);
    expect(histRes.body.bloqueadoPorTerceraVisita).toBe(false);
    expect(histRes.body.historial).toHaveLength(2);
    expect(histRes.body.historial.map((h: any) => h.id)).toEqual([v1.body.id, v2.body.id]);
    expect(histRes.body.historial[0].motivo).toBe('Visita 1 pre-reinicio');
    expect(histRes.body.historial[1].motivo).toBe('Visita 2 pre-reinicio');

    // Al registrar la siguiente visita tras el reinicio, continúa en Advertencia 3 y bloquea con recargo 45%
    const v3 = await http2.post('/api/visitas-fallidas').send({
      consorcioId,
      motivo: 'Visita 3 post-reinicio',
      fotoFrenteUrl: 'https://storage.maicon.com.ar/v3.jpg',
      gps: { latitud: -34.603, longitud: -58.383 },
    });
    expect(v3.status).toBe(201);
    expect(v3.body.numeroAdvertencia).toBe(3);

    const bloqueo = await http2.get(`/api/visitas-fallidas/consorcio/${consorcioId}/bloqueo`).expect(200);
    expect(bloqueo.body.bloqueado).toBe(true);
    expect(bloqueo.body.avisoCobro).toBe('Cobro de Tercer Visita Habilitado');
    expect(bloqueo.body.porcentajeRecargo).toBe(45);

    const liq = await http2
      .post('/api/visitas-fallidas/liquidar-maquina')
      .send({ consorcioId, montoBase: 150000 })
      .expect(201);
    expect(liq.body.montoRecargo).toBe(67500);
    expect(liq.body.montoTotal).toBe(217500);
  });

  it('criterio 3 (texto rechazado por PostgreSQL): NUL responde 400 sin guardar filas y no altera el conteo', async () => {
    const consorcioId = `${PREFIJO}-nul-${Date.now()}`;
    const http = request(app!.getHttpServer());
    const antesGlobal = await totalVisitas();

    const resFallo = await http.post('/api/visitas-fallidas').send({
      consorcioId,
      motivo: 'Motivo con \u0000 nulo',
      fotoFrenteUrl: 'https://storage.maicon.com.ar/nul.jpg',
      gps: { latitud: -34.6, longitud: -58.38 },
    });

    expect(resFallo.status).toBe(400);
    expect(resFallo.body.message).toBe('Datos inválidos');
    expect(JSON.stringify(resFallo.body)).not.toMatch(/byte sequence|0x00|UTF8|22021/i);
    expect(await totalVisitas()).toBe(antesGlobal);
    expect(await totalVisitas(consorcioId)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SQLSTATE 22021'));

    // Un registro válido posterior debe entrar como Advertencia 1
    const resValido = await http.post('/api/visitas-fallidas').send({
      consorcioId,
      motivo: 'Motivo válido posterior al rechazo',
      fotoFrenteUrl: 'https://storage.maicon.com.ar/ok.jpg',
      gps: { latitud: -34.6, longitud: -58.38 },
    });
    expect(resValido.status).toBe(201);
    expect(resValido.body.numeroAdvertencia).toBe(1);
    expect(await totalVisitas(consorcioId)).toBe(1);
  });
});

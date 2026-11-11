import { INestApplication, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import { PgVisitasFallidasRepository } from '../src/visitas-fallidas/pg-visitas-fallidas.repository';
import { InMemoryVisitasFallidasRepository } from '../src/visitas-fallidas/visitas-fallidas.repository';
import { VisitasFallidasService } from '../src/visitas-fallidas/visitas-fallidas.service';
import { createTestApp, fakeDatabase } from './create-test-app';

// HU-07 RF-03: Persistencia real de visitas fallidas y propagación de errores de base.
const errorPg = (code: string, message: string) => Object.assign(new Error(message), { code, severity: 'ERROR' });

function payloadValido(extra: Record<string, unknown> = {}) {
  return {
    consorcioId: 'consorcio-persist-1',
    motivo: 'Encargado ausente en horario pactado',
    fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-persist.jpg',
    gps: {
      latitud: -34.603722,
      longitud: -58.381592,
      precision: 4.5,
      timestamp: '2026-11-11T14:00:00.000Z',
    },
    inspector: 'Juan Pérez (RT Calle)',
    emailAdministracion: 'admin@edificiopersist.com.ar',
    ...extra,
  };
}

/**
 * Simula DatabaseService con soporte de transacciones en memoria para probar
 * PgVisitasFallidasRepository y el reinicio de VisitasFallidasService sin Postgres real.
 */
function crearDbTransaccionalSimulada() {
  const filas: Record<string, any>[] = [];
  const consultas: { sql: string; params: unknown[] }[] = [];
  let orden = 1;
  let errorEnProximoInsert: Error | null = null;
  let errorEnConexion: Error | null = null;

  const ejecutarQuery = async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    if (sql.includes('INSERT INTO visitas_fallidas')) {
      if (errorEnProximoInsert) throw errorEnProximoInsert;
      filas.push({
        orden: orden++,
        id: params[0],
        consorcio_id: params[1],
        consorcio_nombre: params[2],
        direccion: params[3],
        numero_advertencia: params[4],
        motivo: params[5],
        foto_frente_url: params[6],
        gps_latitud: params[7],
        gps_longitud: params[8],
        gps_precision: params[9],
        gps_timestamp: params[10],
        inspector: params[11],
        fecha_hora: params[12],
        email_notificacion: params[13],
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT count(*) AS total FROM visitas_fallidas')) {
      const total = filas.filter((f) => f.consorcio_id === params[0]).length;
      return { rows: [{ total: String(total) }], rowCount: 1 };
    }
    if (sql.includes('FROM visitas_fallidas') && sql.includes('WHERE consorcio_id = $1')) {
      const matches = filas.filter((f) => f.consorcio_id === params[0]).sort((a, b) => a.orden - b.orden);
      return { rows: matches, rowCount: matches.length };
    }
    if (sql.includes('FROM visitas_fallidas')) {
      const sorted = [...filas].sort((a, b) => a.orden - b.orden);
      return { rows: sorted, rowCount: sorted.length };
    }
    return { rows: [], rowCount: 0 };
  };

  const db = {
    filas,
    consultas,
    setErrorInsert: (err: Error | null) => {
      errorEnProximoInsert = err;
    },
    setErrorConexion: (err: Error | null) => {
      errorEnConexion = err;
    },
    query: async (sql: string, params: unknown[] = []) => {
      if (errorEnConexion) throw errorEnConexion;
      const res = await ejecutarQuery(sql, params);
      return res.rows;
    },
    transaction: async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
      if (errorEnConexion) throw errorEnConexion;
      const client = {
        query: async (sql: string, params: unknown[] = []) => ejecutarQuery(sql, params),
      } as unknown as PoolClient;
      return work(client);
    },
  };

  return db;
}

describe('Persistencia de Visitas Fallidas en PostgreSQL (HU-07 / RF-03 — aislado)', () => {
  let app: INestApplication;
  let warn: jest.SpyInstance;
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warn.mockRestore();
    errorLog.mockRestore();
    await app?.close();
  });

  describe('Criterio 1 y 2: PgVisitasFallidasRepository + continuidad entre instancias', () => {
    it('inserta todos los campos en visitas_fallidas con lock por consorcio y sobrevive al reinicio del servicio', async () => {
      const db = crearDbTransaccionalSimulada();
      const repo1 = new PgVisitasFallidasRepository(db as unknown as DatabaseService);
      const serviceAntesDelReinicio = new VisitasFallidasService(repo1);

      // Instancia 1 registra Advertencia 1 y Advertencia 2
      const v1 = await serviceAntesDelReinicio.registrarVisitaFallida(payloadValido());
      expect(v1.numeroAdvertencia).toBe(1);
      expect(db.filas).toHaveLength(1);
      expect(db.consultas.some((c) => c.sql.includes('pg_advisory_xact_lock'))).toBe(true);
      expect(db.consultas.some((c) => c.sql.includes('INSERT INTO visitas_fallidas'))).toBe(true);
      expect(db.filas[0]).toMatchObject({
        id: v1.id,
        consorcio_id: 'consorcio-persist-1',
        numero_advertencia: 1,
        motivo: 'Encargado ausente en horario pactado',
        foto_frente_url: 'https://storage.maicon.com.ar/fotos/frente-persist.jpg',
        gps_latitud: -34.603722,
        gps_longitud: -58.381592,
        inspector: 'Juan Pérez (RT Calle)',
      });

      const v2 = await serviceAntesDelReinicio.registrarVisitaFallida(
        payloadValido({ motivo: 'Segunda ausencia' }),
      );
      expect(v2.numeroAdvertencia).toBe(2);

      // Reinicio simulado: nueva instancia del repositorio y del servicio sin estado previo en memoria
      const repo2 = new PgVisitasFallidasRepository(db as unknown as DatabaseService);
      const serviceDespuesDelReinicio = new VisitasFallidasService(repo2);

      const historial = await serviceDespuesDelReinicio.getHistorialConsorcio('consorcio-persist-1');
      expect(historial.totalAdvertencias).toBe(2);
      expect(historial.ultimaAdvertencia).toBe(2);
      expect(historial.bloqueadoPorTerceraVisita).toBe(false);
      expect(historial.historial[0].id).toBe(v1.id);
      expect(historial.historial[0].emailNotificacion?.destinatario).toBe('admin@edificiopersist.com.ar');
      expect(historial.historial[1].motivo).toBe('Segunda ausencia');

      // La siguiente visita continúa en Advertencia 3 y activa bloqueo + recargo 45%
      const v3 = await serviceDespuesDelReinicio.registrarVisitaFallida(
        payloadValido({ motivo: 'Tercera ausencia' }),
      );
      expect(v3.numeroAdvertencia).toBe(3);

      const bloqueo = await serviceDespuesDelReinicio.getBloqueoConsorcio('consorcio-persist-1');
      expect(bloqueo.bloqueado).toBe(true);
      expect(bloqueo.avisoCobro).toBe('Cobro de Tercer Visita Habilitado');
      expect(bloqueo.porcentajeRecargo).toBe(45);
    });
  });

  describe('Criterio 3: Fallo al guardar en PostgreSQL responde con error y no registra nada', () => {
    it('con la base caída (ECONNREFUSED), POST /api/visitas-fallidas responde 500 y no guarda en memoria', async () => {
      const repo = new InMemoryVisitasFallidasRepository();
      repo.registrar = async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5433');
      };

      ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, repo));
      const http = request(app.getHttpServer());

      const res = await http.post('/api/visitas-fallidas').send(payloadValido());
      expect(res.status).toBe(500);
      expect(res.body.numeroAdvertencia).toBeUndefined();
      expect(repo.registros).toHaveLength(0);
    });

    it('tras un fallo de base de datos, el reintento con la base sana registra como Advertencia 1 sin saltarse números', async () => {
      const db = crearDbTransaccionalSimulada();
      db.setErrorInsert(errorPg('08006', 'connection failure'));
      const repo = new PgVisitasFallidasRepository(db as unknown as DatabaseService);

      ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, repo));
      const http = request(app.getHttpServer());

      // Falla
      const resFallo = await http.post('/api/visitas-fallidas').send(payloadValido());
      expect(resFallo.status).toBe(500);
      expect(db.filas).toHaveLength(0);

      // Se recupera la base
      db.setErrorInsert(null);

      // Reintento exitoso -> debe quedar como Advertencia 1
      const resOk = await http.post('/api/visitas-fallidas').send(payloadValido());
      expect(resOk.status).toBe(201);
      expect(resOk.body.numeroAdvertencia).toBe(1);
      expect(db.filas).toHaveLength(1);
    });

    it('un carácter NUL (SQLSTATE 22021) responde 400 "Datos inválidos" por el filtro global y no guarda la visita', async () => {
      const db = crearDbTransaccionalSimulada();
      db.setErrorInsert(errorPg('22021', 'invalid byte sequence for encoding "UTF8": 0x00'));
      const repo = new PgVisitasFallidasRepository(db as unknown as DatabaseService);

      ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, repo));
      const http = request(app.getHttpServer());

      const res = await http
        .post('/api/visitas-fallidas')
        .send(payloadValido({ motivo: 'Encargado \u0000 ausente' }));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Datos inválidos');
      expect(JSON.stringify(res.body)).not.toMatch(/byte sequence|0x00|UTF8|22021/i);
      expect(db.filas).toHaveLength(0);
    });

    it('si falla la lectura del historial en PostgreSQL, GET /api/visitas-fallidas/consorcio/:id responde 500 en vez de devolver 0 advertencias', async () => {
      const db = crearDbTransaccionalSimulada();
      db.setErrorConexion(new Error('connect ECONNREFUSED 127.0.0.1:5433'));
      const repo = new PgVisitasFallidasRepository(db as unknown as DatabaseService);

      ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), undefined, repo));
      const http = request(app.getHttpServer());

      const res = await http.get('/api/visitas-fallidas/consorcio/consorcio-persist-1');
      expect(res.status).toBe(500);
    });
  });
});

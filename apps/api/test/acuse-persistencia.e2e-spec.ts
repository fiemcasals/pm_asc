import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { FakeDatabase, createTestApp, fakeDatabase } from './create-test-app';

// HU-10 RF-03: el acuse de recibo legal sólo se informa como registrado si quedó guardado.
const ALERTA = 'ALT-MAICON-001'; // alerta de MAICON Mantenimiento
const INSERT = /INSERT INTO acuses_recibo_legal/;

/** Un error como el que lanza `pg`: lleva el SQLSTATE en `code`. */
const errorPg = (code: string, message: string) => Object.assign(new Error(message), { code, severity: 'ERROR' });

describe('Acuse de recibo legal: se informa sólo si quedó guardado (HU-10 RF-03)', () => {
  let app: INestApplication;
  let db: FakeDatabase;
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

  async function arrancar(base: FakeDatabase = fakeDatabase()) {
    db = base;
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, db));
    return request(app.getHttpServer());
  }

  /** Lo que la API informa hoy de la alerta: su acuseRecibo, o null si todavía no tiene. */
  async function acuseDe(http: ReturnType<typeof request>, alertaId = ALERTA) {
    const res = await http.get('/api/eca/alertas').query({ eca: 'maicon' }).expect(200);
    const item = res.body.alertas.find((a: { alerta: { id: string } }) => a.alerta.id === alertaId);
    expect(item).toBeDefined();
    return item.alerta.acuseRecibo ?? null;
  }

  describe('criterio 3 — con la base sana', () => {
    it('responde 201 con ok: true, guarda 1 fila con la alerta y el usuario, y la alerta muestra su acuse', async () => {
      const http = await arrancar();

      const res = await http.post(`/api/eca/alertas/${ALERTA}/acuse`).send({ usuario: 'qa.valido' });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.acuse.usuario).toBe('qa.valido');

      const inserts = db.consultas.filter((c) => INSERT.test(c.texto));
      expect(inserts).toHaveLength(1);
      expect(inserts[0].params[0]).toBe(ALERTA); // alerta_id
      expect(inserts[0].params[3]).toBe('qa.valido'); // usuario

      expect((await acuseDe(http))?.usuario).toBe('qa.valido');
    });
  });

  describe('criterio 1 — con la base caída', () => {
    it('POST responde 500, no informa ok: true y la alerta sigue sin acuse', async () => {
      const http = await arrancar(fakeDatabase({ errorDeQuery: new Error('connect ECONNREFUSED 127.0.0.1:5433') }));

      const res = await http.post(`/api/eca/alertas/${ALERTA}/acuse`).send({ usuario: 'qa.basecaida' });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBeUndefined();
      expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(await acuseDe(http)).toBeNull();
    });

    it('después de un fallo, un reintento con la base sana registra el acuse (no quedó ningún estado a medias)', async () => {
      const http = await arrancar(fakeDatabase({ errorDeQuery: errorPg('08006', 'connection failure') }));
      expect((await http.post(`/api/eca/alertas/${ALERTA}/acuse`).send({ usuario: 'qa.reintento' })).status).toBe(500);
      expect(await acuseDe(http)).toBeNull();

      db.errorDeQuery = null; // la base vuelve

      const res = await http.post(`/api/eca/alertas/${ALERTA}/acuse`).send({ usuario: 'qa.reintento' });
      expect(res.status).toBe(201);
      expect((await acuseDe(http))?.usuario).toBe('qa.reintento');
    });
  });

  describe('criterio 2 — con un carácter NUL en usuario', () => {
    it('POST responde 400 con message "Datos inválidos" y la alerta sigue sin acuse', async () => {
      const http = await arrancar(
        fakeDatabase({ errorDeQuery: errorPg('22021', 'invalid byte sequence for encoding "UTF8": 0x00') }),
      );

      const res = await http.post(`/api/eca/alertas/${ALERTA}/acuse`).send({ usuario: 'qa\u0000nulo' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Datos inválidos');
      expect(res.body.errores).toHaveLength(1);
      expect(JSON.stringify(res.body)).not.toMatch(/byte sequence|0x00|UTF8|22021/i);
      expect(await acuseDe(http)).toBeNull();
    });
  });

  describe('criterio 4 — remito con la base caída', () => {
    it('GET /api/eca/remito/:alertaId responde 500 y no entrega el remito ni marca el acuse', async () => {
      const http = await arrancar(fakeDatabase({ errorDeQuery: new Error('connect ECONNREFUSED') }));

      const res = await http.get(`/api/eca/remito/${ALERTA}`).query({ usuario: 'operador.legal@maicon.com.ar' });

      expect(res.status).toBe(500);
      expect(res.headers['content-disposition']).toBeUndefined();
      expect(res.body.acuseLegal).toBeUndefined();
      expect(await acuseDe(http)).toBeNull();
    });

    it('con la base sana el remito se entrega y el acuse queda guardado (no cambia lo que ya funcionaba)', async () => {
      const http = await arrancar();

      const res = await http.get(`/api/eca/remito/${ALERTA}`).query({ usuario: 'operador.legal@maicon.com.ar' });

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body.acuseLegal.registrado).toBe(true);
      expect(db.consultas.filter((c) => INSERT.test(c.texto))).toHaveLength(1);
    });
  });

  it('una alerta que no existe sigue dando 404 y no toca la base', async () => {
    const http = await arrancar();

    const res = await http.post('/api/eca/alertas/ALT-NO-EXISTE/acuse').send({ usuario: 'x' });

    expect(res.status).toBe(404);
    expect(db.consultas).toHaveLength(0);
  });
});

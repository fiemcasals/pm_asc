import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { deriveAppDatabaseUrl } from '../src/database/database.service';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-07 RF-04): el recargo del 45 % una sola vez y su anulación, contra PostgreSQL de verdad. Requiere la
// base levantada con `npm run db:up`, DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET (en el .env de la raíz o en el entorno).
loadEnvFileInto(process.env);

const P = 'RF04-int';
const TZ = 'America/Argentina/Buenos_Aires';

describe('Recargo del 45 % una sola vez y su anulación contra PostgreSQL real (HU-07 RF-04)', () => {
  let app: INestApplication;
  let admin: Pool; // dueño de las tablas: arma y limpia datos
  let appPool: Pool; // el rol sin privilegios que usa la API
  let tokenAdmin = '';
  let tokenSecretaria = '';
  let consorcioId = '';
  let m1 = '';
  let m2 = '';
  let periodoActual = '';
  let periodoSiguiente = '';

  beforeAll(async () => {
    const config = loadConfig();
    admin = new Pool({ connectionString: config.databaseUrl });
    appPool = new Pool({ connectionString: deriveAppDatabaseUrl(config.databaseUrl, config.databaseAppUrl, config.databaseAppPassword) });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    tokenAdmin = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-admin`, rol: 'administrador' })).token;
    tokenSecretaria = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-secretaria`, rol: 'secretaria' })).token;

    const alta = await comoAdmin('post', '/api/consorcios').send({
      nombre: `${P} edificio`, direccion: 'Calle 1', maquinas: [{ referenciaAgc: 'M1' }, { referenciaAgc: 'M2' }],
    });
    expect(alta.status).toBe(201);
    consorcioId = alta.body.id;
    m1 = alta.body.maquinas.find((m: { referenciaAgc: string }) => m.referenciaAgc === 'M1').id;
    m2 = alta.body.maquinas.find((m: { referenciaAgc: string }) => m.referenciaAgc === 'M2').id;

    for (let i = 1; i <= 3; i++) {
      const v = await request(app.getHttpServer()).post('/api/visitas-fallidas').set('Authorization', `Bearer ${tokenSecretaria}`).send({
        consorcioId, fotoFrenteUrl: `https://f/${i}.jpg`, gps: { latitud: -34.6, longitud: -58.4 },
      });
      expect(v.status).toBe(201);
    }
    const mes = (await admin.query<{ actual: string; siguiente: string }>(
      `SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM') AS actual, to_char((now() AT TIME ZONE $1) + interval '1 month', 'YYYY-MM') AS siguiente`,
      [TZ],
    )).rows[0];
    periodoActual = mes.actual;
    periodoSiguiente = mes.siguiente;
  });

  afterAll(async () => {
    if (consorcioId) {
      await admin.query('DELETE FROM inspecciones_checklist WHERE consorcio_id = $1', [consorcioId]);
      await admin.query('DELETE FROM visitas_fallidas WHERE consorcio_id = $1', [consorcioId]);
      await admin.query('DELETE FROM consorcios WHERE id = $1', [consorcioId]); // borra las anulaciones en cascada
    }
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await appPool.end();
    await admin.end();
  });

  const comoAdmin = (metodo: 'get' | 'post', url: string) => request(app.getHttpServer())[metodo](url).set('Authorization', `Bearer ${tokenAdmin}`);
  const liquidar = (periodo: string, maquinaId: string, referenciaAgc = 'M1') =>
    comoAdmin('post', '/api/visitas-fallidas/liquidar-maquina').send({ consorcioId, maquinaId, referenciaAgc, periodo, montoBase: 100000 });
  const anular = (cuerpo: Record<string, unknown>, token = tokenAdmin) =>
    request(app.getHttpServer()).post('/api/visitas-fallidas/recargos/anular').set('Authorization', `Bearer ${token}`).send({ consorcioId, ...cuerpo });
  const anulacionesEnBase = async () => (await admin.query('SELECT * FROM recargos_anulados WHERE consorcio_id = $1', [consorcioId])).rows;

  it('criterio 1: la 3.ª advertencia suma el 45 % en la liquidación del mes, por cada máquina no inspeccionada', async () => {
    const a = await liquidar(periodoActual, m1, 'M1');
    const b = await liquidar(periodoActual, m2, 'M2');

    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ recargoAplicado: true, montoRecargo: 45000, montoTotal: 145000, recargoNoAplicadoPor: null });
    expect(b.body.recargoAplicado).toBe(true);
  });

  it('criterio 2: el mes siguiente y los posteriores no vuelven a sumarlo, aunque el edificio siga bloqueado', async () => {
    for (const periodo of [periodoSiguiente, '2030-01']) {
      const res = await liquidar(periodo, m1);
      expect(res.body).toMatchObject({ bloqueadoPorTerceraVisita: true, recargoAplicado: false, montoRecargo: 0, recargoNoAplicadoPor: 'otro_periodo' });
    }
    // Repetir la liquidación del mes de la 3.ª advertencia no la consume.
    expect((await liquidar(periodoActual, m1)).body.recargoAplicado).toBe(true);
  });

  it('una inspección del mes (en hora de Buenos Aires) libera a la máquina; una del mes anterior no', async () => {
    const insp = async (maquinaId: string, ref: string) =>
      (await comoAdmin('post', '/api/checklist/inspecciones').send({
        consorcioId, maquinaId, referenciaAgc: ref, tipoMaquina: 'traccion', estadoEquipo: 'en_uso', datos: {},
      })).body.id as string;
    const id1 = await insp(m1, 'M1');
    const id2 = await insp(m2, 'M2');
    const inicioDelMes = `(date_trunc('month', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`;
    await admin.query(`UPDATE inspecciones_checklist SET created_at = ${inicioDelMes} + interval '1 second' WHERE id = $1`, [id1]); // adentro
    await admin.query(`UPDATE inspecciones_checklist SET created_at = ${inicioDelMes} - interval '1 second' WHERE id = $1`, [id2]); // afuera

    expect((await liquidar(periodoActual, m1, 'M1')).body).toMatchObject({ recargoAplicado: false, recargoNoAplicadoPor: 'maquina_inspeccionada' });
    expect((await liquidar(periodoActual, m2, 'M2')).body).toMatchObject({ recargoAplicado: true, recargoNoAplicadoPor: null });
  });

  describe('anulación', () => {
    it('criterio 3: el Administrador anula con motivo; queda en la base con usuario, fecha y motivo, y la liquidación deja de incluirlo', async () => {
      const res = await anular({ maquinaId: m2, motivo: 'Visita fallida cargada por error' });

      expect(res.status).toBe(201);
      const filas = await anulacionesEnBase();
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ maquina_id: m2, usuario: `${P}-admin`, motivo: 'Visita fallida cargada por error' });
      expect(new Date(filas[0].fecha).getTime()).toBeGreaterThan(Date.now() - 60_000);
      const liq = await liquidar(periodoActual, m2, 'M2');
      expect(liq.body).toMatchObject({ recargoAplicado: false, montoRecargo: 0, recargoNoAplicadoPor: 'anulado' });
      expect(liq.body.recargoAnulado).toMatchObject({ usuario: `${P}-admin`, motivo: 'Visita fallida cargada por error' });
    });

    it('criterio 4: la Secretaría recibe 403, sin sesión 401, y no queda ninguna anulación nueva', async () => {
      const antes = (await anulacionesEnBase()).length;

      expect((await anular({ maquinaId: m1, motivo: 'x' }, tokenSecretaria)).status).toBe(403);
      expect((await request(app.getHttpServer()).post('/api/visitas-fallidas/recargos/anular').send({ consorcioId, maquinaId: m1, motivo: 'x' })).status).toBe(401);
      expect((await anulacionesEnBase()).length).toBe(antes);
    });

    it('sin motivo → 400; dos veces la misma máquina → 409; una máquina de otro edificio → 404', async () => {
      expect((await anular({ maquinaId: m1, motivo: '  ' })).status).toBe(400);
      expect((await anular({ maquinaId: m2, motivo: 'otra vez' })).status).toBe(409);
      expect((await anular({ maquinaId: '00000000-0000-4000-8000-000000000000', motivo: 'x' })).status).toBe(404);
      expect(await anulacionesEnBase()).toHaveLength(1);
    });

    it('la base impide un motivo vacío y la misma anulación repetida, aunque no pase por la API', async () => {
      const [tercera] = (await admin.query('SELECT id FROM visitas_fallidas WHERE consorcio_id = $1 AND numero_advertencia = 3', [consorcioId])).rows;
      await expect(
        admin.query(`INSERT INTO recargos_anulados (consorcio_id, maquina_id, visita_fallida_id, usuario, motivo) VALUES ($1, $2, $3, 'x', '  ')`, [consorcioId, m1, tercera.id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        admin.query(`INSERT INTO recargos_anulados (consorcio_id, maquina_id, visita_fallida_id, usuario, motivo) VALUES ($1, $2, $3, 'x', 'dup')`, [consorcioId, m2, tercera.id]),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('el registro es de sólo lectura para la aplicación (RLS sin política de UPDATE ni DELETE) y sólo el Administrador escribe', async () => {
      const [registro] = await anulacionesEnBase();
      const comoApp = async (rol: string, consulta: string, params: unknown[] = []) => {
        const client = await appPool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT set_config($1, $2, true)', ['app.rol_actual', rol]);
          const res = await client.query(consulta, params);
          await client.query('ROLLBACK');
          return res;
        } finally {
          client.release();
        }
      };

      expect((await comoApp('administrador', 'SELECT id FROM recargos_anulados WHERE id = $1', [registro.id])).rowCount).toBe(1);
      expect((await comoApp('administrador', "UPDATE recargos_anulados SET motivo = 'otro' WHERE id = $1", [registro.id])).rowCount).toBe(0);
      expect((await comoApp('administrador', 'DELETE FROM recargos_anulados WHERE id = $1', [registro.id])).rowCount).toBe(0);
      await expect(
        comoApp('secretaria', `INSERT INTO recargos_anulados (consorcio_id, maquina_id, visita_fallida_id, usuario, motivo) VALUES ($1, 'x', 'y', 'z', 'm')`, [consorcioId]),
      ).rejects.toMatchObject({ code: '42501' });
      expect((await anulacionesEnBase())[0].motivo).toBe('Visita fallida cargada por error');
    });
  });
});

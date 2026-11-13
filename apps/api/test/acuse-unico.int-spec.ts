import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';

// Integración real (HU-10 RF-05): el acuse de recibo legal sobrevive al reinicio de la API y es único por alerta.
// Requiere la base levantada con `npm run db:up` y DATABASE_URL (en el .env de la raíz o en el entorno).
loadEnvFileInto(process.env);

const P = 'RF05-int';
const ALERTA = 'ALT-MAICON-001'; // de MAICON Mantenimiento
const OTRA_ALERTA = 'ALT-CP-001'; // de Conservación Porteña

describe('Acuse de recibo legal: se relee al reiniciar y es único por alerta (HU-10 RF-05)', () => {
  const config = loadConfig();
  let pool: Pool;
  const apps: INestApplication[] = [];

  /** Arranca una instancia nueva de la API: la memoria empieza sin acuses, como tras un reinicio. */
  async function arrancar(): Promise<INestApplication> {
    const app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    apps.push(app);
    return app;
  }
  const acuseInformado = async (app: INestApplication, alertaId: string, eca: string) => {
    const res = await request(app.getHttpServer()).get('/api/eca/alertas').query({ eca }).expect(200);
    const item = res.body.alertas.find((a: { alerta: { id: string } }) => a.alerta.id === alertaId);
    return item.alerta.acuseRecibo ?? null;
  };
  const filas = async (alertaId: string) => (await pool.query('SELECT usuario, eca FROM acuses_recibo_legal WHERE alerta_id = $1', [alertaId])).rows;

  beforeAll(async () => {
    pool = new Pool({ connectionString: config.databaseUrl });
    await pool.query('DELETE FROM acuses_recibo_legal WHERE alerta_id = ANY($1)', [[ALERTA, OTRA_ALERTA, `${P}-otra`]]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM acuses_recibo_legal WHERE usuario LIKE $1', [`${P}%`]);
    for (const app of apps) await app.close();
    await pool.end();
  });

  it('criterio 2: un segundo POST de la misma alerta no crea otra fila y devuelve el acuse ya registrado', async () => {
    const app = await arrancar();

    const primero = await request(app.getHttpServer()).post(`/api/eca/alertas/${ALERTA}/acuse`).send({ usuario: `${P}-primero` });
    const segundo = await request(app.getHttpServer()).post(`/api/eca/alertas/${ALERTA}/acuse`).send({ usuario: `${P}-segundo` });

    expect(primero.status).toBe(201);
    expect(primero.body.yaRegistrado).toBe(false);
    expect(segundo.status).toBe(201);
    expect(segundo.body.yaRegistrado).toBe(true);
    expect(segundo.body.acuse).toMatchObject({ usuario: `${P}-primero`, fechaHora: primero.body.acuse.fechaHora, id: primero.body.acuse.id });
    expect(segundo.body.mensaje).toContain('ya estaba registrado');
    expect(await filas(ALERTA)).toEqual([{ usuario: `${P}-primero`, eca: 'MAICON Mantenimiento' }]); // una sola fila, la del primero
  });

  it('el remito repetido tampoco duplica el acuse ni cambia al usuario', async () => {
    const app = await arrancar();

    const res = await request(app.getHttpServer()).get(`/api/eca/remito/${ALERTA}`).query({ usuario: `${P}-remito` });

    expect(res.status).toBe(200);
    expect(await filas(ALERTA)).toHaveLength(1);
    expect((await filas(ALERTA))[0].usuario).toBe(`${P}-primero`);
  });

  it('criterio 1: tras reiniciar la API (instancia nueva, memoria vacía) la alerta sigue figurando con su acuse, usuario y fecha', async () => {
    const guardado = (await pool.query('SELECT usuario, fecha_hora FROM acuses_recibo_legal WHERE alerta_id = $1', [ALERTA])).rows[0];
    const reiniciada = await arrancar();

    const acuse = await acuseInformado(reiniciada, ALERTA, 'maicon');

    expect(acuse).toEqual({ usuario: `${P}-primero`, fechaHora: new Date(guardado.fecha_hora).toISOString() });
  });

  it('criterio 4: el acuse de otra alerta o guardado con otra ECA no aparece en la alerta consultada', async () => {
    // Un acuse de otra alerta (de la otra ECA) y otro acuse "de la alerta consultada" pero grabado con otra ECA.
    await pool.query(
      `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, tipo_alerta) VALUES ($1, 'MAQ-X', 'Conservación Porteña S.R.L.', $2, 'Falla')`,
      [OTRA_ALERTA, `${P}-otra-alerta`],
    );
    const reiniciada = await arrancar();

    expect((await acuseInformado(reiniciada, ALERTA, 'maicon'))?.usuario).toBe(`${P}-primero`); // no se mezcló con el de la otra alerta
    expect((await acuseInformado(reiniciada, OTRA_ALERTA, 'porteña'))?.usuario).toBe(`${P}-otra-alerta`);
    expect(await acuseInformado(reiniciada, 'ALT-MAICON-002', 'maicon')).toBeNull(); // sin fila: sin acuse

    // Una fila de ALT-MAICON-002 grabada con otra ECA no se muestra como acuse de MAICON.
    await pool.query(
      `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, tipo_alerta) VALUES ('ALT-MAICON-002', 'MAQ-Y', 'Otra ECA', $1, 'Falla')`,
      [`${P}-otra-eca`],
    );
    expect(await acuseInformado(await arrancar(), 'ALT-MAICON-002', 'maicon')).toBeNull();
    await pool.query('DELETE FROM acuses_recibo_legal WHERE alerta_id = $1 AND usuario = $2', ['ALT-MAICON-002', `${P}-otra-eca`]);
  });

  it('criterio 1 y 4: con dos alertas de la misma ECA, cada acuse queda en su alerta (no se cruzan)', async () => {
    await pool.query('DELETE FROM acuses_recibo_legal WHERE alerta_id = ANY($1)', [[ALERTA, 'ALT-MAICON-002']]);
    await pool.query(
      `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, tipo_alerta) VALUES ('ALT-MAICON-002', 'MAQ-W', 'MAICON Mantenimiento', $1, 'Falla')`,
      [`${P}-solo-la-002`],
    );
    const reiniciada = await arrancar();

    expect(await acuseInformado(reiniciada, ALERTA, 'maicon')).toBeNull(); // la 001 no tiene acuse: no hereda el de la 002
    expect((await acuseInformado(reiniciada, 'ALT-MAICON-002', 'maicon'))?.usuario).toBe(`${P}-solo-la-002`);

    await pool.query('DELETE FROM acuses_recibo_legal WHERE alerta_id = $1', ['ALT-MAICON-002']);
    await pool.query(
      `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, tipo_alerta) VALUES ($1, 'MAQ-X', 'MAICON Mantenimiento', $2, 'Falla')`,
      [ALERTA, `${P}-primero`],
    ); // lo que esperan las pruebas siguientes
  });

  it('criterio 3: la base impide por sí misma dos acuses de la misma alerta (restricción de unicidad)', async () => {
    const def = await pool.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'acuses_recibo_alerta_unica'`);
    expect(def.rows[0]?.def).toBe('UNIQUE (alerta_id)');

    await expect(
      pool.query(
        `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, tipo_alerta) VALUES ($1, 'MAQ-Z', 'MAICON Mantenimiento', $2, 'Falla')`,
        [ALERTA, `${P}-directo`],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    expect(await filas(ALERTA)).toHaveLength(1);
  });

  it('dos POST simultáneos de la misma alerta dejan una sola fila (uno registra y el otro recibe el acuse existente)', async () => {
    const app = await arrancar();
    await pool.query('DELETE FROM acuses_recibo_legal WHERE alerta_id = $1', [ALERTA]);

    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post(`/api/eca/alertas/${ALERTA}/acuse`).send({ usuario: `${P}-a` }),
      request(app.getHttpServer()).post(`/api/eca/alertas/${ALERTA}/acuse`).send({ usuario: `${P}-b` }),
    ]);

    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a.body.yaRegistrado, b.body.yaRegistrado].sort()).toEqual([false, true]);
    expect(a.body.acuse.usuario).toBe(b.body.acuse.usuario); // los dos informan el mismo acuse
    expect(await filas(ALERTA)).toHaveLength(1);
  });
});

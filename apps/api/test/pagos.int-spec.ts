import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-02 RF-04): el abono y los porcentajes de cada máquina viven en la base, con su historial y sus topes.
// Requiere la base levantada con `npm run db:up` y DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET.
loadEnvFileInto(process.env);

const P = 'RF04pago-int';

describe('Abono y porcentajes por máquina (HU-02 RF-04)', () => {
  let app: INestApplication;
  let admin: Pool;
  let tokenAdmin = '';
  let tokenRt = '';
  let consorcioId = '';
  let maquinaId = '';

  beforeAll(async () => {
    const config = loadConfig();
    admin = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    tokenAdmin = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-admin`, rol: 'administrador' })).token;
    tokenRt = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-rt`, rol: 'rt_calle' })).token;
    const alta = await request(app.getHttpServer())
      .post('/api/consorcios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: `${P} edificio`, direccion: 'Calle Pago 1', maquinas: [{ referenciaAgc: 'M1' }] });
    expect(alta.status).toBe(201);
    consorcioId = alta.body.id;
    maquinaId = (await admin.query<{ id: string }>('SELECT id FROM maquinas WHERE consorcio_id = $1', [consorcioId])).rows[0].id;
  });

  afterAll(async () => {
    await admin.query('DELETE FROM consorcios WHERE id = $1', [consorcioId]); // borra máquinas e historial
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM intentos_login WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await admin.end();
  });

  const url = () => `/api/consorcios/${consorcioId}/maquinas/${maquinaId}/pago`;
  const como = (token: string) => ({
    ver: () => request(app.getHttpServer()).get(url()).set('Authorization', `Bearer ${token}`),
    guardar: (c: Record<string, unknown>) => request(app.getHttpServer()).put(url()).set('Authorization', `Bearer ${token}`).send(c),
    historial: () => request(app.getHttpServer()).get(`${url()}/historial`).set('Authorization', `Bearer ${token}`),
  });
  const enBase = async () => (await admin.query('SELECT abono_mensual::float AS abono, porcentaje_rt::float AS rt, porcentaje_firmante::float AS f FROM maquinas WHERE id = $1', [maquinaId])).rows[0];

  it('una máquina nueva trae 60 % y 25 % y sin abono', async () => {
    expect(await enBase()).toEqual({ abono: null, rt: 60, f: 25 });
    expect((await como(tokenAdmin).ver()).body).toMatchObject({ abonoMensual: null, porcentajeRt: 60, porcentajeFirmante: 25 });
  });

  it('el Administrador guarda abono y porcentajes: quedan en la base y cada cambio en el historial con su usuario', async () => {
    const res = await como(tokenAdmin).guardar({ abonoMensual: 250000.5, porcentajeRt: 50, porcentajeFirmante: 30 });

    expect(res.status).toBe(200);
    expect(await enBase()).toEqual({ abono: 250000.5, rt: 50, f: 30 });
    const hist = (await como(tokenAdmin).historial()).body;
    expect(hist).toHaveLength(3);
    expect(hist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: 'porcentaje_rt', valorAnterior: '60', valorNuevo: '50', usuario: `${P}-admin` }),
        expect.objectContaining({ campo: 'abono_mensual', valorAnterior: null, valorNuevo: '250000.5' }),
      ]),
    );
  });

  it('los topes los hace cumplir la API (400) y también la base (CHECK)', async () => {
    const antes = await enBase();
    expect((await como(tokenAdmin).guardar({ porcentajeRt: 101 })).status).toBe(400);
    expect((await como(tokenAdmin).guardar({ porcentajeRt: 70, porcentajeFirmante: 40 })).status).toBe(400);
    expect(await enBase()).toEqual(antes);

    await expect(admin.query('UPDATE maquinas SET porcentaje_rt = 90, porcentaje_firmante = 20 WHERE id = $1', [maquinaId])).rejects.toThrow(/maquinas_porcentajes_validos/);
    await expect(admin.query('UPDATE maquinas SET abono_mensual = -5 WHERE id = $1', [maquinaId])).rejects.toThrow(/maquinas_abono_no_negativo/);
  });

  it('el RT de Calle no ve ni edita el pago (403)', async () => {
    expect((await como(tokenRt).ver()).status).toBe(403);
    expect((await como(tokenRt).guardar({ abonoMensual: 1 })).status).toBe(403);
  });

  it('el historial no se puede modificar con el rol de la aplicación (sólo se agrega)', async () => {
    const hist = await admin.query('SELECT count(*)::int AS n FROM maquinas_pago_historial WHERE maquina_id = $1', [maquinaId]);
    expect(hist.rows[0].n).toBeGreaterThan(0);
    const pol = await admin.query(`SELECT cmd FROM pg_policies WHERE tablename = 'maquinas_pago_historial' ORDER BY cmd`);
    expect(pol.rows.map((r) => r.cmd)).toEqual(['INSERT', 'SELECT']);
  });

  it('la liquidación toma el abono y los porcentajes guardados de la máquina', async () => {
    await como(tokenAdmin).guardar({ abonoMensual: 200000, porcentajeRt: 50, porcentajeFirmante: 30 });

    const res = await request(app.getHttpServer())
      .post('/api/visitas-fallidas/liquidar-maquina')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ consorcioId, maquinaId, referenciaAgc: 'M1', montoBase: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ montoBase: 200000, origenAbono: 'maquina', montoRt: 100000, montoFirmante: 60000 });
  });
});

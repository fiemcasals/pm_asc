import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-15 RF-02): el portal ECA con sesión contra PostgreSQL de verdad. Requiere la base levantada con
// `npm run db:up`, DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET (en el .env de la raíz o en el entorno).
loadEnvFileInto(process.env);

const P = 'HU15e-int';
const ECA_PORTENA = 'Conservación Porteña S.R.L.';
const ECA_MAICON = 'MAICON Mantenimiento';
const CP = 'ALT-CP-001'; // de Conservación Porteña
const M1 = 'ALT-MAICON-001'; // de MAICON Mantenimiento
const M2 = 'ALT-MAICON-002';
const ALERTAS = [CP, M1, M2];

describe('Portal ECA con sesión contra PostgreSQL real (HU-15 RF-02)', () => {
  const config = loadConfig();
  let pool: Pool;
  let app: INestApplication;
  const s = {
    portena: { token: '', usuario: '' },
    maicon: { token: '', usuario: '' },
    secretaria: { token: '', usuario: '' },
    administrador: { token: '', usuario: '' },
  };

  const con = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());
  const filas = async () => (await pool.query('SELECT alerta_id, usuario, eca FROM acuses_recibo_legal WHERE alerta_id = ANY($1) ORDER BY alerta_id', [ALERTAS])).rows;
  const alertas = async (token: string, eca?: string) => {
    const res = await http().get('/api/eca/alertas').set(con(token)).query(eca ? { eca } : {}).expect(200);
    return res.body.alertas as { alerta: { id: string; acuseRecibo: { usuario: string } | null } }[];
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: config.databaseUrl });
    s.portena = await asegurarUsuarioPrueba(pool, config, { usuario: `${P}-portena`, rol: 'eca', eca: ECA_PORTENA });
    s.maicon = await asegurarUsuarioPrueba(pool, config, { usuario: `${P}-maicon`, rol: 'eca', eca: ECA_MAICON });
    s.secretaria = await asegurarUsuarioPrueba(pool, config, { usuario: `${P}-secretaria`, rol: 'secretaria' });
    s.administrador = await asegurarUsuarioPrueba(pool, config, { usuario: `${P}-admin`, rol: 'administrador' });
    await pool.query('DELETE FROM acuses_recibo_legal WHERE alerta_id = ANY($1)', [ALERTAS]);
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
  });

  afterAll(async () => {
    await pool.query('DELETE FROM acuses_recibo_legal WHERE alerta_id = ANY($1)', [ALERTAS]);
    await pool.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await pool.end();
  });

  it('criterio 1: sin sesión, las rutas del portal ECA responden 401 y no se registra ningún acuse', async () => {
    const rutas: [string, string][] = [
      ['get', '/api/eca/alertas'],
      ['get', '/api/eca/cobertura'],
      ['get', '/api/eca/maquinas'],
      ['get', `/api/eca/remito/${M2}`],
      ['get', `/api/eca/remito/${M2}?formato=pdf&usuario=intruso@x.com`],
      ['post', `/api/eca/alertas/${M2}/acuse`],
    ];

    for (const [metodo, ruta] of rutas) {
      const res = await (metodo === 'get' ? http().get(ruta) : http().post(ruta).send({ usuario: 'intruso@x.com' })).set('x-eca-user', 'intruso@x.com');
      expect([ruta, res.status]).toEqual([ruta, 401]);
    }
    expect(await filas()).toEqual([]);
  });

  it('criterio 2: cada usuario ECA ve sólo las alertas de su ECA, aunque pida otra por header o por parámetro', async () => {
    const porteñaPideMaicon = await http().get('/api/eca/alertas').set(con(s.portena.token)).set('x-eca-name', ECA_MAICON).query({ eca: ECA_MAICON }).expect(200);

    expect(porteñaPideMaicon.body.eca).toBe(ECA_PORTENA);
    expect(porteñaPideMaicon.body.alertas.map((a: { alerta: { id: string } }) => a.alerta.id)).toEqual([CP]);
    expect((await alertas(s.maicon.token, ECA_PORTENA)).map((a) => a.alerta.id).sort()).toEqual([M1, M2]);
  });

  it('criterio 2: la alerta de otra ECA da 404 en el remito y en el acuse, y no deja ningún acuse en la base', async () => {
    const remito = await http().get(`/api/eca/remito/${CP}`).set(con(s.maicon.token));
    const pdf = await http().get(`/api/eca/remito/${CP}?formato=pdf`).set(con(s.maicon.token));
    const acuse = await http().post(`/api/eca/alertas/${CP}/acuse`).set(con(s.maicon.token));

    expect([remito.status, pdf.status, acuse.status]).toEqual([404, 404, 404]);
    expect(await filas()).toEqual([]);
  });

  it('criterio 4: el acuse queda a nombre del usuario de la sesión (no el de la URL, el cuerpo ni los headers), con la ECA de la alerta', async () => {
    const res = await http().post(`/api/eca/alertas/${M1}/acuse`).set(con(s.maicon.token)).set('x-eca-user', 'otro@x.com').send({ usuario: 'responsable@x.com' });

    expect(res.status).toBe(201);
    expect(res.body.acuse.usuario).toBe(s.maicon.usuario);
    expect(await filas()).toEqual([{ alerta_id: M1, usuario: s.maicon.usuario, eca: ECA_MAICON }]);
  });

  it('criterio 4: descargar el remito PDF con otro usuario en la URL registra el de la sesión', async () => {
    const res = await http().get(`/api/eca/remito/${CP}?formato=pdf&usuario=intruso@x.com`).set(con(s.portena.token)).set('x-eca-user', 'intruso@x.com');

    expect(res.status).toBe(200);
    expect(res.headers['x-acuse-usuario']).toBe(encodeURIComponent(s.portena.usuario));
    expect((await filas()).find((f) => f.alerta_id === CP)).toEqual({ alerta_id: CP, usuario: s.portena.usuario, eca: ECA_PORTENA });
  });

  it.each(['secretaria', 'administrador'] as const)('criterio 3: %s ve las alertas de cualquier ECA, con el acuse que la ECA registró', async (rol) => {
    const deMaicon = await alertas(s[rol].token, ECA_MAICON);
    const dePorteña = await alertas(s[rol].token, ECA_PORTENA);

    expect(deMaicon.find((a) => a.alerta.id === M1)?.alerta.acuseRecibo?.usuario).toBe(s.maicon.usuario);
    expect(deMaicon.find((a) => a.alerta.id === M2)?.alerta.acuseRecibo).toBeNull();
    expect(dePorteña.find((a) => a.alerta.id === CP)?.alerta.acuseRecibo?.usuario).toBe(s.portena.usuario);
  });

  it('criterio 3: la Secretaría y el Administrador no registran acuses (403) y el RT y el Firmante tampoco ven el portal', async () => {
    const rt = await asegurarUsuarioPrueba(pool, config, { usuario: `${P}-rt`, rol: 'rt_calle' });
    const firmante = await asegurarUsuarioPrueba(pool, config, { usuario: `${P}-firmante`, rol: 'firmante' });

    for (const token of [s.secretaria.token, s.administrador.token]) {
      expect((await http().post(`/api/eca/alertas/${M2}/acuse`).set(con(token))).status).toBe(403);
      expect((await http().get(`/api/eca/remito/${M2}`).set(con(token))).status).toBe(403);
    }
    for (const token of [rt.token, firmante.token]) {
      expect((await http().get('/api/eca/alertas').set(con(token))).status).toBe(403);
      expect((await http().get('/api/eca/cobertura').set(con(token))).status).toBe(403);
      expect((await http().post(`/api/eca/alertas/${M2}/acuse`).set(con(token))).status).toBe(403);
    }
    expect((await filas()).find((f) => f.alerta_id === M2)).toBeUndefined();
  });

  it('la vista pública del informe no crea acuses: ni sobre una alerta sin acuse ni sobre las que ya tienen', async () => {
    const antes = await filas();

    const res = await http().get(`/api/eca/remito/${M2}/informe`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('pendiente');
    expect(await filas()).toEqual(antes);
  });
});

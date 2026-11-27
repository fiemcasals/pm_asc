import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { FirmanteService } from '../src/firmante/firmante.service';
import { ParadasService } from '../src/paradas/paradas.service';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-17 RF-09): los reportes de parada contra PostgreSQL de verdad, con un reinicio de la API en el medio.
// Requiere la base levantada con `npm run db:up` y DATABASE_URL.
loadEnvFileInto(process.env);

const PREFIJO = 'H17RF09-int';
let MAQUINA = 'MAQ-SANTAFE-M2';
let ECA_NOMBRE = 'MAICON Mantenimiento';
let FIRMANTE_NOMBRE = 'firmante';
const FOTO = 'data:image/jpeg;base64,AAAA';

describe('Reportes de parada contra PostgreSQL real (HU-17 RF-09)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: ReturnType<typeof loadConfig>;
  let tokens: { rt: string; secretaria: string };
  let silencio: jest.SpyInstance;
  const clientReportId = `${PREFIJO}-${Date.now()}`;

  const limpiar = async () => {
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    await pool.query('DELETE FROM reportes_parada WHERE maquina_id = $1', [MAQUINA]);
  };
  async function arrancar() {
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
  }
  async function reiniciar() {
    await app.get(ParadasService).esperarGuardados();
    await app.close();
    await arrancar();
  }

  beforeAll(async () => {
    config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
    const rt = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-rt`, rol: 'rt_calle' });
    const s = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-secretaria`, rol: 'secretaria' });
    tokens = { rt: rt.token, secretaria: s.token };
    await arrancar(); // aplica las migraciones
    const maq = app.get(FirmanteService).getMaquinas()[0];
    if (maq) {
      MAQUINA = maq.id;
      ECA_NOMBRE = maq.eca;
      FIRMANTE_NOMBRE = maq.firmanteUsername;
    }
    await limpiar();
    await reiniciar();
  });
  beforeEach(() => {
    silencio = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => silencio.mockRestore());
  afterAll(async () => {
    await limpiar();
    await pool.query('DELETE FROM usuarios WHERE usuario = ANY($1)', [[`${PREFIJO}-rt`, `${PREFIJO}-secretaria`, `${PREFIJO}-eca`]]);
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());
  const reportar = () =>
    http().post('/api/paradas').set('Authorization', `Bearer ${tokens.rt}`).send({ maquinaId: MAQUINA, estado: 'Reparación Urgente', causa: 'Ruido en el motor', fotos: [FOTO], clientReportId });
  const reportes = async () => ((await http().get('/api/paradas').set('Authorization', `Bearer ${tokens.secretaria}`).expect(200)).body as any[]).filter((r) => r.maquinaId === MAQUINA);
  /** El estado del equipo tal como lo leen el Portal ECA, el Monitoreo y la ficha (FirmanteService). */
  const estadoEca = async () => app.get(FirmanteService).getMaquinas().find((m) => m.id === MAQUINA)?.estadoOperativo;

  it('criterios 1 y 2: el reporte sigue visible después de reiniciar (también el estado del equipo) y el reintento no lo duplica', async () => {
    const r = (await reportar().expect(201)).body;

    await reiniciar();

    expect(await reportes()).toEqual([r]);
    expect(await estadoEca()).toBe('Reparación Urgente');
    const otraVez = (await reportar().expect(201)).body;
    expect(otraVez.id).toBe(r.id);
    expect(await reportes()).toHaveLength(1);
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    expect((await pool.query('SELECT count(*)::int AS n FROM reportes_parada WHERE client_report_id = $1', [clientReportId])).rows[0].n).toBe(1);
    const permisos = await pool.query("SELECT has_table_privilege('ascensores_app', 'reportes_parada', 'DELETE') AS borrar");
    expect(permisos.rows[0].borrar).toBe(false);
  });

  it('HU-10 RF-08: la alerta crítica de la parada figura en el Portal ECA y sobrevive al reinicio en PostgreSQL', async () => {
    const ecaUser = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-eca`, rol: 'eca', eca: ECA_NOMBRE });
    const r = (await reportar().expect(201)).body;

    const antes = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${ecaUser.token}`)
      .expect(200);
    const alertaAntes = antes.body.alertas.find((a: any) => a.maquinaId === MAQUINA);
    expect(alertaAntes).toBeDefined();
    expect(alertaAntes.alerta.tipo).toBe('REPARACION_URGENTE');
    expect(alertaAntes.alerta.motivo).toBe('Ruido en el motor');

    await reiniciar();

    const ecaUserPost = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-eca`, rol: 'eca', eca: ECA_NOMBRE });
    const despues = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${ecaUserPost.token}`)
      .expect(200);
    const alertaDespues = despues.body.alertas.find((a: any) => a.maquinaId === MAQUINA);
    expect(alertaDespues).toBeDefined();
    expect(alertaDespues.alerta.id).toBe(alertaAntes.alerta.id);
    expect(alertaDespues.alerta.tipo).toBe('REPARACION_URGENTE');

    // Descargar remito y registrar acuse en PostgreSQL
    const remito = await http()
      .get(`/api/eca/remito/${alertaDespues.alerta.id}`)
      .set('Authorization', `Bearer ${ecaUserPost.token}`)
      .expect(200);
    expect(remito.body.acuseLegal.registrado).toBe(true);
    expect(remito.body.acuseLegal.usuario).toBe(`${PREFIJO}-eca`);

    // Confirmar reporte antes de normalizar
    await app.get(ParadasService).resolver(r.id, 'confirmar', { usuario: FIRMANTE_NOMBRE, rol: 'firmante' });

    // Normalizar equipo y verificar que la alerta se retira
    await http()
      .post(`/api/paradas/maquinas/${MAQUINA}/normalizar`)
      .set('Authorization', `Bearer ${tokens.rt}`)
      .send({ fotos: [FOTO] })
      .expect(200);

    const normal = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${ecaUserPost.token}`)
      .expect(200);
    expect(normal.body.alertas.find((a: any) => a.maquinaId === MAQUINA)).toBeUndefined();
  });
});

import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AvisosService } from '../src/avisos/avisos.service';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { FallasCriticasService } from '../src/fallas-criticas/fallas-criticas.service';
import { ParadasService } from '../src/paradas/paradas.service';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-06 RF-08): los informes de falla crítica y el estado del ascensor contra PostgreSQL de verdad, con un reinicio
// de la API en el medio. Requiere la base levantada con `npm run db:up` y DATABASE_URL.
loadEnvFileInto(process.env);

const PREFIJO = 'H06RF08-int';
const MAQUINA = 'MAQ-SANTAFE-M1';
const FOTO = 'data:image/jpeg;base64,AAAA';

describe('Informes de falla crítica contra PostgreSQL real (HU-06 RF-08)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: ReturnType<typeof loadConfig>;
  let tokens: { rt: string; secretaria: string; firmante: string };
  let silencio: jest.SpyInstance;
  const clientReportId = `${PREFIJO}-${Date.now()}`;

  const limpiar = async () => {
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    const ids = (await pool.query('SELECT id FROM informes_falla WHERE maquina_id = $1', [MAQUINA])).rows.map((r) => r.id);
    await pool.query('DELETE FROM avisos_falla WHERE alerta_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM informes_falla WHERE maquina_id = $1', [MAQUINA]);
    await pool.query('DELETE FROM reportes_parada WHERE maquina_id = $1', [MAQUINA]);
  };
  async function arrancar() {
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
  }
  async function reiniciar() {
    await app.get(FallasCriticasService).esperarGuardados();
    await app.get(AvisosService).esperarGuardados();
    await app.get(ParadasService).esperarGuardados();
    await app.close();
    await arrancar();
  }

  beforeAll(async () => {
    config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
    const rt = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-rt`, rol: 'rt_calle' });
    const s = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-secretaria`, rol: 'secretaria' });
    const f = await asegurarUsuarioPrueba(pool, config, { usuario: 'gonza', rol: 'firmante' });
    tokens = { rt: rt.token, secretaria: s.token, firmante: f.token };
    await arrancar(); // aplica las migraciones
    await limpiar();
    await reiniciar();
  });
  beforeEach(() => {
    silencio = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => silencio.mockRestore());
  afterAll(async () => {
    await limpiar();
    await pool.query('DELETE FROM usuarios WHERE usuario = ANY($1)', [[`${PREFIJO}-rt`, `${PREFIJO}-secretaria`, 'gonza']]);
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());
  const informar = () =>
    http().post('/api/fallas-criticas/informes').set('Authorization', `Bearer ${tokens.rt}`).send({ maquinaId: MAQUINA, fallasCriticas: ['BOTON_PARE_FALLA'], clientReportId });
  const panel = async (token: string) => ((await http().get('/api/fallas-criticas/informes').set('Authorization', `Bearer ${token}`).expect(200)).body as any[]).map((e) => e.informeId);

  it('criterios 1 a 3: el informe, su alerta y el estado del ascensor siguen después de reiniciar, y el reintento no duplica ni avisa', async () => {
    const r = (await informar().expect(201)).body;
    const p = (await http().post('/api/paradas').set('Authorization', `Bearer ${tokens.rt}`).send({ maquinaId: MAQUINA, estado: 'Fuera de Servicio', causa: 'Botón de PARE', fotos: [FOTO] }).expect(201)).body;
    await http().post(`/api/paradas/${p.id}/confirmar`).set('Authorization', `Bearer ${tokens.firmante}`).expect(200);

    await reiniciar();

    expect(await panel(tokens.secretaria)).toContain(r.informe.id);
    expect(await panel(tokens.firmante)).toContain(r.informe.id);
    const avisos = (await http().get('/api/avisos').set('Authorization', `Bearer ${tokens.secretaria}`).expect(200)).body as any[];
    expect(avisos.filter((a) => a.alertaId === r.informe.id)).toHaveLength(1);
    const otraVez = (await informar().expect(201)).body;
    expect(otraVez).toMatchObject({ eventoEmitido: false, informe: { id: r.informe.id } });
    const reportes = (await http().get('/api/paradas').set('Authorization', `Bearer ${tokens.secretaria}`).expect(200)).body as any[];
    expect(reportes.find((x) => x.id === p.id)).toMatchObject({ confirmacion: 'Confirmado' });
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    expect((await pool.query('SELECT count(*)::int AS n FROM informes_falla WHERE client_report_id = $1', [clientReportId])).rows[0].n).toBe(1);
    expect((await pool.query("SELECT has_table_privilege('ascensores_app', 'informes_falla', 'DELETE') AS b")).rows[0].b).toBe(false);
  });
});

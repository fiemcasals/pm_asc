import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AvisosService } from '../src/avisos/avisos.service';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-11 RF-11): los avisos de falla crítica de la bandeja contra PostgreSQL de verdad, con un reinicio de la API en
// el medio. Requiere la base levantada con `npm run db:up` y DATABASE_URL.
loadEnvFileInto(process.env);

const PREFIJO = 'RF11-int';

describe('Avisos de falla crítica contra PostgreSQL real (HU-11 RF-11)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: ReturnType<typeof loadConfig>;
  let tokens: { rt: string; secretaria: string };
  let enviados = 0;
  const creados: string[] = [];
  let silencio: jest.SpyInstance;

  const limpiar = async () => {
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    if (creados.length) {
      await pool.query('DELETE FROM avisos_falla WHERE alerta_id = ANY($1)', [creados]);
      await pool.query("DELETE FROM whatsapp_envios WHERE alerta_id = ANY($1)", [creados]);
      // Desde HU-06 RF-08 los informes de falla también se guardan.
      await pool.query("DELETE FROM informes_falla WHERE id = ANY($1)", [creados]);
    }
  };

  async function arrancar() {
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    app.get(WhatsAppConnectorService).setTransport({ proveedor: 'meta', postMessage: async () => ({ status: 200, providerMessageId: `wamid.${PREFIJO}.${Date.now()}.${++enviados}` }) } as never);
  }

  async function reiniciar() {
    await app.get(AvisosService).esperarGuardados();
    await app.get(WhatsAppConnectorService).esperarGuardados();
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
  });

  beforeEach(() => {
    silencio = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => silencio.mockRestore());

  afterAll(async () => {
    await limpiar();
    await pool.query('DELETE FROM usuarios WHERE usuario = ANY($1)', [[`${PREFIJO}-rt`, `${PREFIJO}-secretaria`]]);
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());
  const comoSecretaria = (r: request.Test) => r.set('Authorization', `Bearer ${tokens.secretaria}`);
  const informar = async () => {
    const id = (await http().post('/api/fallas-criticas/informes').set('Authorization', `Bearer ${tokens.rt}`).send({ maquinaId: 'MAQ-CORRIENTES-M1', fallasCriticas: ['BOTON_PARE_FALLA'] }).expect(201)).body.informe.id as string;
    creados.push(id);
    return id;
  };
  const aviso = async (id: string) => ((await comoSecretaria(http().get('/api/avisos')).expect(200)).body as any[]).find((a) => a.alertaId === id);

  it('criterios 1 a 3: un pendiente se aprueba después de reiniciar, el enlace sigue andando y un enviado no se vuelve a enviar', async () => {
    const pendiente = await informar();
    const enviado = await informar();
    const aprobado = (await comoSecretaria(http().post(`/api/avisos/${enviado}/aprobar`)).send({}).expect(201)).body;
    const ruta = new URL(aprobado.enlace).pathname;
    const mandadosAntes = enviados;

    await reiniciar();

    // 1. El pendiente sigue pendiente y se puede aprobar.
    expect((await aviso(pendiente)).estado).toBe('Pendiente de revisión');
    // 2. El enlace del enviado sigue abriendo el informe, con el mismo vencimiento.
    await http().get(ruta).expect(200);
    expect((await aviso(enviado)).enlaceVenceEn).toBe(aprobado.enlaceVenceEn);
    // 3. El enviado no se vuelve a enviar y conserva sus envíos.
    await comoSecretaria(http().post(`/api/avisos/${enviado}/aprobar`)).send({}).expect(409);
    expect((await aviso(enviado)).envios).toEqual(aprobado.envios);
    expect(enviados).toBe(mandadosAntes);

    const r = (await comoSecretaria(http().post(`/api/avisos/${pendiente}/aprobar`)).send({}).expect(201)).body;
    expect(r.estado).toBe('Enviado');
  });

  it('cada aviso es una fila en avisos_falla, y la aplicación no puede borrarlas', async () => {
    const id = await informar();
    await app.get(AvisosService).esperarGuardados();
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    const filas = await pool.query('SELECT estado FROM avisos_falla WHERE alerta_id = $1', [id]);
    expect(filas.rows).toEqual([{ estado: 'Pendiente de revisión' }]);
    const permisos = await pool.query("SELECT has_table_privilege('ascensores_app', 'avisos_falla', 'DELETE') AS borrar");
    expect(permisos.rows[0].borrar).toBe(false);
  });
});

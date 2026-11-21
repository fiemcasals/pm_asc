import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createHmac } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-11 RF-12): el historial de envíos de WhatsApp contra PostgreSQL de verdad, con un reinicio de la API en el
// medio. Requiere la base levantada con `npm run db:up` y DATABASE_URL.
loadEnvFileInto(process.env);

const PREFIJO = 'RF12-int';
const APP_SECRET = 'app-secret-rf12-int';
const AVISO = { telefonoDestino: '+54 9 11 7777-1212', nombreEca: 'ECA RF12', consorcio: 'Consorcio RF12', equipo: 'M1', estado: 'Fuera de Servicio', detalle: 'Prueba RF-12' };

describe('Historial de envíos de WhatsApp contra PostgreSQL real (HU-11 RF-12)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: ReturnType<typeof loadConfig>;
  let token = '';
  let n = 0;
  let errores: jest.SpyInstance;
  const prefijoMensaje = `wamid.${PREFIJO}.${Date.now()}`;

  const limpiar = async () => {
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    // La aplicación no puede borrar envíos (REVOKE DELETE): la limpieza la hace el dueño de la base.
    await pool.query("DELETE FROM whatsapp_envios WHERE id_mensaje LIKE $1 OR registro->>'telefonoDestino' = $2", [`wamid.${PREFIJO}.%`, '+5491177771212']);
  };

  async function arrancar() {
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    app.get(WhatsAppConnectorService).setTransport({ proveedor: 'meta', postMessage: async () => ({ status: 200, providerMessageId: `${prefijoMensaje}.${++n}` }) } as never);
  }

  async function reiniciar() {
    await app.get(WhatsAppConnectorService).esperarGuardados();
    await app.close();
    await arrancar();
  }

  beforeAll(async () => {
    config = loadConfig({ ...process.env, WHATSAPP_META_APP_SECRET: APP_SECRET, WHATSAPP_META_VERIFY_TOKEN: 'verify-rf12-int' });
    pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
    token = (await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-secretaria`, rol: 'secretaria' })).token;
    await arrancar(); // aplica las migraciones
    await limpiar();
  });

  beforeEach(() => {
    errores = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errores.mockRestore());

  afterAll(async () => {
    await limpiar();
    await pool.query('DELETE FROM usuarios WHERE usuario = $1', [`${PREFIJO}-secretaria`]);
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());
  const enviar = async () => (await http().post('/api/whatsapp/enviar-alerta').send(AVISO).expect(201)).body.idMensaje as string;
  const registro = async (id: string) =>
    ((await http().get('/api/whatsapp/historial').set('Authorization', `Bearer ${token}`).expect(200)).body.registros as any[]).find((r) => r.idMensaje === id);
  const proveedor = (id: string, status: string) => {
    const cuerpo = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id, status, timestamp: '1790000000' }] } }] }] });
    const firma = `sha256=${createHmac('sha256', APP_SECRET).update(cuerpo).digest('hex')}`;
    return http().post('/api/whatsapp/webhook/meta').set('Content-Type', 'application/json').set('X-Hub-Signature-256', firma).send(cuerpo).expect(200);
  };

  it('criterios 1 y 2: el envío y su estado siguen después de reiniciar, y un aviso del proveedor posterior actualiza el registro correcto', async () => {
    const entregado = await enviar();
    const aceptado = await enviar();
    await proveedor(entregado, 'delivered');
    const antes = await registro(entregado);

    await reiniciar();

    expect(await registro(entregado)).toEqual(antes);
    expect((await registro(aceptado)).estadoEntrega).toBe('aceptado');

    await proveedor(aceptado, 'read');
    expect((await registro(aceptado)).estadoEntrega).toBe('leido');
    expect((await registro(entregado)).estadoEntrega).toBe('entregado');

    await reiniciar();
    expect((await registro(aceptado)).estadoEntrega).toBe('leido');
    expect(errores).not.toHaveBeenCalled();
  });

  it('cada envío es una fila en whatsapp_envios con su id de mensaje, y la aplicación no puede borrarlas', async () => {
    const id = await enviar();
    await app.get(WhatsAppConnectorService).esperarGuardados();
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    const filas = await pool.query('SELECT id_mensaje, estado_entrega FROM whatsapp_envios WHERE id_mensaje = $1', [id]);
    expect(filas.rows).toEqual([{ id_mensaje: id, estado_entrega: 'aceptado' }]);
    const permisos = await pool.query("SELECT has_table_privilege('ascensores_app', 'whatsapp_envios', 'DELETE') AS borrar, has_table_privilege('ascensores_app', 'whatsapp_envios', 'UPDATE') AS cambiar");
    expect(permisos.rows[0]).toEqual({ borrar: false, cambiar: true });
  });
});

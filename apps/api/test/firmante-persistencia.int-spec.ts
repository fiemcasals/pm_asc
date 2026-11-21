import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { DatabaseService } from '../src/database/database.service';
import { RolRls, runWithRlsContext } from '../src/database/rls-context';
import { FirmanteService } from '../src/firmante/firmante.service';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-08 RF-05): las firmas, los rechazos y los avisos del Portal Firmante contra PostgreSQL de verdad,
// con un reinicio de la API en el medio. Requiere la base levantada con `npm run db:up` y DATABASE_URL.
loadEnvFileInto(process.env);

const PREFIJO = 'RF05-int';
// Las máquinas de ejemplo son del Firmante «gonza»: el usuario de la sesión tiene que llamarse así.
const FIRMANTE = 'gonza';
const MAQUINAS = ['MAQ-CORRIENTES-M1', 'MAQ-SANTAFE-M1', 'MAQ-SANTAFE-M2', 'MAQ-CALLAO-M1'];

describe('Visitas, firmas y avisos del Portal Firmante contra PostgreSQL real (HU-08 RF-05)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: ReturnType<typeof loadConfig>;
  let warn: jest.SpyInstance;
  let tokens: { firmante: string; secretaria: string };

  const limpiar = async () => {
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    await pool.query('DELETE FROM firma_visitas WHERE maquina_id = ANY($1)', [MAQUINAS]);
    await pool.query('DELETE FROM firma_avisos_plazo WHERE maquina_id = ANY($1)', [MAQUINAS]);
  };

  async function arrancar() {
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
  }

  /** Reinicio: se espera lo que estaba por guardarse, se apaga la API y se arranca otra, sin nada en memoria. */
  async function reiniciar() {
    await app.get(FirmanteService).esperarGuardados();
    await app.close();
    await arrancar();
  }

  beforeAll(async () => {
    config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
    const f = await asegurarUsuarioPrueba(pool, config, { usuario: FIRMANTE, rol: 'firmante' });
    const s = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-secretaria`, rol: 'secretaria' });
    tokens = { firmante: f.token, secretaria: s.token };
    await arrancar(); // aplica las migraciones
    await limpiar();
    await reiniciar(); // para que arranque sin nada guardado de otra corrida
  });

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  afterAll(async () => {
    await limpiar();
    await pool.query('DELETE FROM usuarios WHERE usuario = ANY($1)', [[FIRMANTE, `${PREFIJO}-secretaria`]]);
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());
  const comoFirmante = (r: request.Test) => r.set('Authorization', `Bearer ${tokens.firmante}`);
  const comoSecretaria = (r: request.Test) => r.set('Authorization', `Bearer ${tokens.secretaria}`);
  const visitaDe = async (id: string) => {
    const res = await comoFirmante(http().get('/api/firmante/maquinas')).expect(200);
    return (res.body as { id: string; visita: Record<string, unknown> }[]).find((m) => m.id === id)!.visita;
  };

  it('criterios 1 a 3: la firma, el rechazo y el aviso de plazo siguen iguales después de reiniciar la API', async () => {
    const firmada = await comoFirmante(http().post('/api/firmante/autorizar')).send({ maquinaId: 'MAQ-CORRIENTES-M1' }).expect(200);
    await comoFirmante(http().post('/api/firmante/rechazar')).send({ maquinaId: 'MAQ-SANTAFE-M1', motivo: 'Faltan fotos del foso' }).expect(200);
    const bandejaAntes = (await comoSecretaria(http().get('/api/firmante/bandeja-secretaria')).expect(200)).body;
    expect(bandejaAntes.avisosPlazo.length).toBeGreaterThan(0);

    await reiniciar();

    expect(await visitaDe('MAQ-CORRIENTES-M1')).toMatchObject({
      autorizada: true,
      autorizadoPor: FIRMANTE,
      fechaAutorizacion: firmada.body.autorizacion.fechaAutorizacion,
      protocoloAGC: firmada.body.autorizacion.protocoloAGC,
    });
    const bandejaDespues = (await comoSecretaria(http().get('/api/firmante/bandeja-secretaria')).expect(200)).body;
    expect(bandejaDespues.rechazados).toEqual(bandejaAntes.rechazados);
    expect(bandejaDespues.rechazados[0]).toMatchObject({ maquinaId: 'MAQ-SANTAFE-M1', motivo: 'Faltan fotos del foso', rechazadoPor: FIRMANTE });
    // Los avisos de antes siguen, con la misma fecha, y no se generó ninguno repetido.
    const claves = (b: { avisosPlazo: { visitaId: string; fecha: string }[] }) => b.avisosPlazo.map((a) => `${a.visitaId}@${a.fecha}`).sort();
    expect(claves(bandejaDespues)).toEqual(claves(bandejaAntes));
    await app.get(FirmanteService).esperarGuardados();
    const filas = await pool.query('SELECT visita_id FROM firma_avisos_plazo WHERE maquina_id = ANY($1)', [MAQUINAS]);
    expect(filas.rowCount).toBe(bandejaAntes.avisosPlazo.length);
  });

  it('la firma y el rechazo quedaron guardados en las tablas, y solo la Secretaría y el Administrador las leen o escriben (RLS, con el rol de la aplicación)', async () => {
    const db = app.get(DatabaseService);
    const como = <T>(rol: RolRls | null, trabajo: () => Promise<T>) =>
      runWithRlsContext({ eca: rol === 'eca' ? 'ECA Test' : null, rol, usuario: rol ? 'prueba' : null, esExplicito: true }, trabajo);
    const filas = () => db.query<{ maquina_id: string; estado: string; autorizada: string }>(
      "SELECT maquina_id, estado, visita ->> 'autorizada' AS autorizada FROM firma_visitas WHERE maquina_id = ANY($1) ORDER BY maquina_id",
      [MAQUINAS],
    );

    for (const rol of ['administrador', 'secretaria'] as RolRls[]) {
      const leidas = await como(rol, filas);
      expect(leidas.map((r) => r.maquina_id)).toEqual(expect.arrayContaining(['MAQ-CORRIENTES-M1', 'MAQ-SANTAFE-M1']));
      expect(leidas.find((r) => r.maquina_id === 'MAQ-CORRIENTES-M1')?.autorizada).toBe('true');
    }
    for (const rol of ['firmante', 'rt_calle', 'eca', null] as (RolRls | null)[]) {
      expect({ rol, leidas: (await como(rol, filas)).length }).toEqual({ rol, leidas: 0 });
      await expect(
        como(rol, () => db.query("INSERT INTO firma_visitas (maquina_id, mes, estado, visita) VALUES ('RLS-INT', '2026-11', 'Recorrida', '{}'::jsonb)")),
      ).rejects.toThrow(/row-level security/);
    }
  });

  it('una firma ya guardada no se puede firmar de nuevo después de reiniciar (409 en el rechazo)', async () => {
    const res = await comoFirmante(http().post('/api/firmante/rechazar')).send({ maquinaId: 'MAQ-CORRIENTES-M1', motivo: 'tarde' });
    expect(res.status).toBe(409);
  });
});

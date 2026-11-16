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

// Integración real (HU-10 RF-04): los recordatorios y avisos de alertas sin acuse contra PostgreSQL de verdad. Requiere la
// base levantada con `npm run db:up`, DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET (en el .env de la raíz o en el entorno).
loadEnvFileInto(process.env);

const P = 'RF04e-int';
const CP = 'ALT-CP-001'; // Conservación Porteña, detectada el 6/11/2026
const M1 = 'ALT-MAICON-001'; // MAICON Mantenimiento
const M2 = 'ALT-MAICON-002'; // MAICON Mantenimiento
const ALERTAS = [CP, M1, M2];

describe('Recordatorio a las 24 h y aviso a las 48 h sin acuse contra PostgreSQL real (HU-10 RF-04)', () => {
  const config = loadConfig();
  let admin: Pool; // dueño de las tablas
  let appPool: Pool; // el rol sin privilegios que usa la API
  const apps: INestApplication[] = [];
  let tokenSecretaria = '';

  async function arrancar(): Promise<INestApplication> {
    const app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    apps.push(app);
    return app;
  }
  const alertas = async (app: INestApplication, eca: string) =>
    (await request(app.getHttpServer()).get('/api/eca/alertas').query({ eca }).expect(200)).body.alertas as {
      alerta: { id: string; historial: { tipo: string; eca: string; edificio: string; fecha: string }[] };
    }[];
  const tiposDe = async (app: INestApplication, eca: string, alertaId: string) =>
    (await alertas(app, eca)).find((a) => a.alerta.id === alertaId)!.alerta.historial.map((e) => e.tipo);
  const filas = async () => (await admin.query('SELECT alerta_id, tipo FROM alertas_avisos WHERE alerta_id = ANY($1) ORDER BY alerta_id, tipo', [ALERTAS])).rows;
  const limpiar = async () => {
    await admin.query('DELETE FROM alertas_avisos WHERE alerta_id = ANY($1)', [ALERTAS]);
    await admin.query('DELETE FROM acuses_recibo_legal WHERE alerta_id = ANY($1)', [ALERTAS]);
  };

  beforeAll(async () => {
    admin = new Pool({ connectionString: config.databaseUrl });
    appPool = new Pool({ connectionString: deriveAppDatabaseUrl(config.databaseUrl, config.databaseAppUrl, config.databaseAppPassword) });
    tokenSecretaria = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-secretaria`, rol: 'secretaria' })).token;
    await limpiar();
    // MAICON-002 se acusó 2 h después de detectada (7:45Z → 9:45Z): no debe tener recordatorio ni aviso.
    await admin.query(
      `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, fecha_hora, tipo_alerta) VALUES ($1, 'MAQ-INT', 'MAICON Mantenimiento', $2, '2026-11-06T09:45:00Z', 'Falla')`,
      [M2, `${P}-acuse`],
    );
  });

  afterAll(async () => {
    await limpiar();
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    for (const app of apps) await app.close();
    await appPool.end();
    await admin.end();
  });

  it('lo dispara quien sea: si el proceso arranca desde la bandeja de la Secretaría (sesión sin ECA) igual registra los avisos y respeta el acuse de MAICON-002', async () => {
    await admin.query('DELETE FROM alertas_avisos WHERE alerta_id = ANY($1)', [ALERTAS]);

    const res = await request((await arrancar()).getHttpServer()).get('/api/eca/avisos-secretaria').set('Authorization', `Bearer ${tokenSecretaria}`);

    expect(res.status).toBe(200);
    expect(await filas()).toEqual([
      { alerta_id: CP, tipo: 'aviso_secretaria_48h' },
      { alerta_id: CP, tipo: 'recordatorio_eca_24h' },
      { alerta_id: M1, tipo: 'aviso_secretaria_48h' },
      { alerta_id: M1, tipo: 'recordatorio_eca_24h' },
    ]); // ninguno de MAICON-002: tiene acuse de las 9:45
  });

  it('criterios 1 y 2: la alerta sin acuse queda con el recordatorio y el aviso en la base y en su historial', async () => {
    const app = await arrancar();

    expect(await tiposDe(app, 'Conservación Porteña S.R.L.', CP)).toEqual(['recordatorio_eca_24h', 'aviso_secretaria_48h']);
    expect(await tiposDe(app, 'maicon', M1)).toEqual(['recordatorio_eca_24h', 'aviso_secretaria_48h']);
    const guardado = await admin.query('SELECT eca, edificio, mensaje FROM alertas_avisos WHERE alerta_id = $1 AND tipo = $2', [M1, 'aviso_secretaria_48h']);
    expect(guardado.rows[0]).toMatchObject({ eca: 'MAICON Mantenimiento', edificio: 'Consorcio Santa Fe 3200' });
    expect(guardado.rows[0].mensaje).toContain('no acusó recibo en 48 horas');
  });

  it('criterio 3: la alerta que la ECA acusó a las 2 h no tiene recordatorio ni aviso', async () => {
    const app = await arrancar();

    expect(await tiposDe(app, 'maicon', M2)).toEqual([]);
    expect((await filas()).filter((f: { alerta_id: string }) => f.alerta_id === M2)).toEqual([]);
  });

  it('criterio 4: tras reiniciar la API (instancia nueva) y abrir las alertas otra vez no se repite ningún registro ni cambia su fecha', async () => {
    const antes = (await admin.query('SELECT alerta_id, tipo, fecha FROM alertas_avisos WHERE alerta_id = ANY($1) ORDER BY alerta_id, tipo', [ALERTAS])).rows;
    const reiniciada = await arrancar();

    await alertas(reiniciada, 'Conservación Porteña S.R.L.');
    await alertas(reiniciada, 'maicon');
    await request(reiniciada.getHttpServer()).get('/api/eca/avisos-secretaria').set('Authorization', `Bearer ${tokenSecretaria}`).expect(200);

    const despues = (await admin.query('SELECT alerta_id, tipo, fecha FROM alertas_avisos WHERE alerta_id = ANY($1) ORDER BY alerta_id, tipo', [ALERTAS])).rows;
    expect(despues).toHaveLength(4);
    expect(despues).toEqual(antes);
  });

  it('la Secretaría ve los avisos de las dos ECA con el edificio y la ECA (RLS por rol), y no el de la alerta acusada', async () => {
    const res = await request((await arrancar()).getHttpServer()).get('/api/eca/avisos-secretaria').set('Authorization', `Bearer ${tokenSecretaria}`);

    expect(res.status).toBe(200);
    const propios = res.body.filter((a: { alertaId: string }) => ALERTAS.includes(a.alertaId));
    expect(propios.map((a: { alertaId: string }) => a.alertaId).sort()).toEqual([CP, M1].sort());
    expect(propios.find((a: { alertaId: string }) => a.alertaId === CP)).toMatchObject({ eca: 'Conservación Porteña S.R.L.', edificio: 'Consorcio Corrientes 1234' });
  });

  describe('la base protege el historial', () => {
    const comoApp = async (ctx: { eca?: string; rol?: string }, consulta: string, params: unknown[] = []) => {
      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        if (ctx.eca) await client.query("SELECT set_config('app.eca_actual', $1, true)", [ctx.eca]);
        if (ctx.rol) await client.query("SELECT set_config('app.rol_actual', $1, true)", [ctx.rol]);
        const res = await client.query(consulta, params);
        await client.query('ROLLBACK');
        return res;
      } finally {
        client.release();
      }
    };

    it('cada ECA ve sólo los registros de sus alertas; la Secretaría, todos; sin contexto, ninguno', async () => {
      const sql = 'SELECT alerta_id FROM alertas_avisos WHERE alerta_id = ANY($1)';

      expect((await comoApp({ eca: 'MAICON Mantenimiento' }, sql, [ALERTAS])).rows.map((r) => r.alerta_id).sort()).toEqual([M1, M1]);
      expect((await comoApp({ eca: 'Otra ECA' }, sql, [ALERTAS])).rowCount).toBe(0);
      expect((await comoApp({ rol: 'secretaria' }, sql, [ALERTAS])).rowCount).toBe(4);
      expect((await comoApp({}, sql, [ALERTAS])).rowCount).toBe(0);
    });

    it('no se puede modificar ni borrar un registro, ni repetirlo, ni inventar un tipo', async () => {
      expect((await comoApp({ rol: 'secretaria' }, "UPDATE alertas_avisos SET mensaje = 'x' WHERE alerta_id = $1", [CP])).rowCount).toBe(0);
      expect((await comoApp({ rol: 'secretaria' }, 'DELETE FROM alertas_avisos WHERE alerta_id = $1', [CP])).rowCount).toBe(0);
      await expect(
        admin.query(`INSERT INTO alertas_avisos (alerta_id, tipo, eca, edificio, mensaje) VALUES ($1, 'recordatorio_eca_24h', 'X', 'Y', 'Z')`, [CP]),
      ).rejects.toMatchObject({ code: '23505' }); // ya existe ese recordatorio
      await expect(
        admin.query(`INSERT INTO alertas_avisos (alerta_id, tipo, eca, edificio, mensaje) VALUES ($1, 'otro_tipo', 'X', 'Y', 'Z')`, ['ALT-X']),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await filas()).toHaveLength(4);
    });
  });
});

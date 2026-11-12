import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';
import { runMigrations } from './migrator';
import { getRlsContext, runWithEcaContext } from './rls-context';

export const APP_RLS_ROLE = 'ascensores_app';

function extraerPasswordDeUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    return new URL(rawUrl).password || undefined;
  } catch {
    return undefined;
  }
}

export function deriveAppDatabaseUrl(
  databaseUrl: string,
  databaseAppUrl?: string,
  databaseAppPassword?: string,
): string {
  if (databaseAppUrl) return databaseAppUrl;
  if (!databaseUrl) return '';
  try {
    const parsed = new URL(databaseUrl);
    parsed.username = APP_RLS_ROLE;
    parsed.password = databaseAppPassword ?? '';
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

export interface RlsDiagnostico {
  usuarioActual: string;
  esSuperuser: boolean;
  tieneBypassRls: boolean;
  esDuenoTablas: boolean;
  tablasConRls: Array<{ tabla: string; rlsActivo: boolean; politicas: number }>;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly adminDatabaseUrl: string;
  private readonly runtimePassword?: string;
  private readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.adminDatabaseUrl = config.databaseUrl;
    this.runtimePassword = config.databaseAppPassword || extraerPasswordDeUrl(config.databaseAppUrl);
    const runtimeUrl = deriveAppDatabaseUrl(
      config.databaseUrl,
      config.databaseAppUrl,
      this.runtimePassword,
    );
    this.pool = new Pool({
      connectionString: runtimeUrl,
      connectionTimeoutMillis: 2000,
      max: 5,
    });
    // Un error en una conexión ociosa no debe tirar abajo el proceso.
    this.pool.on('error', (err) => this.logger.error(`Error en el pool de PostgreSQL: ${err.message}`));
  }

  /**
   * Al arrancar aplica las migraciones pendientes usando una conexión administrativa efímera
   * y sincroniza la clave del rol `ascensores_app` desde `.env` (`DATABASE_APP_PASSWORD` / `DATABASE_APP_URL`).
   * El pool en tiempo de ejecución siempre usa el rol sin privilegios ni BYPASSRLS.
   */
  async onModuleInit(): Promise<void> {
    if (!this.adminDatabaseUrl) return;
    const migrationPool = new Pool({
      connectionString: this.adminDatabaseUrl,
      connectionTimeoutMillis: 2000,
      max: 2,
    });
    try {
      const applied = await runMigrations(migrationPool);
      if (applied.length > 0) this.logger.log(`Migraciones aplicadas: ${applied.join(', ')}`);
      if (this.runtimePassword) {
        const escaped = this.runtimePassword.replace(/'/g, "''");
        await migrationPool.query(`ALTER ROLE ${APP_RLS_ROLE} WITH LOGIN PASSWORD '${escaped}'`);
      } else {
        this.logger.warn(
          'DATABASE_APP_PASSWORD no configurada en .env; el rol ascensores_app puede fallar si PostgreSQL exige contraseña.',
        );
      }
    } catch (err) {
      this.logger.error(
        `No se pudieron aplicar las migraciones: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      await migrationPool.end().catch(() => undefined);
    }
  }

  /** Verifica la conexión y devuelve la versión de PostGIS instalada. */
  async checkHealth(): Promise<{ postgis: string }> {
    const result = await this.pool.query<{ version: string }>(
      'SELECT postgis_lib_version() AS version',
    );
    return { postgis: result.rows[0].version };
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const ctx = getRlsContext();
    if (ctx?.eca) {
      return this.transaction(async (client) => {
        const res = await client.query<T>(text, params);
        return res.rows;
      });
    }
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  /** Ejecuta `work` dentro de una transacción, aplicando `app.eca_actual` si existe contexto. */
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const ctx = getRlsContext();
    try {
      await client.query('BEGIN');
      if (ctx?.eca) {
        await client.query("SELECT set_config('app.eca_actual', $1, true)", [ctx.eca]);
      }
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Atajo explícito para ejecutar consultas bajo una ECA específica o sin contexto (`null`). */
  conContextoEca<T>(eca: string | null, work: () => Promise<T>): Promise<T> {
    return runWithEcaContext(eca, work, true);
  }

  /** Inspecciona en tiempo de ejecución el usuario de conexión y las políticas RLS activas. */
  async inspeccionarRls(): Promise<RlsDiagnostico> {
    const [rol] = await this.query<{
      usuario: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>('SELECT current_user AS usuario, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');

    const duenoRes = await this.query<{ cant: string }>(
      `SELECT count(*) AS cant
         FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('consorcios', 'maquinas', 'roles_edificio', 'acuses_recibo_legal', 'visitas_fallidas')
          AND tableowner = current_user`,
    );

    const tablas = await this.query<{ tablename: string; relrowsecurity: boolean; politicas: string }>(
      `SELECT c.relname AS tablename,
              c.relrowsecurity,
              (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('consorcios', 'maquinas', 'roles_edificio', 'acuses_recibo_legal', 'visitas_fallidas')
        ORDER BY c.relname`,
    );

    return {
      usuarioActual: rol.usuario,
      esSuperuser: rol.rolsuper,
      tieneBypassRls: rol.rolbypassrls,
      esDuenoTablas: Number(duenoRes[0]?.cant ?? 0) > 0,
      tablasConRls: tablas.map((t) => ({
        tabla: t.tablename,
        rlsActivo: t.relrowsecurity,
        politicas: Number(t.politicas),
      })),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

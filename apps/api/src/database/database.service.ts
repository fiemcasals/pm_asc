import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';
import { runMigrations } from './migrator';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 2000,
      max: 5,
    });
    // Un error en una conexión ociosa no debe tirar abajo el proceso.
    this.pool.on('error', (err) => this.logger.error(`Error en el pool de PostgreSQL: ${err.message}`));
  }

  /**
   * Al arrancar aplica las migraciones pendientes. Si la base no está, la API arranca igual:
   * /api/health responde 503 y el sistema queda visiblemente "no operativo".
   */
  async onModuleInit(): Promise<void> {
    try {
      const applied = await runMigrations(this.pool);
      if (applied.length > 0) this.logger.log(`Migraciones aplicadas: ${applied.join(', ')}`);
    } catch (err) {
      this.logger.error(
        `No se pudieron aplicar las migraciones: ${err instanceof Error ? err.message : String(err)}`,
      );
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
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  /** Ejecuta `work` dentro de una transacción: COMMIT si termina, ROLLBACK si lanza. */
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
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

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

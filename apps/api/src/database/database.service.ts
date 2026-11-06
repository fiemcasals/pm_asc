import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
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

  /** Verifica la conexión y devuelve la versión de PostGIS instalada. */
  async checkHealth(): Promise<{ postgis: string }> {
    const result = await this.pool.query<{ version: string }>(
      'SELECT postgis_lib_version() AS version',
    );
    return { postgis: result.rows[0].version };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

import type { Pool } from 'pg';
import { MIGRATIONS, Migration } from './migrations';

/** Clave del advisory lock: evita que dos instancias migren a la vez. */
const MIGRATION_LOCK_KEY = 74_001_001;

/**
 * Aplica las migraciones pendientes, cada una en su propia transacción.
 * Es idempotente: una segunda corrida no hace nada. Devuelve los ids aplicados ahora.
 */
export async function runMigrations(
  pool: Pool,
  migrations: Migration[] = MIGRATIONS,
): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const done = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
    const doneIds = new Set(done.rows.map((row) => row.id));

    for (const migration of migrations) {
      if (doneIds.has(migration.id)) continue;
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
        await client.query('COMMIT');
        applied.push(migration.id);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `Falló la migración ${migration.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
  return applied;
}

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { runWithRlsContext } from '../database/rls-context';
import { InformeFalla } from './fallas-criticas.types';

/**
 * HU-06 RF-08: dónde viven los informes de falla crítica que carga el RT (con su clientReportId y quién abrió la alerta), para que un
 * reinicio de la API no los borre.
 */
export abstract class FallasCriticasRepository {
  /** Todos los informes, del más viejo al más nuevo. */
  abstract leer(): Promise<InformeFalla[]>;
  /** Alta o reemplazo del informe (por su id). */
  abstract guardar(i: InformeFalla): Promise<void>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryFallasCriticasRepository extends FallasCriticasRepository {
  readonly informes = new Map<string, InformeFalla>();
  /** Si tiene valor, cada escritura falla con este error (para probar qué pasa si la base no responde). */
  errorAlGuardar: Error | null = null;

  async leer(): Promise<InformeFalla[]> {
    return structuredClone([...this.informes.values()]);
  }

  async guardar(i: InformeFalla): Promise<void> {
    if (this.errorAlGuardar) throw this.errorAlGuardar;
    this.informes.set(i.id, structuredClone(i));
  }
}

/**
 * En PostgreSQL. Los informes los escribe el sistema en nombre del RT que los carga o de quien abre la alerta: se accede con el alcance
 * de un Administrador, y la tabla sólo tiene política para la Secretaría y el Administrador. Quién ve qué lo sigue decidiendo
 * `FallasCriticasService` (el Firmante, sólo lo de sus edificios).
 */
@Injectable()
export class PgFallasCriticasRepository extends FallasCriticasRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  private comoSistema<T>(trabajo: () => Promise<T>): Promise<T> {
    return runWithRlsContext({ eca: null, rol: 'administrador', usuario: 'sistema', esExplicito: true }, trabajo);
  }

  async leer(): Promise<InformeFalla[]> {
    const filas = await this.comoSistema(() => this.db.query<{ informe: InformeFalla }>('SELECT informe FROM informes_falla ORDER BY registrado_en, id'));
    return filas.map((f) => f.informe);
  }

  async guardar(i: InformeFalla): Promise<void> {
    await this.comoSistema(() =>
      this.db.query(
        `INSERT INTO informes_falla (id, client_report_id, maquina_id, informe, registrado_en)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (id) DO UPDATE SET informe = EXCLUDED.informe, actualizado_en = now()`,
        [i.id, i.clientReportId ?? null, i.maquinaId, JSON.stringify(i), i.registradoEn],
      ),
    );
  }
}

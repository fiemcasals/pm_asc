import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { runWithRlsContext } from '../database/rls-context';
import { ReporteParada } from './paradas.types';

/** HU-17 RF-09: dónde viven los reportes de parada que carga el RT, para que un reinicio de la API no los borre. */
export abstract class ParadasRepository {
  /** Todos los reportes, del más viejo al más nuevo. */
  abstract leer(): Promise<ReporteParada[]>;
  /** Alta o reemplazo del reporte (por su id). */
  abstract guardar(r: ReporteParada): Promise<void>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryParadasRepository extends ParadasRepository {
  readonly reportes = new Map<string, ReporteParada>();
  /** Si tiene valor, cada escritura falla con este error (para probar qué pasa si la base no responde). */
  errorAlGuardar: Error | null = null;

  async leer(): Promise<ReporteParada[]> {
    return structuredClone([...this.reportes.values()]);
  }

  async guardar(r: ReporteParada): Promise<void> {
    if (this.errorAlGuardar) throw this.errorAlGuardar;
    this.reportes.set(r.id, structuredClone(r));
  }
}

/**
 * En PostgreSQL. Los reportes los escribe el sistema en nombre del RT que los carga o del Firmante que los resuelve: se accede con el
 * alcance de un Administrador, y la tabla sólo tiene política para la Secretaría y el Administrador. Quién ve qué lo sigue decidiendo
 * `ParadasService` (el Firmante, sólo los de sus edificios).
 */
@Injectable()
export class PgParadasRepository extends ParadasRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  private comoSistema<T>(trabajo: () => Promise<T>): Promise<T> {
    return runWithRlsContext({ eca: null, rol: 'administrador', usuario: 'sistema', esExplicito: true }, trabajo);
  }

  async leer(): Promise<ReporteParada[]> {
    const filas = await this.comoSistema(() => this.db.query<{ reporte: ReporteParada }>('SELECT reporte FROM reportes_parada ORDER BY fecha, id'));
    return filas.map((f) => f.reporte);
  }

  async guardar(r: ReporteParada): Promise<void> {
    await this.comoSistema(() =>
      this.db.query(
        `INSERT INTO reportes_parada (id, maquina_id, client_report_id, confirmacion, reporte, fecha)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (id) DO UPDATE SET confirmacion = EXCLUDED.confirmacion, reporte = EXCLUDED.reporte, actualizado_en = now()`,
        [r.id, r.maquinaId, r.clientReportId ?? null, r.confirmacion, JSON.stringify(r), r.fecha],
      ),
    );
  }
}

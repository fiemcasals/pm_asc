import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { runWithRlsContext } from '../database/rls-context';
import { AvisoPlazoVencido, EstadoVisita, VisitaInspeccion } from './firmante.types';

/** Lo que el Portal Firmante guarda de una visita de una máquina en un mes: la visita completa y el estado de la máquina. */
export interface VisitaGuardada {
  maquinaId: string;
  mes: string;
  estado: EstadoVisita;
  visita: VisitaInspeccion;
}

/**
 * HU-08 RF-05: dónde viven las visitas, las firmas AGC, los rechazos y los avisos de plazo vencido del Portal Firmante, para que un
 * reinicio de la API no los borre. Las máquinas no se guardan acá: salen de los edificios con terna (HU-02 RF-06) y de las de ejemplo.
 */
export abstract class FirmaRepository {
  abstract leerVisitas(): Promise<VisitaGuardada[]>;
  /** Alta o reemplazo de la visita de esa máquina en ese mes. */
  abstract guardarVisita(v: VisitaGuardada): Promise<void>;
  abstract leerAvisos(): Promise<AvisoPlazoVencido[]>;
  /** Un solo aviso por visita: guardar el mismo dos veces no hace nada. */
  abstract guardarAviso(a: AvisoPlazoVencido): Promise<void>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryFirmaRepository extends FirmaRepository {
  readonly visitas = new Map<string, VisitaGuardada>();
  readonly avisos = new Map<string, AvisoPlazoVencido>();
  /** Si tiene valor, cada escritura falla con este error (para probar qué pasa si la base no responde). */
  errorAlGuardar: Error | null = null;

  async leerVisitas(): Promise<VisitaGuardada[]> {
    return structuredClone([...this.visitas.values()]);
  }

  async guardarVisita(v: VisitaGuardada): Promise<void> {
    if (this.errorAlGuardar) throw this.errorAlGuardar;
    this.visitas.set(`${v.maquinaId}|${v.mes}`, structuredClone(v));
  }

  async leerAvisos(): Promise<AvisoPlazoVencido[]> {
    return structuredClone([...this.avisos.values()]);
  }

  async guardarAviso(a: AvisoPlazoVencido): Promise<void> {
    if (this.errorAlGuardar) throw this.errorAlGuardar;
    if (!this.avisos.has(a.visitaId)) this.avisos.set(a.visitaId, structuredClone(a));
  }
}

/**
 * En PostgreSQL. Lo que se guarda lo escribe el sistema en nombre del Firmante que firmó o de la Secretaría que abrió su bandeja,
 * sea cual sea el rol de la sesión de ese pedido: por eso se accede con el alcance de un Administrador y las tablas solo tienen
 * política para la Secretaría y el Administrador. Quién puede ver y firmar qué lo decide `FirmanteService`, como hasta ahora.
 */
@Injectable()
export class PgFirmaRepository extends FirmaRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  private comoSistema<T>(trabajo: () => Promise<T>): Promise<T> {
    return runWithRlsContext({ eca: null, rol: 'administrador', usuario: 'sistema', esExplicito: true }, trabajo);
  }

  async leerVisitas(): Promise<VisitaGuardada[]> {
    const filas = await this.comoSistema(() =>
      this.db.query<{ maquina_id: string; mes: string; estado: EstadoVisita; visita: VisitaInspeccion }>(
        'SELECT maquina_id, mes, estado, visita FROM firma_visitas ORDER BY actualizado_en',
      ),
    );
    return filas.map((f) => ({ maquinaId: f.maquina_id, mes: f.mes, estado: f.estado, visita: f.visita }));
  }

  async guardarVisita(v: VisitaGuardada): Promise<void> {
    await this.comoSistema(() =>
      this.db.query(
        `INSERT INTO firma_visitas (maquina_id, mes, estado, visita)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (maquina_id, mes)
         DO UPDATE SET estado = EXCLUDED.estado, visita = EXCLUDED.visita, actualizado_en = now()`,
        [v.maquinaId, v.mes, v.estado, JSON.stringify(v.visita)],
      ),
    );
  }

  async leerAvisos(): Promise<AvisoPlazoVencido[]> {
    const filas = await this.comoSistema(() =>
      this.db.query<{
        maquina_id: string;
        codigo_agc: string;
        edificio: string;
        visita_id: string;
        fecha_informe: Date;
        dias_habiles: number;
        fecha: Date;
      }>('SELECT maquina_id, codigo_agc, edificio, visita_id, fecha_informe, dias_habiles, fecha FROM firma_avisos_plazo ORDER BY fecha, visita_id'),
    );
    return filas.map((f) => ({
      maquinaId: f.maquina_id,
      codigoAGC: f.codigo_agc,
      edificio: f.edificio,
      visitaId: f.visita_id,
      fechaInforme: f.fecha_informe.toISOString(),
      diasHabiles: f.dias_habiles,
      fecha: f.fecha.toISOString(),
    }));
  }

  async guardarAviso(a: AvisoPlazoVencido): Promise<void> {
    await this.comoSistema(() =>
      this.db.query(
        `INSERT INTO firma_avisos_plazo (visita_id, maquina_id, codigo_agc, edificio, fecha_informe, dias_habiles, fecha)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (visita_id) DO NOTHING`,
        [a.visitaId, a.maquinaId, a.codigoAGC, a.edificio, a.fechaInforme, a.diasHabiles, a.fecha],
      ),
    );
  }
}

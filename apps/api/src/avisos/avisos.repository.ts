import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { runWithRlsContext } from '../database/rls-context';
import { AvisoFalla } from './avisos.types';
import { VistaInformeAviso } from './informe-publico';

/** Lo que se guarda de un aviso: el aviso de la bandeja y lo interno de su enlace (el informe que muestra, el token y cuándo se emitió). */
export interface AvisoGuardado {
  aviso: AvisoFalla;
  vista: VistaInformeAviso;
  token?: string;
  /** Cuándo se emitió el enlace (milisegundos): el vencimiento de 7 días cuenta desde acá, no desde un reinicio. */
  emitidoEn?: number;
}

/** HU-11 RF-11: dónde viven los avisos de falla crítica de la bandeja, para que un reinicio de la API no los borre. */
export abstract class AvisosRepository {
  /** Todos los avisos guardados, del más viejo al más nuevo. */
  abstract leer(): Promise<AvisoGuardado[]>;
  /** Alta o reemplazo del aviso (por su alerta). */
  abstract guardar(g: AvisoGuardado): Promise<void>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryAvisosRepository extends AvisosRepository {
  readonly avisos = new Map<string, AvisoGuardado>();
  /** Si tiene valor, cada escritura falla con este error (para probar qué pasa si la base no responde). */
  errorAlGuardar: Error | null = null;

  async leer(): Promise<AvisoGuardado[]> {
    return structuredClone([...this.avisos.values()]);
  }

  async guardar(g: AvisoGuardado): Promise<void> {
    if (this.errorAlGuardar) throw this.errorAlGuardar;
    this.avisos.set(g.aviso.alertaId, structuredClone(g));
  }
}

/**
 * En PostgreSQL. Los avisos los crea el sistema cuando el RT registra una falla crítica, y los cambia la Secretaría al aprobarlos o el
 * proveedor al informar un fallo: se accede con el alcance de un Administrador, y la tabla sólo tiene política para la Secretaría y el
 * Administrador, como la bandeja que los muestra.
 */
@Injectable()
export class PgAvisosRepository extends AvisosRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  private comoSistema<T>(trabajo: () => Promise<T>): Promise<T> {
    return runWithRlsContext({ eca: null, rol: 'administrador', usuario: 'sistema', esExplicito: true }, trabajo);
  }

  async leer(): Promise<AvisoGuardado[]> {
    const filas = await this.comoSistema(() =>
      this.db.query<{ aviso: AvisoFalla; vista: VistaInformeAviso; token: string | null; emitido_en: Date | null }>(
        'SELECT aviso, vista, token, emitido_en FROM avisos_falla ORDER BY creado_en, alerta_id',
      ),
    );
    return filas.map((f) => ({
      aviso: f.aviso,
      vista: f.vista,
      ...(f.token ? { token: f.token } : {}),
      ...(f.emitido_en ? { emitidoEn: f.emitido_en.getTime() } : {}),
    }));
  }

  async guardar(g: AvisoGuardado): Promise<void> {
    await this.comoSistema(() =>
      this.db.query(
        `INSERT INTO avisos_falla (alerta_id, aviso_id, estado, aviso, vista, token, emitido_en, creado_en)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)
         ON CONFLICT (alerta_id) DO UPDATE SET estado = EXCLUDED.estado, aviso = EXCLUDED.aviso, vista = EXCLUDED.vista,
           token = EXCLUDED.token, emitido_en = EXCLUDED.emitido_en, actualizado_en = now()`,
        [
          g.aviso.alertaId,
          g.aviso.id,
          g.aviso.estado,
          JSON.stringify(g.aviso),
          JSON.stringify(g.vista),
          g.token ?? null,
          g.emitidoEn !== undefined ? new Date(g.emitidoEn).toISOString() : null,
          g.aviso.creadoEn,
        ],
      ),
    );
  }
}

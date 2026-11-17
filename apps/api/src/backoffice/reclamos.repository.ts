import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ReclamoAdmin } from './backoffice.types';

export type NuevoReclamo = Omit<ReclamoAdmin, 'id' | 'reclamadoEn'>;

export abstract class ReclamosRepository {
  abstract listar(): Promise<ReclamoAdmin[]>;
  /** Guarda el reclamo; `null` si esa visita ya tenía uno (un reclamo por visita). */
  abstract guardar(nuevo: NuevoReclamo): Promise<ReclamoAdmin | null>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryReclamosRepository extends ReclamosRepository {
  readonly reclamos: ReclamoAdmin[] = [];

  async listar() {
    return structuredClone(this.reclamos);
  }

  async guardar(n: NuevoReclamo) {
    if (this.reclamos.some((r) => r.visitaId === n.visitaId)) return null;
    const r: ReclamoAdmin = { ...n, id: randomUUID(), reclamadoEn: new Date().toISOString() };
    this.reclamos.push(r);
    return structuredClone(r);
  }
}

interface Fila {
  id: string;
  maquina_id: string;
  visita_id: string;
  administracion: string;
  direccion: string;
  reclamado_por: string;
  reclamado_en: Date | string;
}
const COLUMNAS = 'id::text AS id, maquina_id, visita_id, administracion, direccion, reclamado_por, reclamado_en';
const aReclamo = (f: Fila): ReclamoAdmin => ({
  id: f.id, maquinaId: f.maquina_id, visitaId: f.visita_id, administracion: f.administracion, direccion: f.direccion, reclamadoPor: f.reclamado_por, reclamadoEn: new Date(f.reclamado_en).toISOString(),
});

@Injectable()
export class PgReclamosRepository extends ReclamosRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async listar() {
    return (await this.db.query<Fila>(`SELECT ${COLUMNAS} FROM reclamos_admin ORDER BY reclamado_en, id`)).map(aReclamo);
  }

  async guardar(n: NuevoReclamo) {
    const filas = await this.db.query<Fila>(
      `INSERT INTO reclamos_admin (maquina_id, visita_id, administracion, direccion, reclamado_por) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (visita_id) DO NOTHING RETURNING ${COLUMNAS}`,
      [n.maquinaId, n.visitaId, n.administracion, n.direccion, n.reclamadoPor],
    );
    return filas[0] ? aReclamo(filas[0]) : null;
  }
}

import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RemitoEca } from './backoffice.types';

export type NuevoRemito = Omit<RemitoEca, 'id' | 'enviadoEn'>;

export abstract class RemitosRepository {
  abstract listar(): Promise<RemitoEca[]>;
  /** Guarda el remito; `null` si esa visita ya tenía uno (un remito por visita). */
  abstract guardar(nuevo: NuevoRemito): Promise<RemitoEca | null>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryRemitosRepository extends RemitosRepository {
  readonly remitos: RemitoEca[] = [];

  async listar() {
    return structuredClone(this.remitos);
  }

  async guardar(n: NuevoRemito) {
    if (this.remitos.some((r) => r.visitaId === n.visitaId)) return null;
    const r: RemitoEca = { ...n, id: randomUUID(), enviadoEn: new Date().toISOString() };
    this.remitos.push(r);
    return structuredClone(r);
  }
}

interface Fila {
  id: string;
  maquina_id: string;
  visita_id: string;
  eca: string;
  direccion: string;
  enviado_por: string;
  enviado_en: Date | string;
}
const COLUMNAS = 'id::text AS id, maquina_id, visita_id, eca, direccion, enviado_por, enviado_en';
const aRemito = (f: Fila): RemitoEca => ({
  id: f.id, maquinaId: f.maquina_id, visitaId: f.visita_id, eca: f.eca, direccion: f.direccion, enviadoPor: f.enviado_por, enviadoEn: new Date(f.enviado_en).toISOString(),
});

@Injectable()
export class PgRemitosRepository extends RemitosRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async listar() {
    return (await this.db.query<Fila>(`SELECT ${COLUMNAS} FROM remitos_eca ORDER BY enviado_en, id`)).map(aRemito);
  }

  async guardar(n: NuevoRemito) {
    const filas = await this.db.query<Fila>(
      `INSERT INTO remitos_eca (maquina_id, visita_id, eca, direccion, enviado_por) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (visita_id) DO NOTHING RETURNING ${COLUMNAS}`,
      [n.maquinaId, n.visitaId, n.eca, n.direccion, n.enviadoPor],
    );
    return filas[0] ? aRemito(filas[0]) : null;
  }
}

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { HorariosGuardados, HorariosRepository } from './horarios.repository';
import { FranjasPorDia, HorariosNuevos } from './horarios.types';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Fila {
  a_coordinar: boolean;
  franjas: FranjasPorDia;
  actualizado_en: Date | string;
  actualizado_por: string;
}

const aGuardados = (f: Fila): HorariosGuardados => ({
  aCoordinar: f.a_coordinar,
  franjas: f.franjas ?? {},
  actualizadoEn: new Date(f.actualizado_en).toISOString(),
  actualizadoPor: f.actualizado_por,
});

@Injectable()
export class PgHorariosRepository extends HorariosRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async obtener(consorcioId: string) {
    if (!ES_UUID.test(consorcioId)) return null;
    const existe = await this.db.query('SELECT 1 FROM consorcios WHERE id = $1', [consorcioId]);
    if (existe.length === 0) return null;
    const filas = await this.db.query<Fila>('SELECT a_coordinar, franjas, actualizado_en, actualizado_por FROM horarios_edificio WHERE consorcio_id = $1', [consorcioId]);
    return { horarios: filas[0] ? aGuardados(filas[0]) : null };
  }

  async guardar(consorcioId: string, nuevos: HorariosNuevos, usuario: string) {
    if (!ES_UUID.test(consorcioId)) return null;
    const existe = await this.db.query('SELECT 1 FROM consorcios WHERE id = $1', [consorcioId]);
    if (existe.length === 0) return null;
    const filas = await this.db.query<Fila>(
      `INSERT INTO horarios_edificio (consorcio_id, a_coordinar, franjas, actualizado_por)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (consorcio_id) DO UPDATE
         SET a_coordinar = EXCLUDED.a_coordinar, franjas = EXCLUDED.franjas, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()
       RETURNING a_coordinar, franjas, actualizado_en, actualizado_por`,
      [consorcioId, nuevos.aCoordinar, JSON.stringify(nuevos.franjas), usuario],
    );
    return aGuardados(filas[0]);
  }
}

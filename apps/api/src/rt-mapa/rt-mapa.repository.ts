import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DatosEdificioRt } from './rt-mapa.types';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export abstract class RtMapaRepository {
  /** Ubicación y avance del día de cada edificio pedido (los que no existen no figuran). */
  abstract datos(consorcioIds: string[]): Promise<Map<string, DatosEdificioRt>>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryRtMapaRepository extends RtMapaRepository {
  readonly edificios = new Map<string, DatosEdificioRt>();

  async datos(consorcioIds: string[]) {
    const r = new Map<string, DatosEdificioRt>();
    for (const id of consorcioIds) {
      const d = this.edificios.get(id);
      if (d) r.set(id, structuredClone(d));
    }
    return r;
  }
}

interface Fila {
  id: string;
  lat: number | null;
  lng: number | null;
  maquinas: string;
  inspeccionadas: string;
}

@Injectable()
export class PgRtMapaRepository extends RtMapaRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async datos(consorcioIds: string[]) {
    const ids = consorcioIds.filter((id) => ES_UUID.test(id));
    const r = new Map<string, DatosEdificioRt>();
    if (ids.length === 0) return r;
    const filas = await this.db.query<Fila>(
      `SELECT c.id::text AS id,
              ST_Y(c.ubicacion::geometry) AS lat,
              ST_X(c.ubicacion::geometry) AS lng,
              (SELECT count(*) FROM maquinas m WHERE m.consorcio_id = c.id)::text AS maquinas,
              (SELECT count(DISTINCT i.maquina_id) FROM inspecciones_checklist i
                WHERE i.consorcio_id = c.id::text
                  AND (i.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)::text AS inspeccionadas
         FROM consorcios c
        WHERE c.id = ANY($1::uuid[])`,
      [ids],
    );
    for (const f of filas) {
      r.set(f.id, {
        ubicacion: f.lat === null || f.lng === null ? null : { latitud: Number(f.lat), longitud: Number(f.lng) },
        maquinas: Number(f.maquinas),
        inspeccionadasHoy: Number(f.inspeccionadas),
      });
    }
    return r;
  }
}

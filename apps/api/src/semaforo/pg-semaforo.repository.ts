import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SemaforoRepository } from './semaforo.repository';
import { ZONA_HORARIA } from './semaforo.logic';
import { EdificioBase, FechaCalendario } from './semaforo.types';

interface FilaSemaforo {
  id: string;
  nombre: string;
  direccion: string;
  maquinas: number;
  maquinas_inspeccionadas: number;
  ultima_inspeccion: Date | null;
  rt_calle_nombre: string | null;
  rt_calle_telefono: string | null;
  rt_calle_email: string | null;
}

/**
 * Sólo cuentan las inspecciones de máquinas que existen en el edificio (se cruzan con `maquinas`), dentro de la
 * ventana [día 1 del mes 00:00, final de la fecha consultada] en hora de Buenos Aires. Los límites se arman con
 * `make_timestamp(...) AT TIME ZONE`, así el día 31 a las 23:59 local queda adentro y el 1.º del mes siguiente, afuera.
 *
 * `consorcios` y `maquinas` tienen RLS por ECA: sólo se ven (y se cuentan) los edificios de la ECA de la petición.
 */
const SQL_SEMAFORO = `
  WITH ventana AS (
    SELECT make_timestamp($1::int, $2::int, 1, 0, 0, 0) AT TIME ZONE $4::text AS desde,
           (make_timestamp($1::int, $2::int, $3::int, 0, 0, 0) + interval '1 day') AT TIME ZONE $4::text AS hasta
  ),
  insp AS (
    SELECT m.consorcio_id, m.id AS maquina_id, i.created_at
      FROM inspecciones_checklist i
      JOIN maquinas m ON m.id::text = i.maquina_id AND m.consorcio_id::text = i.consorcio_id
      JOIN ventana v ON i.created_at >= v.desde AND i.created_at < v.hasta
  )
  SELECT c.id::text AS id, c.nombre, c.direccion,
         (SELECT count(*) FROM maquinas m WHERE m.consorcio_id = c.id)::int AS maquinas,
         (SELECT count(DISTINCT maquina_id) FROM insp WHERE insp.consorcio_id = c.id)::int AS maquinas_inspeccionadas,
         (SELECT max(created_at) FROM insp WHERE insp.consorcio_id = c.id) AS ultima_inspeccion,
         r.rt_calle_nombre, r.rt_calle_telefono, r.rt_calle_email
    FROM consorcios c
    LEFT JOIN roles_edificio r ON r.consorcio_id = c.id
   ORDER BY c.nombre, c.id
`;

@Injectable()
export class PgSemaforoRepository extends SemaforoRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async leerEdificios(fecha: FechaCalendario): Promise<EdificioBase[]> {
    const filas = await this.db.query<FilaSemaforo>(SQL_SEMAFORO, [fecha.anio, fecha.mes, fecha.dia, ZONA_HORARIA]);
    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      direccion: f.direccion,
      maquinas: f.maquinas,
      maquinasInspeccionadas: f.maquinas_inspeccionadas,
      ultimaInspeccion: f.ultima_inspeccion ? f.ultima_inspeccion.toISOString() : null,
      rtCalle: f.rt_calle_nombre
        ? { nombre: f.rt_calle_nombre, telefono: f.rt_calle_telefono, email: f.rt_calle_email }
        : null,
    }));
  }
}

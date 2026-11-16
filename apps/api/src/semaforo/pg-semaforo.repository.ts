import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ReasignacionPedida,
  RegistroReasignacion,
  ResultadoReasignacion,
  RtDisponible,
} from './reasignacion.types';
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

interface FilaReasignacion {
  id: string;
  consorcio_id: string;
  rt_anterior: string;
  rt_nuevo: string;
  usuario: string;
  fecha: Date;
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

const aRegistro = (f: FilaReasignacion): RegistroReasignacion => ({
  id: f.id,
  consorcioId: f.consorcio_id,
  rtAnterior: f.rt_anterior,
  rtNuevo: f.rt_nuevo,
  usuario: f.usuario,
  fecha: f.fecha.toISOString(),
});

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

  async listarRtDisponibles(): Promise<RtDisponible[]> {
    return this.db.query<RtDisponible>(
      `SELECT usuario, nombre FROM usuarios WHERE rol = 'rt_calle' AND activo ORDER BY usuario`,
    );
  }

  /**
   * Cambia el RT y escribe el registro en la misma transacción. El RT nuevo queda identificado por su nombre de
   * usuario, que es lo que el RLS compara: el anterior pierde el acceso al edificio y el nuevo lo gana en el acto.
   * La terna se completa con el teléfono y el email del usuario del RT nuevo (HU-02 RF-05): nunca se queda con los del
   * anterior ni sin contacto. Si el RT nuevo no tiene ni teléfono ni email cargados no se aplica nada (`sin_contacto`).
   */
  async reasignarRt(pedida: ReasignacionPedida): Promise<ResultadoReasignacion> {
    return this.db.transaction(async (client) => {
      // FOR UPDATE: dos reasignaciones simultáneas del mismo edificio se ordenan, y la segunda ve el RT ya cambiado.
      const actual = await client.query<{ rt_calle_nombre: string }>(
        'SELECT rt_calle_nombre FROM roles_edificio WHERE consorcio_id = $1 FOR UPDATE',
        [pedida.consorcioId],
      );
      if (actual.rowCount === 0) return { ok: false, motivo: 'sin_terna' } as const;
      if (actual.rows[0].rt_calle_nombre !== pedida.rtAnterior) return { ok: false, motivo: 'rt_cambio' } as const;

      const contacto = await client.query<{ telefono: string | null; email: string | null }>(
        `SELECT telefono, email FROM usuarios WHERE rol = 'rt_calle' AND activo AND usuario = $1`,
        [pedida.rtNuevo],
      );
      const nuevo = contacto.rows[0];
      if (!nuevo || (!nuevo.telefono && !nuevo.email)) return { ok: false, motivo: 'sin_contacto' } as const;

      await client.query(
        `UPDATE roles_edificio
            SET rt_calle_nombre = $2, rt_calle_telefono = $3, rt_calle_email = $4, updated_at = now()
          WHERE consorcio_id = $1`,
        [pedida.consorcioId, pedida.rtNuevo, nuevo.telefono, nuevo.email],
      );
      const registro = await client.query<FilaReasignacion>(
        `INSERT INTO reasignaciones_rt (consorcio_id, rt_anterior, rt_nuevo, usuario)
         VALUES ($1, $2, $3, $4)
         RETURNING id, consorcio_id::text AS consorcio_id, rt_anterior, rt_nuevo, usuario, fecha`,
        [pedida.consorcioId, pedida.rtAnterior, pedida.rtNuevo, pedida.usuario],
      );
      return { ok: true, registro: aRegistro(registro.rows[0]) } as const;
    });
  }

  async listarReasignaciones(consorcioId: string): Promise<RegistroReasignacion[]> {
    const filas = await this.db.query<FilaReasignacion>(
      `SELECT id, consorcio_id::text AS consorcio_id, rt_anterior, rt_nuevo, usuario, fecha
         FROM reasignaciones_rt WHERE consorcio_id = $1 ORDER BY fecha DESC, id`,
      [consorcioId],
    );
    return filas.map(aRegistro);
  }
}

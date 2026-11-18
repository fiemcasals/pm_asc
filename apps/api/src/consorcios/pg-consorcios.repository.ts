import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { Consorcio, ConsorcioInput, ConsorcioMapaItem, ConsorcioResumen, Maquina, TipoMaquina } from './consorcio.types';
import { ConsorciosRepository, ReferenciaAgcDuplicadaError, TernaCambioError } from './consorcios.repository';
import { DetalleImportacionAgc, FilaAgcValidada, ResultadoPersistenciaAgc } from './importador-agc.types';
import { PORCENTAJES_OPERATIVOS, Responsable, RolesEdificio, RolesInput } from './roles.types';

interface ConsorcioRow {
  id: string;
  nombre: string;
  direccion: string;
  administracion_nombre: string | null;
  administracion_telefono: string | null;
  administracion_email: string | null;
  encargado_nombre: string | null;
  encargado_telefono: string | null;
  pisos: unknown;
  latitud: number | null;
  longitud: number | null;
  created_at: Date;
  updated_at: Date;
}

interface MaquinaRow {
  id: string;
  referencia_agc: string;
  descripcion: string | null;
  tipo: TipoMaquina;
  sala_compartida_id: string | null;
  estado_agc: string | null;
}

interface RolesRow {
  rt_calle_nombre: string;
  rt_calle_telefono: string | null;
  rt_calle_email: string | null;
  firmante_nombre: string;
  firmante_telefono: string | null;
  firmante_email: string | null;
  eca_nombre: string;
  eca_telefono: string | null;
  eca_email: string | null;
  updated_at: Date;
}

const UNIQUE_VIOLATION = '23505';

/** Orden natural de M1, M2, ..., M10: por largo y después alfabético. */
const ORDEN_MAQUINAS = 'ORDER BY length(referencia_agc), referencia_agc';

function parsearPisos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : [];
}

function aConsorcio(fila: ConsorcioRow, maquinas: MaquinaRow[]): Consorcio {
  const ubicacion =
    typeof fila.latitud === 'number' && typeof fila.longitud === 'number'
      ? { latitud: fila.latitud, longitud: fila.longitud }
      : null;

  return {
    id: fila.id,
    nombre: fila.nombre,
    direccion: fila.direccion,
    administracion: {
      nombre: fila.administracion_nombre,
      telefono: fila.administracion_telefono,
      email: fila.administracion_email,
    },
    encargado: {
      nombre: fila.encargado_nombre,
      telefono: fila.encargado_telefono,
    },
    pisos: parsearPisos(fila.pisos),
    ubicacion,
    maquinas: maquinas.map(
      (m): Maquina => ({
        id: m.id,
        referenciaAgc: m.referencia_agc,
        descripcion: m.descripcion,
        tipo: m.tipo,
        salaCompartidaId: m.sala_compartida_id,
        estadoAgc: m.estado_agc ?? null,
      }),
    ),
    createdAt: fila.created_at.toISOString(),
    updatedAt: fila.updated_at.toISOString(),
  };
}

async function insertarMaquinas(client: PoolClient, consorcioId: string, datos: ConsorcioInput) {
  for (const m of datos.maquinas) {
    await client.query(
      'INSERT INTO maquinas (consorcio_id, referencia_agc, descripcion, tipo, sala_compartida_id, estado_agc) VALUES ($1, $2, $3, $4, $5, $6)',
      [consorcioId, m.referenciaAgc, m.descripcion, m.tipo, m.salaCompartidaId, m.estadoAgc ?? null],
    );
  }
}

async function leerFicha(client: PoolClient, id: string): Promise<Consorcio | null> {
  const consorcio = await client.query<ConsorcioRow>(
    `SELECT c.*,
            ST_Y(c.ubicacion) AS latitud,
            ST_X(c.ubicacion) AS longitud
       FROM consorcios c
      WHERE c.id = $1`,
    [id],
  );
  if (consorcio.rowCount === 0) return null;
  const maquinas = await client.query<MaquinaRow>(
    `SELECT id, referencia_agc, descripcion, tipo, sala_compartida_id, estado_agc
       FROM maquinas
      WHERE consorcio_id = $1 ${ORDEN_MAQUINAS}`,
    [id],
  );
  return aConsorcio(consorcio.rows[0], maquinas.rows);
}

function aResponsable(
  nombre: string,
  telefono: string | null,
  email: string | null,
  porcentaje: number | null,
): Responsable {
  return { nombre, telefono, email, porcentaje };
}

/** La terna de un edificio a partir de su fila de `roles_edificio`; sin fila, los roles vienen en `null`. */
function aRolesEdificio(id: string, f: RolesRow | undefined): RolesEdificio {
  if (!f) return { consorcioId: id, rtCalle: null, firmante: null, eca: null, actualizadoEn: null };
  return {
    consorcioId: id,
    rtCalle: aResponsable(f.rt_calle_nombre, f.rt_calle_telefono, f.rt_calle_email, PORCENTAJES_OPERATIVOS.rtCalle),
    firmante: aResponsable(f.firmante_nombre, f.firmante_telefono, f.firmante_email, PORCENTAJES_OPERATIVOS.firmante),
    eca: aResponsable(f.eca_nombre, f.eca_telefono, f.eca_email, PORCENTAJES_OPERATIVOS.eca),
    actualizadoEn: f.updated_at.toISOString(),
  };
}

async function leerRoles(client: PoolClient, id: string): Promise<RolesEdificio | null> {
  const consorcio = await client.query('SELECT 1 FROM consorcios WHERE id = $1', [id]);
  if (consorcio.rowCount === 0) return null;

  const roles = await client.query<RolesRow>('SELECT * FROM roles_edificio WHERE consorcio_id = $1', [id]);
  return aRolesEdificio(id, roles.rows[0]);
}

function traducirError(err: unknown): never {
  if ((err as { code?: string })?.code === UNIQUE_VIOLATION) throw new ReferenciaAgcDuplicadaError();
  throw err;
}

@Injectable()
export class PgConsorciosRepository extends ConsorciosRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async crear(datos: ConsorcioInput): Promise<Consorcio> {
    try {
      return await this.db.transaction(async (client) => {
        const res = await client.query<{ id: string }>(
          `INSERT INTO consorcios (
             nombre, direccion, administracion_nombre, administracion_telefono, administracion_email,
             encargado_nombre, encargado_telefono, pisos, ubicacion
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8::jsonb,
             CASE WHEN $9::double precision IS NOT NULL AND $10::double precision IS NOT NULL
                  THEN ST_SetSRID(ST_MakePoint($10, $9), 4326)
                  ELSE NULL END
           ) RETURNING id`,
          [
            datos.nombre,
            datos.direccion,
            datos.administracion.nombre,
            datos.administracion.telefono,
            datos.administracion.email,
            datos.encargado.nombre,
            datos.encargado.telefono,
            JSON.stringify(datos.pisos),
            datos.ubicacion?.latitud ?? null,
            datos.ubicacion?.longitud ?? null,
          ],
        );
        const id = res.rows[0].id;
        await insertarMaquinas(client, id, datos);
        return (await leerFicha(client, id)) as Consorcio;
      });
    } catch (err) {
      return traducirError(err);
    }
  }

  async listar(): Promise<ConsorcioResumen[]> {
    const filas = await this.db.query<{ id: string; nombre: string; direccion: string; cantidad: string }>(
      `SELECT c.id, c.nombre, c.direccion, count(m.id) AS cantidad
         FROM consorcios c LEFT JOIN maquinas m ON m.consorcio_id = c.id
        GROUP BY c.id ORDER BY c.nombre, c.created_at`,
    );
    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      direccion: f.direccion,
      cantidadMaquinas: Number(f.cantidad),
    }));
  }

  async listarParaMapa(): Promise<ConsorcioMapaItem[]> {
    const filas = await this.db.query<{
      id: string;
      nombre: string;
      direccion: string;
      latitud: number;
      longitud: number;
      cantidad: string;
    }>(
      `SELECT c.id, c.nombre, c.direccion,
              ST_Y(c.ubicacion) AS latitud,
              ST_X(c.ubicacion) AS longitud,
              count(m.id) AS cantidad
         FROM consorcios c LEFT JOIN maquinas m ON m.consorcio_id = c.id
        WHERE c.ubicacion IS NOT NULL
        GROUP BY c.id
        ORDER BY c.nombre, c.created_at`,
    );
    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      direccion: f.direccion,
      ubicacion: { latitud: f.latitud, longitud: f.longitud },
      cantidadMaquinas: Number(f.cantidad),
    }));
  }

  async obtener(id: string): Promise<Consorcio | null> {
    return this.db.transaction((client) => leerFicha(client, id));
  }

  async reemplazar(id: string, datos: ConsorcioInput): Promise<Consorcio | null> {
    try {
      return await this.db.transaction(async (client) => {
        const res = await client.query(
          `UPDATE consorcios
              SET nombre = $2, direccion = $3, administracion_nombre = $4,
                  administracion_telefono = $5, administracion_email = $6,
                  encargado_nombre = $7, encargado_telefono = $8, pisos = $9::jsonb,
                  ubicacion = CASE WHEN $10::double precision IS NOT NULL AND $11::double precision IS NOT NULL
                                   THEN ST_SetSRID(ST_MakePoint($11, $10), 4326)
                                   ELSE NULL END,
                  updated_at = now()
            WHERE id = $1`,
          [
            id,
            datos.nombre,
            datos.direccion,
            datos.administracion.nombre,
            datos.administracion.telefono,
            datos.administracion.email,
            datos.encargado.nombre,
            datos.encargado.telefono,
            JSON.stringify(datos.pisos),
            datos.ubicacion?.latitud ?? null,
            datos.ubicacion?.longitud ?? null,
          ],
        );
        if (res.rowCount === 0) return null;
        await client.query('DELETE FROM maquinas WHERE consorcio_id = $1', [id]);
        await insertarMaquinas(client, id, datos);
        return leerFicha(client, id);
      });
    } catch (err) {
      return traducirError(err);
    }
  }

  async eliminar(id: string): Promise<boolean> {
    const filas = await this.db.query('DELETE FROM consorcios WHERE id = $1 RETURNING id', [id]);
    return filas.length > 0;
  }

  /** Las ternas de todos los edificios en una sola consulta, en el orden de la lista de consorcios (nombre, id). */
  async listarRoles(): Promise<RolesEdificio[]> {
    const filas = await this.db.query<RolesRow & { consorcio_id: string }>(
      `SELECT c.id::text AS consorcio_id, r.rt_calle_nombre, r.rt_calle_telefono, r.rt_calle_email,
              r.firmante_nombre, r.firmante_telefono, r.firmante_email,
              r.eca_nombre, r.eca_telefono, r.eca_email, r.updated_at
         FROM consorcios c
         LEFT JOIN roles_edificio r ON r.consorcio_id = c.id
        ORDER BY c.nombre, c.id`,
    );
    return filas.map((f) => aRolesEdificio(f.consorcio_id, f.updated_at ? f : undefined));
  }

  async obtenerRoles(id: string): Promise<RolesEdificio | null> {
    return this.db.transaction((client) => leerRoles(client, id));
  }

  async asignarRoles(id: string, datos: RolesInput, esperado?: string | null): Promise<RolesEdificio | null> {
    return this.db.transaction(async (client) => {
      // El bloqueo evita que el consorcio se borre entre esta comprobación y el INSERT.
      const consorcio = await client.query('SELECT 1 FROM consorcios WHERE id = $1 FOR UPDATE', [id]);
      if (consorcio.rowCount === 0) return null;

      // Con el consorcio bloqueado, nadie más puede cambiar la terna entre esta comprobación y el guardado. La versión se
      // compara en la base y a la milésima, que es la precisión con la que se informa (`actualizadoEn`).
      if (esperado !== undefined) {
        const actual = await client.query<{ coincide: boolean }>(
          `SELECT date_trunc('milliseconds', updated_at) = $2::timestamptz AS coincide FROM roles_edificio WHERE consorcio_id = $1`,
          [id, esperado],
        );
        const coincide = esperado === null ? actual.rowCount === 0 : actual.rowCount === 1 && actual.rows[0].coincide;
        if (!coincide) throw new TernaCambioError((await leerRoles(client, id))!);
      }

      const { rtCalle, firmante, eca } = datos;
      await client.query(
        `INSERT INTO roles_edificio (
           consorcio_id, rt_calle_nombre, rt_calle_telefono, rt_calle_email,
           firmante_nombre, firmante_telefono, firmante_email,
           eca_nombre, eca_telefono, eca_email
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (consorcio_id) DO UPDATE SET
           rt_calle_nombre = EXCLUDED.rt_calle_nombre,
           rt_calle_telefono = EXCLUDED.rt_calle_telefono,
           rt_calle_email = EXCLUDED.rt_calle_email,
           firmante_nombre = EXCLUDED.firmante_nombre,
           firmante_telefono = EXCLUDED.firmante_telefono,
           firmante_email = EXCLUDED.firmante_email,
           eca_nombre = EXCLUDED.eca_nombre,
           eca_telefono = EXCLUDED.eca_telefono,
           eca_email = EXCLUDED.eca_email,
           updated_at = now()`,
        [
          id,
          rtCalle.nombre, rtCalle.telefono, rtCalle.email,
          firmante.nombre, firmante.telefono, firmante.email,
          eca.nombre, eca.telefono, eca.email,
        ],
      );
      if (eca?.nombre) {
        await client.query('UPDATE consorcios SET eca_nombre = $1 WHERE id = $2', [eca.nombre, id]);
      }
      return leerRoles(client, id);
    });
  }

  async quitarRoles(id: string): Promise<boolean> {
    const filas = await this.db.query('DELETE FROM roles_edificio WHERE consorcio_id = $1 RETURNING consorcio_id', [id]);
    return filas.length > 0;
  }

  async importarMaquinasAgc(filas: FilaAgcValidada[]): Promise<ResultadoPersistenciaAgc> {
    return this.db.transaction(async (client) => {
      let creadas = 0;
      let actualizadas = 0;
      let consorciosCreados = 0;
      const detalle: DetalleImportacionAgc[] = [];

      for (const fila of filas) {
        // 1. Buscar consorcio por dirección normalizada (o crearlo si aún no existe).
        const consorcioExistente = await client.query<{ id: string }>(
          `SELECT id
             FROM consorcios
            WHERE lower(trim(direccion)) = lower(trim($1))
            ORDER BY created_at ASC
            LIMIT 1`,
          [fila.direccion],
        );

        let consorcioId: string;
        if (consorcioExistente.rowCount && consorcioExistente.rows[0]) {
          consorcioId = consorcioExistente.rows[0].id;
          if (fila.ubicacion) {
            await client.query(
              `UPDATE consorcios
                  SET ubicacion = COALESCE(ubicacion, ST_SetSRID(ST_MakePoint($2, $3), 4326)),
                      updated_at = now()
                WHERE id = $1`,
              [consorcioId, fila.ubicacion.longitud, fila.ubicacion.latitud],
            );
          }
        } else {
          const creado = await client.query<{ id: string }>(
            `INSERT INTO consorcios (nombre, direccion, pisos, ubicacion)
             VALUES (
               $1, $2, '[]'::jsonb,
               CASE WHEN $3::double precision IS NOT NULL AND $4::double precision IS NOT NULL
                    THEN ST_SetSRID(ST_MakePoint($4, $3), 4326)
                    ELSE NULL END
             )
             RETURNING id`,
            [
              fila.nombreEdificio,
              fila.direccion,
              fila.ubicacion?.latitud ?? null,
              fila.ubicacion?.longitud ?? null,
            ],
          );
          consorcioId = creado.rows[0].id;
          consorciosCreados += 1;
        }

        // 2. Identificar máquina existente por matrícula AGC (primero dentro del mismo consorcio,
        //    y si no, coincidencia global única para actualizar sin duplicar).
        let maquinaExistente = await client.query<{ id: string; consorcio_id: string }>(
          `SELECT id, consorcio_id
             FROM maquinas
            WHERE consorcio_id = $1
              AND lower(trim(referencia_agc)) = lower(trim($2))
            LIMIT 1`,
          [consorcioId, fila.matriculaAgc],
        );

        if (maquinaExistente.rowCount === 0) {
          const globales = await client.query<{ id: string; consorcio_id: string }>(
            `SELECT id, consorcio_id
               FROM maquinas
              WHERE lower(trim(referencia_agc)) = lower(trim($1))
              ORDER BY created_at ASC`,
            [fila.matriculaAgc],
          );
          if (globales.rowCount === 1) {
            maquinaExistente = globales;
          }
        }

        if (maquinaExistente.rowCount && maquinaExistente.rows[0]) {
          const existente = maquinaExistente.rows[0];
          await client.query(
            `UPDATE maquinas
                SET consorcio_id = $2,
                    referencia_agc = $3,
                    tipo = $4,
                    estado_agc = $5,
                    descripcion = COALESCE($6, descripcion)
              WHERE id = $1`,
            [existente.id, consorcioId, fila.matriculaAgc, fila.tipo, fila.estadoAgc, fila.descripcion],
          );
          actualizadas += 1;
          detalle.push({
            fila: fila.fila,
            accion: 'actualizada',
            matriculaAgc: fila.matriculaAgc,
            consorcioId,
            direccion: fila.direccion,
            tipo: fila.tipo,
            estadoAgc: fila.estadoAgc,
          });
        } else {
          await client.query(
            `INSERT INTO maquinas (consorcio_id, referencia_agc, descripcion, tipo, estado_agc)
             VALUES ($1, $2, $3, $4, $5)`,
            [consorcioId, fila.matriculaAgc, fila.descripcion, fila.tipo, fila.estadoAgc],
          );
          creadas += 1;
          detalle.push({
            fila: fila.fila,
            accion: 'creada',
            matriculaAgc: fila.matriculaAgc,
            consorcioId,
            direccion: fila.direccion,
            tipo: fila.tipo,
            estadoAgc: fila.estadoAgc,
          });
        }
      }

      return { creadas, actualizadas, consorciosCreados, detalle };
    });
  }
}

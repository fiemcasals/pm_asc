import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { Consorcio, ConsorcioInput, ConsorcioResumen, Maquina } from './consorcio.types';
import { ConsorciosRepository, ReferenciaAgcDuplicadaError } from './consorcios.repository';
import { PORCENTAJES_OPERATIVOS, Responsable, RolesEdificio, RolesInput } from './roles.types';

interface ConsorcioRow {
  id: string;
  nombre: string;
  direccion: string;
  administracion_nombre: string | null;
  administracion_telefono: string | null;
  administracion_email: string | null;
  created_at: Date;
  updated_at: Date;
}

interface MaquinaRow {
  id: string;
  referencia_agc: string;
  descripcion: string | null;
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

function aConsorcio(fila: ConsorcioRow, maquinas: MaquinaRow[]): Consorcio {
  return {
    id: fila.id,
    nombre: fila.nombre,
    direccion: fila.direccion,
    administracion: {
      nombre: fila.administracion_nombre,
      telefono: fila.administracion_telefono,
      email: fila.administracion_email,
    },
    maquinas: maquinas.map(
      (m): Maquina => ({ id: m.id, referenciaAgc: m.referencia_agc, descripcion: m.descripcion }),
    ),
    createdAt: fila.created_at.toISOString(),
    updatedAt: fila.updated_at.toISOString(),
  };
}

async function insertarMaquinas(client: PoolClient, consorcioId: string, datos: ConsorcioInput) {
  for (const m of datos.maquinas) {
    await client.query(
      'INSERT INTO maquinas (consorcio_id, referencia_agc, descripcion) VALUES ($1, $2, $3)',
      [consorcioId, m.referenciaAgc, m.descripcion],
    );
  }
}

async function leerFicha(client: PoolClient, id: string): Promise<Consorcio | null> {
  const consorcio = await client.query<ConsorcioRow>('SELECT * FROM consorcios WHERE id = $1', [id]);
  if (consorcio.rowCount === 0) return null;
  const maquinas = await client.query<MaquinaRow>(
    `SELECT id, referencia_agc, descripcion FROM maquinas WHERE consorcio_id = $1 ${ORDEN_MAQUINAS}`,
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

async function leerRoles(client: PoolClient, id: string): Promise<RolesEdificio | null> {
  const consorcio = await client.query('SELECT 1 FROM consorcios WHERE id = $1', [id]);
  if (consorcio.rowCount === 0) return null;

  const roles = await client.query<RolesRow>('SELECT * FROM roles_edificio WHERE consorcio_id = $1', [id]);
  if (roles.rowCount === 0) {
    return { consorcioId: id, rtCalle: null, firmante: null, eca: null, actualizadoEn: null };
  }
  const f = roles.rows[0];
  return {
    consorcioId: id,
    rtCalle: aResponsable(f.rt_calle_nombre, f.rt_calle_telefono, f.rt_calle_email, PORCENTAJES_OPERATIVOS.rtCalle),
    firmante: aResponsable(f.firmante_nombre, f.firmante_telefono, f.firmante_email, PORCENTAJES_OPERATIVOS.firmante),
    eca: aResponsable(f.eca_nombre, f.eca_telefono, f.eca_email, PORCENTAJES_OPERATIVOS.eca),
    actualizadoEn: f.updated_at.toISOString(),
  };
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
          `INSERT INTO consorcios (nombre, direccion, administracion_nombre, administracion_telefono, administracion_email)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [
            datos.nombre,
            datos.direccion,
            datos.administracion.nombre,
            datos.administracion.telefono,
            datos.administracion.email,
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

  async obtener(id: string): Promise<Consorcio | null> {
    return this.db.transaction((client) => leerFicha(client, id));
  }

  async reemplazar(id: string, datos: ConsorcioInput): Promise<Consorcio | null> {
    try {
      return await this.db.transaction(async (client) => {
        const res = await client.query(
          `UPDATE consorcios
              SET nombre = $2, direccion = $3, administracion_nombre = $4,
                  administracion_telefono = $5, administracion_email = $6, updated_at = now()
            WHERE id = $1`,
          [
            id,
            datos.nombre,
            datos.direccion,
            datos.administracion.nombre,
            datos.administracion.telefono,
            datos.administracion.email,
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

  async obtenerRoles(id: string): Promise<RolesEdificio | null> {
    return this.db.transaction((client) => leerRoles(client, id));
  }

  async asignarRoles(id: string, datos: RolesInput): Promise<RolesEdificio | null> {
    return this.db.transaction(async (client) => {
      // El bloqueo evita que el consorcio se borre entre esta comprobación y el INSERT.
      const consorcio = await client.query('SELECT 1 FROM consorcios WHERE id = $1 FOR UPDATE', [id]);
      if (consorcio.rowCount === 0) return null;

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
      return leerRoles(client, id);
    });
  }
}

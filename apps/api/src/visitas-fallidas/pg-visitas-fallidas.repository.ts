import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ConsorcioBasico,
  MaquinaBasica,
  VisitasFallidasRepository,
} from './visitas-fallidas.repository';
import { EmailNotificacionConsorcio, VisitaFallidaRegistro } from './visitas-fallidas.types';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface VisitaFallidaRow {
  id: string;
  consorcio_id: string;
  consorcio_nombre: string;
  direccion: string;
  numero_advertencia: number;
  motivo: string;
  foto_frente_url: string;
  gps_latitud: number;
  gps_longitud: number;
  gps_precision: number;
  gps_timestamp: Date | string;
  inspector: string;
  fecha_hora: Date | string;
  email_notificacion: EmailNotificacionConsorcio | string | null;
}

const COLUMNAS_VISITA = `
  id, consorcio_id, consorcio_nombre, direccion, numero_advertencia,
  motivo, foto_frente_url, gps_latitud, gps_longitud, gps_precision,
  gps_timestamp, inspector, fecha_hora, email_notificacion
`;

function aIso(valor: Date | string): string {
  return valor instanceof Date ? valor.toISOString() : new Date(valor).toISOString();
}

function aEmail(valor: VisitaFallidaRow['email_notificacion']): EmailNotificacionConsorcio | null {
  if (!valor) return null;
  if (typeof valor === 'string') return JSON.parse(valor) as EmailNotificacionConsorcio;
  return valor;
}

function aVisitaFallida(row: VisitaFallidaRow): VisitaFallidaRegistro {
  return {
    id: row.id,
    consorcioId: row.consorcio_id,
    consorcioNombre: row.consorcio_nombre,
    direccion: row.direccion,
    numeroAdvertencia: Number(row.numero_advertencia) as 1 | 2 | 3,
    motivo: row.motivo,
    fotoFrenteUrl: row.foto_frente_url,
    gps: {
      latitud: Number(row.gps_latitud),
      longitud: Number(row.gps_longitud),
      precision: Number(row.gps_precision),
      timestamp: aIso(row.gps_timestamp),
    },
    inspector: row.inspector,
    fechaHora: aIso(row.fecha_hora),
    emailNotificacion: aEmail(row.email_notificacion),
  };
}

@Injectable()
export class PgVisitasFallidasRepository extends VisitasFallidasRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async registrar(
    consorcioId: string,
    construirRegistro: (previasCount: number) => VisitaFallidaRegistro,
  ): Promise<VisitaFallidaRegistro> {
    return this.db.transaction(async (client) => {
      // Serializa los registros concurrentes del mismo consorcio para no repetir numero_advertencia.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [consorcioId]);

      const countRes = await client.query<{ total: string }>(
        'SELECT count(*) AS total FROM visitas_fallidas WHERE consorcio_id = $1',
        [consorcioId],
      );
      const previasCount = Number(countRes.rows[0].total);
      const registro = construirRegistro(previasCount);

      await client.query(
        `INSERT INTO visitas_fallidas (
           id, consorcio_id, consorcio_nombre, direccion, numero_advertencia,
           motivo, foto_frente_url, gps_latitud, gps_longitud, gps_precision,
           gps_timestamp, inspector, fecha_hora, email_notificacion
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          registro.id,
          registro.consorcioId,
          registro.consorcioNombre,
          registro.direccion,
          registro.numeroAdvertencia,
          registro.motivo,
          registro.fotoFrenteUrl,
          registro.gps.latitud,
          registro.gps.longitud,
          registro.gps.precision ?? 5.0,
          registro.gps.timestamp ?? registro.fechaHora,
          registro.inspector,
          registro.fechaHora,
          registro.emailNotificacion ? JSON.stringify(registro.emailNotificacion) : null,
        ],
      );

      return registro;
    });
  }

  async listarPorConsorcio(consorcioId: string): Promise<VisitaFallidaRegistro[]> {
    const filas = await this.db.query<VisitaFallidaRow>(
      `SELECT ${COLUMNAS_VISITA}
         FROM visitas_fallidas
        WHERE consorcio_id = $1
        ORDER BY orden ASC`,
      [consorcioId],
    );
    return filas.map(aVisitaFallida);
  }

  async listarTodas(): Promise<VisitaFallidaRegistro[]> {
    const filas = await this.db.query<VisitaFallidaRow>(
      `SELECT ${COLUMNAS_VISITA}
         FROM visitas_fallidas
        ORDER BY orden ASC`,
    );
    return filas.map(aVisitaFallida);
  }

  async buscarConsorcioInfo(consorcioId: string): Promise<ConsorcioBasico | null> {
    if (!ES_UUID.test(consorcioId)) return null;
    const rows = await this.db.query<{
      nombre: string;
      direccion: string;
      administracion_email: string | null;
    }>('SELECT nombre, direccion, administracion_email FROM consorcios WHERE id = $1', [consorcioId]);
    if (rows.length === 0) return null;
    return {
      nombre: rows[0].nombre,
      direccion: rows[0].direccion,
      email: rows[0].administracion_email,
    };
  }

  async listarMaquinasConsorcio(consorcioId: string): Promise<MaquinaBasica[]> {
    if (!ES_UUID.test(consorcioId)) return [];
    const rows = await this.db.query<{ id: string; referencia_agc: string }>(
      'SELECT id, referencia_agc FROM maquinas WHERE consorcio_id = $1 ORDER BY length(referencia_agc), referencia_agc',
      [consorcioId],
    );
    return rows.map((r) => ({ id: r.id, referenciaAgc: r.referencia_agc }));
  }
}

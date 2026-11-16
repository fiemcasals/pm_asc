import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ConsorcioBasico,
  MaquinaBasica,
  VisitasFallidasRepository,
} from './visitas-fallidas.repository';
import { AnulacionRecargo, DesbloqueoEdificio, EmailNotificacionConsorcio, VisitaFallidaRegistro } from './visitas-fallidas.types';
import { ZONA_HORARIA } from '../semaforo/semaforo.logic';

const UNIQUE_VIOLATION = '23505';
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
  hora_dispositivo: Date | string | null;
  email_notificacion: EmailNotificacionConsorcio | string | null;
}

const COLUMNAS_VISITA = `
  id, consorcio_id, consorcio_nombre, direccion, numero_advertencia,
  motivo, foto_frente_url, gps_latitud, gps_longitud, gps_precision,
  gps_timestamp, inspector, fecha_hora, hora_dispositivo, email_notificacion
`;

interface AnulacionRow {
  id: string;
  consorcio_id: string;
  maquina_id: string;
  visita_fallida_id: string;
  usuario: string;
  motivo: string;
  fecha: Date | string;
}

const aAnulacion = (r: AnulacionRow): AnulacionRecargo => ({
  id: r.id,
  consorcioId: r.consorcio_id,
  maquinaId: r.maquina_id,
  visitaFallidaId: r.visita_fallida_id,
  usuario: r.usuario,
  motivo: r.motivo,
  fecha: aIso(r.fecha),
});

interface DesbloqueoRow {
  id: string;
  consorcio_id: string;
  hasta_visita_id: string;
  usuario: string;
  motivo: string;
  fecha: Date | string;
}

const aDesbloqueo = (r: DesbloqueoRow): DesbloqueoEdificio => ({
  id: r.id,
  consorcioId: r.consorcio_id,
  hastaVisitaId: r.hasta_visita_id,
  usuario: r.usuario,
  motivo: r.motivo,
  fecha: aIso(r.fecha),
});

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
    horaDispositivo: row.hora_dispositivo ? aIso(row.hora_dispositivo) : null,
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
    construirRegistro: (previasCount: number, ultimaVisitaFallidaIso: string | null) => VisitaFallidaRegistro,
  ): Promise<VisitaFallidaRegistro> {
    return this.db.transaction(async (client) => {
      // Serializa los registros concurrentes del mismo consorcio para no repetir numero_advertencia.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [consorcioId]);

      // Las advertencias vigentes son las posteriores a la última inspección del edificio (su última visita exitosa).
      const countRes = await client.query<{ total: string; ultima: Date | null }>(
        `SELECT count(*) FILTER (
                  WHERE v.fecha_hora > COALESCE((SELECT max(i.created_at) FROM inspecciones_checklist i WHERE i.consorcio_id = $1), '-infinity')
                ) AS total,
                max(v.fecha_hora) AS ultima
           FROM visitas_fallidas v WHERE v.consorcio_id = $1`,
        [consorcioId],
      );
      const previasCount = Number(countRes.rows[0].total);
      const ultima = countRes.rows[0].ultima;
      const registro = construirRegistro(previasCount, ultima ? new Date(ultima).toISOString() : null);

      await client.query(
        `INSERT INTO visitas_fallidas (
           id, consorcio_id, consorcio_nombre, direccion, numero_advertencia,
           motivo, foto_frente_url, gps_latitud, gps_longitud, gps_precision,
           gps_timestamp, inspector, fecha_hora, email_notificacion, hora_dispositivo
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
          registro.horaDispositivo ?? null,
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

  async maquinasInspeccionadasEnMes(consorcioId: string, periodo: string): Promise<string[]> {
    const m = /^(\d{4})-(\d{2})$/.exec(periodo);
    if (!ES_UUID.test(consorcioId) || !m) return [];
    // El mes en hora de Buenos Aires: [día 1 00:00, día 1 del mes siguiente 00:00), igual que el semáforo.
    const filas = await this.db.query<{ maquina_id: string }>(
      `SELECT DISTINCT i.maquina_id
         FROM inspecciones_checklist i
        WHERE i.consorcio_id = $1
          AND i.created_at >= make_timestamp($2::int, $3::int, 1, 0, 0, 0) AT TIME ZONE $4::text
          AND i.created_at <  (make_timestamp($2::int, $3::int, 1, 0, 0, 0) + interval '1 month') AT TIME ZONE $4::text`,
      [consorcioId, Number(m[1]), Number(m[2]), ZONA_HORARIA],
    );
    return filas.map((f) => f.maquina_id);
  }

  async pagoDeMaquina(maquinaId: string) {
    if (!ES_UUID.test(maquinaId)) return null;
    const filas = await this.db.query<{ abono_mensual: string | null; porcentaje_rt: string; porcentaje_firmante: string }>(
      'SELECT abono_mensual::text AS abono_mensual, porcentaje_rt::text AS porcentaje_rt, porcentaje_firmante::text AS porcentaje_firmante FROM maquinas WHERE id = $1',
      [maquinaId],
    );
    return filas[0]
      ? { abonoMensual: filas[0].abono_mensual === null ? null : Number(filas[0].abono_mensual), porcentajeRt: Number(filas[0].porcentaje_rt), porcentajeFirmante: Number(filas[0].porcentaje_firmante) }
      : null;
  }

  async listarAnulaciones(consorcioId: string): Promise<AnulacionRecargo[]> {
    if (!ES_UUID.test(consorcioId)) return [];
    const filas = await this.db.query<AnulacionRow>(
      `SELECT id, consorcio_id::text AS consorcio_id, maquina_id, visita_fallida_id, usuario, motivo, fecha
         FROM recargos_anulados WHERE consorcio_id = $1 ORDER BY fecha, id`,
      [consorcioId],
    );
    return filas.map(aAnulacion);
  }

  async anularRecargo(datos: Omit<AnulacionRecargo, 'id' | 'fecha'>): Promise<AnulacionRecargo | null> {
    try {
      const filas = await this.db.query<AnulacionRow>(
        `INSERT INTO recargos_anulados (consorcio_id, maquina_id, visita_fallida_id, usuario, motivo)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, consorcio_id::text AS consorcio_id, maquina_id, visita_fallida_id, usuario, motivo, fecha`,
        [datos.consorcioId, datos.maquinaId, datos.visitaFallidaId, datos.usuario, datos.motivo],
      );
      return aAnulacion(filas[0]);
    } catch (err) {
      if ((err as { code?: string })?.code === UNIQUE_VIOLATION) return null; // ya estaba anulado
      throw err;
    }
  }

  async ultimaInspeccion(consorcioId: string): Promise<string | null> {
    const filas = await this.db.query<{ t: Date | null }>('SELECT max(created_at) AS t FROM inspecciones_checklist WHERE consorcio_id = $1', [consorcioId]);
    return filas[0]?.t ? new Date(filas[0].t).toISOString() : null;
  }

  async ultimasInspecciones(): Promise<Record<string, string>> {
    const filas = await this.db.query<{ consorcio_id: string; t: Date }>('SELECT consorcio_id, max(created_at) AS t FROM inspecciones_checklist GROUP BY consorcio_id');
    return Object.fromEntries(filas.map((f) => [f.consorcio_id, new Date(f.t).toISOString()]));
  }

  async listarDesbloqueos(consorcioId?: string): Promise<DesbloqueoEdificio[]> {
    const filas = await this.db.query<DesbloqueoRow>(
      `SELECT id, consorcio_id, hasta_visita_id, usuario, motivo, fecha FROM desbloqueos_edificio
        WHERE ($1::text IS NULL OR consorcio_id = $1) ORDER BY fecha, id`,
      [consorcioId ?? null],
    );
    return filas.map(aDesbloqueo);
  }

  async desbloquear(datos: Omit<DesbloqueoEdificio, 'id' | 'fecha'>): Promise<DesbloqueoEdificio | null> {
    try {
      const filas = await this.db.query<DesbloqueoRow>(
        `INSERT INTO desbloqueos_edificio (consorcio_id, hasta_visita_id, usuario, motivo) VALUES ($1, $2, $3, $4)
         RETURNING id, consorcio_id, hasta_visita_id, usuario, motivo, fecha`,
        [datos.consorcioId, datos.hastaVisitaId, datos.usuario, datos.motivo],
      );
      return aDesbloqueo(filas[0]);
    } catch (err) {
      if ((err as { code?: string })?.code === UNIQUE_VIOLATION) return null; // esa serie ya estaba desbloqueada
      throw err;
    }
  }

  async listarEdificiosVisibles(): Promise<{ id: string; nombre: string; direccion: string }[]> {
    return this.db.query<{ id: string; nombre: string; direccion: string }>('SELECT id::text AS id, nombre, direccion FROM consorcios ORDER BY nombre, id');
  }
}

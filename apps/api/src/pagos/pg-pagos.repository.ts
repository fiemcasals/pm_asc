import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PagosRepository } from './pagos.repository';
import { CambioPago, PagoMaquina, PagoNuevo } from './pagos.types';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FilaPago {
  id: string;
  consorcio_id: string;
  referencia_agc: string;
  abono_mensual: string | null;
  porcentaje_rt: string;
  porcentaje_firmante: string;
}

const aPago = (f: FilaPago): PagoMaquina => ({
  maquinaId: f.id,
  consorcioId: f.consorcio_id,
  referenciaAgc: f.referencia_agc,
  abonoMensual: f.abono_mensual === null ? null : Number(f.abono_mensual),
  porcentajeRt: Number(f.porcentaje_rt),
  porcentajeFirmante: Number(f.porcentaje_firmante),
});

interface FilaCambio {
  id: string;
  maquina_id: string;
  campo: CambioPago['campo'];
  valor_anterior: string | null;
  valor_nuevo: string | null;
  usuario: string;
  fecha: Date | string;
}

const aCambio = (f: FilaCambio): CambioPago => ({
  id: f.id,
  maquinaId: f.maquina_id,
  campo: f.campo,
  valorAnterior: f.valor_anterior,
  valorNuevo: f.valor_nuevo,
  usuario: f.usuario,
  fecha: new Date(f.fecha).toISOString(),
});

const COLUMNAS = 'id::text AS id, consorcio_id::text AS consorcio_id, referencia_agc, abono_mensual::text AS abono_mensual, porcentaje_rt::text AS porcentaje_rt, porcentaje_firmante::text AS porcentaje_firmante';

@Injectable()
export class PgPagosRepository extends PagosRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async obtener(consorcioId: string, maquinaId: string): Promise<PagoMaquina | null> {
    if (!ES_UUID.test(consorcioId) || !ES_UUID.test(maquinaId)) return null;
    const filas = await this.db.query<FilaPago>(`SELECT ${COLUMNAS} FROM maquinas WHERE id = $1 AND consorcio_id = $2`, [maquinaId, consorcioId]);
    return filas[0] ? aPago(filas[0]) : null;
  }

  async guardar(consorcioId: string, maquinaId: string, nuevo: PagoNuevo, usuario: string) {
    if (!ES_UUID.test(consorcioId) || !ES_UUID.test(maquinaId)) return null;
    return this.db.transaction(async (client) => {
      const previa = await client.query<FilaPago>(`SELECT ${COLUMNAS} FROM maquinas WHERE id = $1 AND consorcio_id = $2 FOR UPDATE`, [maquinaId, consorcioId]);
      if (previa.rowCount === 0) return null;
      const antes = aPago(previa.rows[0]);
      const despues: PagoMaquina = {
        ...antes,
        abonoMensual: nuevo.abonoMensual !== undefined ? nuevo.abonoMensual : antes.abonoMensual,
        porcentajeRt: nuevo.porcentajeRt ?? antes.porcentajeRt,
        porcentajeFirmante: nuevo.porcentajeFirmante ?? antes.porcentajeFirmante,
      };
      const cambios: CambioPago[] = [];
      const campos: [CambioPago['campo'], number | null, number | null][] = [
        ['abono_mensual', antes.abonoMensual, despues.abonoMensual],
        ['porcentaje_rt', antes.porcentajeRt, despues.porcentajeRt],
        ['porcentaje_firmante', antes.porcentajeFirmante, despues.porcentajeFirmante],
      ];
      for (const [campo, a, d] of campos) {
        if (a === d) continue;
        const fila = await client.query<FilaCambio>(
          `INSERT INTO maquinas_pago_historial (maquina_id, consorcio_id, campo, valor_anterior, valor_nuevo, usuario)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, maquina_id::text AS maquina_id, campo, valor_anterior, valor_nuevo, usuario, fecha`,
          [maquinaId, consorcioId, campo, a === null ? null : String(a), d === null ? null : String(d), usuario],
        );
        cambios.push(aCambio(fila.rows[0]));
      }
      if (cambios.length > 0) {
        await client.query('UPDATE maquinas SET abono_mensual = $2, porcentaje_rt = $3, porcentaje_firmante = $4 WHERE id = $1', [
          maquinaId, despues.abonoMensual, despues.porcentajeRt, despues.porcentajeFirmante,
        ]);
      }
      return { pago: despues, cambios };
    });
  }

  async historial(consorcioId: string, maquinaId: string): Promise<CambioPago[]> {
    if (!ES_UUID.test(consorcioId) || !ES_UUID.test(maquinaId)) return [];
    const filas = await this.db.query<FilaCambio>(
      `SELECT id, maquina_id::text AS maquina_id, campo, valor_anterior, valor_nuevo, usuario, fecha
         FROM maquinas_pago_historial WHERE maquina_id = $1 AND consorcio_id = $2 ORDER BY fecha, id`,
      [maquinaId, consorcioId],
    );
    return filas.map(aCambio);
  }
}

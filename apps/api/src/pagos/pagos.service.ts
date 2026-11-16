import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PagosRepository } from './pagos.repository';
import { CambioPago, PagoMaquina, PagoNuevo } from './pagos.types';

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Abono mensual y porcentajes de pago por máquina (HU-02 RF-04). */
@Injectable()
export class PagosService {
  constructor(private readonly repo: PagosRepository) {}

  async obtener(consorcioId: string, maquinaId: string): Promise<PagoMaquina> {
    const pago = await this.repo.obtener(consorcioId, maquinaId);
    if (!pago) throw new NotFoundException('Máquina no encontrada');
    return pago;
  }

  /**
   * Edita el abono y/o los porcentajes. Un porcentaje menor que 0 o mayor que 100, o una suma de los dos mayor que 100, se rechaza con 400
   * y el motivo; cada campo que cambia queda registrado con usuario, fecha, valor anterior y valor nuevo.
   */
  async guardar(consorcioId: string, maquinaId: string, cuerpo: unknown, usuario: string): Promise<{ pago: PagoMaquina; cambios: CambioPago[] }> {
    const actual = await this.obtener(consorcioId, maquinaId);
    const nuevo = this.validar(cuerpo, actual);
    const guardado = await this.repo.guardar(consorcioId, maquinaId, nuevo, usuario);
    if (!guardado) throw new NotFoundException('Máquina no encontrada');
    return guardado;
  }

  async historial(consorcioId: string, maquinaId: string): Promise<CambioPago[]> {
    await this.obtener(consorcioId, maquinaId);
    return this.repo.historial(consorcioId, maquinaId);
  }

  private validar(cuerpo: unknown, actual: PagoMaquina): PagoNuevo {
    const b = (cuerpo ?? {}) as Record<string, unknown>;
    const errores: string[] = [];
    const nuevo: PagoNuevo = {};
    if (b.abonoMensual === undefined && b.porcentajeRt === undefined && b.porcentajeFirmante === undefined) {
      errores.push('mandá abonoMensual, porcentajeRt, porcentajeFirmante o varios');
    }
    if (b.abonoMensual !== undefined) {
      if (b.abonoMensual === null) nuevo.abonoMensual = null;
      else if (typeof b.abonoMensual !== 'number' || !Number.isFinite(b.abonoMensual) || b.abonoMensual < 0) errores.push('abonoMensual tiene que ser un número mayor o igual que 0 (o null para borrarlo)');
      else nuevo.abonoMensual = redondear(b.abonoMensual);
    }
    for (const [clave, etiqueta] of [['porcentajeRt', 'del RT de Calle'], ['porcentajeFirmante', 'del Firmante']] as const) {
      const v = b[clave];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) errores.push(`${clave} tiene que ser un número`);
      else if (v < 0 || v > 100) errores.push(`el porcentaje ${etiqueta} tiene que estar entre 0 y 100`);
      else nuevo[clave] = redondear(v);
    }
    const rt = nuevo.porcentajeRt ?? actual.porcentajeRt;
    const firmante = nuevo.porcentajeFirmante ?? actual.porcentajeFirmante;
    if (errores.length === 0 && rt + firmante > 100) errores.push(`la suma de los porcentajes (${rt} + ${firmante} = ${redondear(rt + firmante)}) no puede superar 100`);
    if (errores.length > 0) throw new BadRequestException({ message: 'Datos inválidos', errores });
    return nuevo;
  }
}

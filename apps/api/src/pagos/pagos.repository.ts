import { randomUUID } from 'node:crypto';
import { CambioPago, PagoMaquina, PagoNuevo, PORCENTAJE_FIRMANTE_POR_DEFECTO, PORCENTAJE_RT_POR_DEFECTO } from './pagos.types';

export abstract class PagosRepository {
  abstract obtener(consorcioId: string, maquinaId: string): Promise<PagoMaquina | null>;
  /** Guarda el pago y registra cada campo que cambió; devuelve el pago vigente y los cambios. `null` si la máquina no existe. */
  abstract guardar(consorcioId: string, maquinaId: string, nuevo: PagoNuevo, usuario: string): Promise<{ pago: PagoMaquina; cambios: CambioPago[] } | null>;
  abstract historial(consorcioId: string, maquinaId: string): Promise<CambioPago[]>;
}

/** Los pagos en memoria, para las pruebas aisladas. Las máquinas se dan de alta con `agregarMaquina`. */
export class InMemoryPagosRepository extends PagosRepository {
  readonly pagos = new Map<string, PagoMaquina>();
  readonly cambios: CambioPago[] = [];

  agregarMaquina(consorcioId: string, maquinaId: string, referenciaAgc = 'M1'): PagoMaquina {
    const pago: PagoMaquina = { maquinaId, consorcioId, referenciaAgc, abonoMensual: null, porcentajeRt: PORCENTAJE_RT_POR_DEFECTO, porcentajeFirmante: PORCENTAJE_FIRMANTE_POR_DEFECTO };
    this.pagos.set(maquinaId, pago);
    return pago;
  }

  async obtener(consorcioId: string, maquinaId: string): Promise<PagoMaquina | null> {
    const p = this.pagos.get(maquinaId);
    return p && p.consorcioId === consorcioId ? { ...p } : null;
  }

  async guardar(consorcioId: string, maquinaId: string, nuevo: PagoNuevo, usuario: string) {
    const actual = this.pagos.get(maquinaId);
    if (!actual || actual.consorcioId !== consorcioId) return null;
    const cambios: CambioPago[] = [];
    const registrar = (campo: CambioPago['campo'], antes: number | null, despues: number | null) => {
      if (antes === despues) return;
      cambios.push({ id: randomUUID(), maquinaId, campo, valorAnterior: antes === null ? null : String(antes), valorNuevo: despues === null ? null : String(despues), usuario, fecha: new Date().toISOString() });
    };
    if (nuevo.abonoMensual !== undefined) { registrar('abono_mensual', actual.abonoMensual, nuevo.abonoMensual); actual.abonoMensual = nuevo.abonoMensual; }
    if (nuevo.porcentajeRt !== undefined) { registrar('porcentaje_rt', actual.porcentajeRt, nuevo.porcentajeRt); actual.porcentajeRt = nuevo.porcentajeRt; }
    if (nuevo.porcentajeFirmante !== undefined) { registrar('porcentaje_firmante', actual.porcentajeFirmante, nuevo.porcentajeFirmante); actual.porcentajeFirmante = nuevo.porcentajeFirmante; }
    this.cambios.push(...cambios);
    return { pago: { ...actual }, cambios: structuredClone(cambios) };
  }

  async historial(_consorcioId: string, maquinaId: string): Promise<CambioPago[]> {
    return this.cambios.filter((c) => c.maquinaId === maquinaId).map((c) => structuredClone(c));
  }
}

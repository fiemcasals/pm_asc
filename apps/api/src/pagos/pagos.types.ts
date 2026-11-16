/** Lo que se le paga y cobra por una máquina (HU-02 RF-04). */
export interface PagoMaquina {
  maquinaId: string;
  consorcioId: string;
  referenciaAgc: string;
  /** Abono mensual; null mientras no se cargó (la liquidación usa entonces el valor por defecto). */
  abonoMensual: number | null;
  /** Porcentaje del abono para el RT de Calle (por defecto 60). */
  porcentajeRt: number;
  /** Porcentaje del abono para el Firmante (por defecto 25). */
  porcentajeFirmante: number;
}

export interface CambioPago {
  id: string;
  maquinaId: string;
  campo: 'abono_mensual' | 'porcentaje_rt' | 'porcentaje_firmante';
  valorAnterior: string | null;
  valorNuevo: string | null;
  usuario: string;
  fecha: string;
}

export interface PagoNuevo {
  abonoMensual?: number | null;
  porcentajeRt?: number;
  porcentajeFirmante?: number;
}

export const ABONO_POR_DEFECTO = 150000;
export const PORCENTAJE_RT_POR_DEFECTO = 60;
export const PORCENTAJE_FIRMANTE_POR_DEFECTO = 25;

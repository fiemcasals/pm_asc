import { MaquinaAsignada } from '../firmante/firmante.types';

export interface CoberturaEcaResponse {
  eca: string;
  mes: string;
  totalMaquinas: number;
  inspeccionadas: number;
  firmadas: number;
  pendientes: number;
  advertencias: number;
  porcentajeInspeccionadas: number;
  porcentajeFirmadas: number;
  porcentajeCobertura: number;
}

export type MaquinaEca = MaquinaAsignada;

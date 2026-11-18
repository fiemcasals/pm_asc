import { PuntoGeografico, TipoMaquina } from './consorcio.types';

export const ESTADOS_AGC_VALIDOS = [
  'APTO',
  'NO APTO',
  'OBSERVADO',
  'CONDICIONAL',
  'FUERA DE SERVICIO',
  'PENDIENTE',
  'CLAUSURADO',
  'BAJA',
] as const;

export type EstadoAgc = (typeof ESTADOS_AGC_VALIDOS)[number];

/** Tamaño máximo permitido para el archivo Excel del padrón AGC (5 MB exactos). */
export const MAX_BYTES_EXCEL_AGC = 5 * 1024 * 1024;

export interface FilaAgcValidada {
  fila: number;
  direccion: string;
  nombreEdificio: string;
  matriculaAgc: string;
  tipo: TipoMaquina;
  estadoAgc: EstadoAgc;
  descripcion: string | null;
  ubicacion: PuntoGeografico | null;
}

export interface ErrorFilaAgc {
  fila: number;
  matriculaAgc: string | null;
  motivo: string;
}

export interface DetalleImportacionAgc {
  fila: number;
  accion: 'creada' | 'actualizada';
  matriculaAgc: string;
  consorcioId: string;
  direccion: string;
  tipo: TipoMaquina;
  estadoAgc: EstadoAgc;
}

export interface ResultadoPersistenciaAgc {
  creadas: number;
  actualizadas: number;
  consorciosCreados: number;
  detalle: DetalleImportacionAgc[];
}

export interface ResultadoImportacionAgc {
  resumen: {
    totalFilas: number;
    creadas: number;
    actualizadas: number;
    rechazadas: number;
    consorciosCreados: number;
  };
  creadas: number;
  actualizadas: number;
  rechazadas: number;
  consorciosCreados: number;
  errores: ErrorFilaAgc[];
  detalle: DetalleImportacionAgc[];
}

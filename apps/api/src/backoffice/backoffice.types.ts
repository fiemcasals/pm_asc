import { EstadoOperativo, EstadoVisita } from '../firmante/firmante.types';

/** Monitoreo del backoffice (HU-05 RF-01): una fila por equipo con el estado de su visita del mes. */
export interface RemitoEca {
  id: string;
  maquinaId: string;
  /** La visita a la que corresponde el remito. */
  visitaId: string;
  eca: string;
  direccion: string;
  enviadoPor: string;
  enviadoEn: string;
}

export interface FilaMonitoreo {
  /** El id de la visita; si el equipo todavía no tiene visita, «sin-visita:» + id del equipo. */
  id: string;
  maquinaId: string;
  codigoAGC: string;
  equipo: string;
  direccion: string;
  consorcio: string;
  eca: string;
  /** Quien hizo la visita; sin visita, el RT de Calle asignado. */
  inspector: string;
  estadoVisita: EstadoVisita;
  /** Fecha y hora de la visita (ISO); null si todavía no hubo. */
  fecha: string | null;
  estadoOperativo: EstadoOperativo;
  firmante: string;
  /** El Firmante ya autorizó el informe. */
  autorizada: boolean;
  /** El Firmante lo rechazó y volvió a la Secretaría. */
  rechazada: boolean;
  alertaCritica: boolean;
  /** El remito a la ECA ya enviado, o null. */
  remito: RemitoEca | null;
}

export interface FiltrosMonitoreo {
  direccion?: string;
  eca?: string;
  inspector?: string;
  estado?: EstadoVisita;
}

export interface PaginaMonitoreo {
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
  items: FilaMonitoreo[];
}

export const POR_PAGINA_DEFECTO = 20;
export const POR_PAGINA_MAXIMA = 100;
export const ESTADOS_VISITA: readonly EstadoVisita[] = ['Recorrida', 'Pendiente de Visita', 'Advertencia'];

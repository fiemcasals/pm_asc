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

/** El reclamo a la administración del consorcio por una visita con advertencia (HU-05 RF-02): quién y cuándo. */
export interface ReclamoAdmin {
  id: string;
  maquinaId: string;
  visitaId: string;
  administracion: string;
  direccion: string;
  reclamadoPor: string;
  reclamadoEn: string;
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
  /** La administración del consorcio, a la que se reclama una visita con advertencia. */
  administracion: string;
  /** El reclamo a la administración ya hecho, o null. */
  reclamo: ReclamoAdmin | null;
  /** Cuántas fotos y cuántos ítems de checklist tiene el informe de la visita (para la columna «Checklist»). */
  fotos: number;
  itemsChecklist: number;
}

/** El detalle de una visita para el visor de fotos e informe (HU-05 RF-02). */
export interface DetalleVisita {
  id: string;
  maquinaId: string;
  direccion: string;
  consorcio: string;
  administracion: string;
  eca: string;
  inspector: string;
  estadoVisita: EstadoVisita;
  fecha: string | null;
  /** Título y motivo de la alerta crítica, si la hay; y el motivo de la advertencia, si la hubo. */
  titulo: string | null;
  motivo: string | null;
  motivoAdvertencia: string | null;
  nombreEncargado: string | null;
  fotos: { etiqueta: string; url: string }[];
  checklist: { item: string; estado: string; observaciones: string }[];
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

/** Los estados anormales que el RT de Calle puede marcar (HU-06 RF-05). */
export type EstadoAnormal = 'Fuera de Servicio' | 'Reparación Urgente';
export const ESTADOS_ANORMALES: readonly EstadoAnormal[] = ['Fuera de Servicio', 'Reparación Urgente'];

export type ConfirmacionEstado = 'Pendiente de confirmación' | 'Confirmado' | 'Rechazado';

/** Un reporte de parada o de reparación urgente de un equipo (HU-17 RF-03 y HU-06 RF-05). */
export interface ReporteParada {
  id: string;
  maquinaId: string;
  codigoAGC: string;
  edificio: string;
  eca: string;
  /** El estado que marcó el RT. */
  estadoMarcado: EstadoAnormal;
  causa: string;
  /** Cantidad de fotos adjuntas (las imágenes no se devuelven en la lista). */
  fotos: number;
  /** Primera fotografía para la cabina trabada / alerta crítica. */
  fotoUrl?: string | null;
  /** Identificador de la alerta crítica generada (HU-10 RF-08). */
  alertaId?: string;
  /** Cómo queda el equipo: «<estado> — Pendiente de confirmación» hasta que el Firmante lo confirma o lo rechaza. */
  estado: string;
  confirmacion: ConfirmacionEstado;
  reportadoPor: string;
  fecha: string;
  /** A quiénes se avisó: la Secretaría y el Firmante del equipo. */
  avisadoA: string[];
  resueltoPor?: string;
  resueltoEn?: string;
  motivoRechazo?: string;
  /** Id que genera el celular para el reporte: si lo reintenta (por ejemplo después de un corte), no se duplica (HU-17 RF-09). */
  clientReportId?: string;
  /** Cuándo una nueva inspección del RT devolvió el equipo a «Normal» después de este reporte confirmado (HU-17 RF-09). */
  normalizadoEn?: string;
  normalizadoPor?: string;
}

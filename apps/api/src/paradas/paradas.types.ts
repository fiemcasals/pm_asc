/** Los estados anormales que el RT de Calle puede marcar (HU-06 RF-05). */
export type EstadoAnormal = 'Fuera de Servicio' | 'Reparación Urgente';
export const ESTADOS_ANORMALES: readonly EstadoAnormal[] = ['Fuera de Servicio', 'Reparación Urgente'];

export type ConfirmacionEstado = 'Pendiente de confirmación' | 'Confirmado' | 'Rechazado';

/** Un reporte de parada o de reparación urgente de un equipo (HU-17 RF-03 y HU-06 RF-05). Es lo que se guarda: la imagen va adentro. */
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
  /**
   * Primera fotografía para la cabina trabada / alerta crítica (una data URL). Se guarda con el reporte pero NUNCA sale en las respuestas de
   * la API: lo que sale es `ReporteParadaVista`, con la ruta para pedirla aparte (HU-17 RF-12).
   */
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

/**
 * Lo que la API devuelve de un reporte (HU-17 RF-12): el reporte sin la imagen, con `fotoRuta` para pedirla aparte (`GET <fotoRuta>`, con sesión)
 * o `null` si no tiene una foto que se pueda servir. Así la lista pesa lo mismo con una foto que con diez, y cada foto se baja una sola vez.
 */
export type ReporteParadaVista = Omit<ReporteParada, 'fotoUrl'> & { fotoRuta: string | null };

/** La foto de un reporte, lista para servirla. */
export interface FotoDeReporte {
  tipo: string;
  datos: Buffer;
}

/** Un reporte de parada de un equipo fuera de servicio (HU-17 RF-03). */
export interface ReporteParada {
  id: string;
  maquinaId: string;
  codigoAGC: string;
  edificio: string;
  eca: string;
  causa: string;
  /** Cantidad de fotos adjuntas (las imágenes no se devuelven en la lista). */
  fotos: number;
  /** El estado en que queda el equipo hasta que el Firmante lo confirme (HU-06 RF-05). */
  estado: 'Fuera de Servicio — Pendiente de confirmación';
  reportadoPor: string;
  fecha: string;
  /** A quiénes se avisó: la Secretaría y el Firmante del equipo. */
  avisadoA: string[];
}

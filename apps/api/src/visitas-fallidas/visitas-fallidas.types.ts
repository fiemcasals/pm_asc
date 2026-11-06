export interface CoordenadasGPS {
  latitud: number;
  longitud: number;
  precision?: number;
  timestamp?: string;
}

export interface ReporteVisitaFallidaDto {
  consorcioId: string;
  motivo?: string;
  fotoFrenteUrl: string;
  gps: CoordenadasGPS;
  inspector?: string;
  emailAdministracion?: string;
}

export interface EmailNotificacionConsorcio {
  id: string;
  destinatario: string;
  remitente: string;
  asunto: string;
  cuerpo: string;
  fechaEnvio: string;
  estado: 'enviado';
}

export interface VisitaFallidaRegistro {
  id: string;
  consorcioId: string;
  consorcioNombre: string;
  direccion: string;
  numeroAdvertencia: 1 | 2 | 3;
  motivo: string;
  fotoFrenteUrl: string;
  gps: CoordenadasGPS;
  inspector: string;
  fechaHora: string;
  emailNotificacion?: EmailNotificacionConsorcio | null;
}

export interface ResumenAdvertenciasConsorcio {
  consorcioId: string;
  consorcioNombre?: string;
  totalAdvertencias: number;
  ultimaAdvertencia: 1 | 2 | 3 | null;
  bloqueadoPorTerceraVisita: boolean;
  recargoAplicable: boolean;
  avisoCobro: string | null;
  historial: VisitaFallidaRegistro[];
}

export interface BloqueoConsorcioInfo {
  consorcioId: string;
  consorcioNombre: string;
  bloqueado: boolean;
  avisoCobro: string | null;
  totalAdvertencias: number;
  recargoAplicable: boolean;
  porcentajeRecargo: number;
  motivoBloqueo: string | null;
}

export interface LiquidacionMaquinaDto {
  consorcioId: string;
  maquinaId?: string;
  referenciaAgc?: string;
  periodo?: string;
  montoBase?: number;
}

export interface DetalleConceptoLiquidacion {
  concepto: string;
  monto: number;
}

export interface LiquidacionMaquinaResultado {
  id: string;
  consorcioId: string;
  consorcioNombre: string;
  maquinaId: string;
  referenciaAgc: string;
  periodo: string;
  montoBase: number;
  totalAdvertencias: number;
  bloqueadoPorTerceraVisita: boolean;
  recargoAplicado: boolean;
  porcentajeRecargo: number;
  montoRecargo: number;
  montoTotal: number;
  avisoCobro: string | null;
  detalleConceptos: DetalleConceptoLiquidacion[];
  fechaLiquidacion: string;
}

export interface LiquidacionConsorcioResultado {
  consorcioId: string;
  consorcioNombre: string;
  periodo: string;
  totalMaquinas: number;
  totalAdvertencias: number;
  bloqueadoPorTerceraVisita: boolean;
  avisoCobro: string | null;
  subtotalBase: number;
  totalRecargos: number;
  totalGeneral: number;
  liquidacionesMaquinas: LiquidacionMaquinaResultado[];
  fechaLiquidacion: string;
}

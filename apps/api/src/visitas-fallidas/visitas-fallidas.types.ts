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
  totalAdvertencias: number;
  ultimaAdvertencia: 1 | 2 | 3 | null;
  bloqueadoPorTerceraVisita: boolean;
  recargoAplicable: boolean;
  historial: VisitaFallidaRegistro[];
}

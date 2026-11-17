export interface CoordenadasGPS {
  latitud: number;
  longitud: number;
  precision?: number;
  timestamp?: string;
}

export interface ReporteVisitaFallidaDto {
  consorcioId: string;
  motivo?: string;
  /** Causa elegida de la lista configurada (HU-07 RF-06); para el RT de Calle es obligatoria. */
  causa?: string;
  /** Hora que marcaba el celular al registrar (ISO). */
  horaDispositivo?: string;
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
  /** Hora del servidor al registrar: la fija la API y nadie la edita. */
  fechaHora: string;
  /** Hora que marcaba el celular del RT, tal cual la mandó. */
  horaDispositivo?: string | null;
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

/** Un desbloqueo de un edificio bloqueado por la 3.ª visita fallida, con quién, cuándo y por qué (HU-07 RF-05). */
export interface DesbloqueoEdificio {
  id: string;
  consorcioId: string;
  /** La última visita fallida que existía al desbloquear: el desbloqueo cubre hasta ella. */
  hastaVisitaId: string;
  usuario: string;
  motivo: string;
  fecha: string;
}

export interface DesbloquearEdificioDto {
  motivo: string;
}

/** Un edificio de la lista de recorrido, con su estado de bloqueo. */
export interface EdificioRecorrido {
  id: string;
  nombre: string;
  direccion: string;
  bloqueado: boolean;
  /** Ya tiene una visita fallida de hoy (hora de Buenos Aires): al RT le desaparece el pin por ese día. */
  visitaFallidaHoy: boolean;
}

/** Una anulación del recargo del 45 % de una máquina: quién, cuándo y por qué (HU-07 RF-04). */
export interface AnulacionRecargo {
  id: string;
  consorcioId: string;
  maquinaId: string;
  /** La 3.ª visita fallida que originó el recargo. */
  visitaFallidaId: string;
  usuario: string;
  motivo: string;
  fecha: string;
}

export interface AnularRecargoDto {
  consorcioId: string;
  maquinaId: string;
  motivo: string;
}

/** Por qué una máquina de un edificio con 3 advertencias no lleva recargo en una liquidación. */
export type MotivoSinRecargo = 'otro_periodo' | 'maquina_inspeccionada' | 'anulado';

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
  /** De dónde salió el abono: el guardado en la máquina (HU-02 RF-04), el que mandó quien liquida, o el valor por defecto. */
  origenAbono: 'maquina' | 'parametro' | 'por_defecto';
  /** Lo que le corresponde al RT de Calle y al Firmante de este abono, según los porcentajes guardados de la máquina. */
  porcentajeRt: number;
  porcentajeFirmante: number;
  montoRt: number;
  montoFirmante: number;
  totalAdvertencias: number;
  bloqueadoPorTerceraVisita: boolean;
  recargoAplicado: boolean;
  porcentajeRecargo: number;
  montoRecargo: number;
  montoTotal: number;
  avisoCobro: string | null;
  /** Si el edificio está bloqueado pero esta máquina no lleva recargo en este período, el motivo; si no, null. */
  recargoNoAplicadoPor: MotivoSinRecargo | null;
  /** La anulación del recargo de esta máquina, si un Administrador la registró. */
  recargoAnulado: { usuario: string; motivo: string; fecha: string } | null;
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

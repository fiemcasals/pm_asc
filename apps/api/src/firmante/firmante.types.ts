export type EstadoVisita = 'Recorrida' | 'Pendiente de Visita' | 'Advertencia';

export type EstadoOperativo = 'Normal' | 'Fuera de Servicio' | 'Reparación Urgente';

export type TipoAlertaCritica = 'FUERA_DE_SERVICIO' | 'REPARACION_URGENTE';

export interface ChecklistItemCritico {
  item: string;
  estado: 'Critico' | 'Falla' | 'Peligro';
  observaciones: string;
}

/** Un recordatorio o aviso que el sistema registró en una alerta sin acuse de recibo (HU-10 RF-04). */
export interface EventoAlerta {
  tipo: 'recordatorio_eca_24h' | 'aviso_secretaria_48h';
  fecha: string;
  eca: string;
  edificio: string;
  mensaje: string;
}

export interface AlertaCritica {
  id: string;
  tipo: TipoAlertaCritica;
  titulo: string;
  motivo: string;
  fotografiaCabinaTrabada?: string | null;
  checklist?: ChecklistItemCritico[];
  fechaDeteccion: string;
  remitoUrl?: string;
  acuseRecibo?: {
    fechaHora: string;
    usuario: string;
  } | null;
  /** Recordatorios y avisos registrados para esta alerta, en orden. */
  historial?: EventoAlerta[];
}

export interface FotosObligatorias {
  cables: string;
  frente: string;
}

export interface VisitaInspeccion {
  id: string;
  fecha: string;
  inspector: string;
  estado: EstadoVisita;
  motivoAdvertencia?: string;
  fotosObligatorias?: FotosObligatorias | null;
  firmaEncargado?: string | null;
  nombreEncargado?: string | null;
  autorizada: boolean;
  /** HU-08 RF-03: el Firmante rechazó el informe; vuelve a la Secretaría, no al RT de Calle. */
  rechazada?: boolean;
  motivoRechazo?: string | null;
  fechaRechazo?: string | null;
  rechazadoPor?: string | null;
  /** Cuándo se avisó a la Secretaría que el plazo de 5 días hábiles venció; una sola vez. */
  avisoPlazoEn?: string | null;
  fechaAutorizacion?: string | null;
  autorizadoPor?: string | null;
  protocoloAGC?: string | null;
}

export interface EdificioConsorcio {
  id: string;
  direccion: string;
  administracion: string;
  consorcio: string;
}

/** Tipo de equipo (HU-06 RF-03): hay fallas críticas que sólo existen en las máquinas hidráulicas. Sin dato, se toma como de tracción. */
export type TipoMaquina = 'traccion' | 'hidraulico' | 'montavehiculos';

export interface MaquinaAsignada {
  id: string;
  codigoAGC: string;
  /** Por defecto de tracción. */
  tipo?: TipoMaquina;
  nombre: string;
  edificio: EdificioConsorcio;
  eca: string;
  rtCalle: string;
  firmanteId: string;
  firmanteUsername: string;
  /** Email del Firmante de la terna: el Firmante entra con su usuario, que puede ser su nombre o su email (como el RT). */
  firmanteEmail?: string | null;
  /** HU-02 RF-06: el edificio de la base al que sigue esta máquina; su RT, Firmante y ECA son los de la terna vigente. */
  consorcioId?: string;
  mes: string;
  estado: EstadoVisita;
  estadoOperativo?: EstadoOperativo;
  /** HU-06 RF-05: el RT marca el estado y el Firmante lo confirma. Sin dato, el estado no tiene nada pendiente. */
  confirmacionEstado?: 'Pendiente de confirmación' | 'Confirmado' | 'Rechazado';
  alertaCritica?: AlertaCritica | null;
  visita: VisitaInspeccion | null;
}

export interface AutorizarFirmaDto {
  maquinaId?: string;
  visitaId?: string;
}

export interface AutorizarFirmaResponse {
  ok: boolean;
  mensaje: string;
  maquinaId: string;
  visitaId: string;
  autorizacion: {
    autorizada: boolean;
    fechaAutorizacion: string;
    autorizadoPor: string;
    protocoloAGC: string;
  };
}

export interface RechazarInformeDto {
  maquinaId?: string;
  visitaId?: string;
  motivo?: string;
}

export interface RechazarInformeResponse {
  ok: boolean;
  mensaje: string;
  maquinaId: string;
  visitaId: string;
  rechazo: { motivo: string; rechazadoPor: string; fecha: string };
}

/** Un informe rechazado por el Firmante, tal como lo ve la Secretaría. */
export interface InformeRechazado {
  maquinaId: string;
  codigoAGC: string;
  edificio: string;
  visitaId: string;
  motivo: string;
  rechazadoPor: string;
  fecha: string;
}

/** El aviso a la Secretaría de un informe que superó el plazo de 5 días hábiles sin autorizarse ni rechazarse. */
export interface AvisoPlazoVencido {
  maquinaId: string;
  codigoAGC: string;
  edificio: string;
  visitaId: string;
  fechaInforme: string;
  diasHabiles: number;
  /** Cuándo se generó el aviso. */
  fecha: string;
}

export interface BandejaSecretaria {
  rechazados: InformeRechazado[];
  avisosPlazo: AvisoPlazoVencido[];
}

/** Un edificio de la base con su terna vigente, tal como lo necesita la vista de firma (HU-02 RF-06). */
export interface VistaTernaEdificio {
  nombre: string;
  direccion: string;
  administracion: string | null;
  maquinas: { id: string; referenciaAgc: string; descripcion: string | null; tipo: TipoMaquina }[];
  terna: {
    rtCalle: { nombre: string };
    firmante: { nombre: string; email: string | null };
    eca: { nombre: string };
  };
}

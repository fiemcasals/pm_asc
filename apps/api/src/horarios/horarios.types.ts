/** Horarios de atención de un edificio (HU-01 RF-04). */
export const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

/** Una franja horaria del día, en formato 24 h «HH:MM». */
export interface Franja {
  desde: string;
  hasta: string;
}

/** Hasta 2 franjas por día; un día sin entrada (o con la lista vacía) está cerrado. */
export type FranjasPorDia = Partial<Record<DiaSemana, Franja[]>>;

export interface HorariosEdificio {
  consorcioId: string;
  /** «A coordinar» (pin amarillo): reemplaza las franjas, no hay horario fijo y hay que coordinar la visita. */
  aCoordinar: boolean;
  franjas: FranjasPorDia;
  /** true mientras nadie los editó: es el horario con el que arranca todo edificio nuevo. */
  porDefecto: boolean;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

export interface HorariosNuevos {
  aCoordinar: boolean;
  franjas: FranjasPorDia;
}

export type MotivoApertura = 'a_coordinar' | 'feriado' | 'dentro_de_franja' | 'fuera_de_franja' | 'dia_cerrado';

export interface EstadoApertura {
  consorcioId: string;
  /** El momento consultado (ISO), tal como se evaluó. */
  en: string;
  /** Fecha y hora de Buenos Aires con las que se evaluó. */
  fechaLocal: string;
  horaLocal: string;
  diaSemana: DiaSemana;
  /** true sólo si está abierto; «A coordinar» no se considera abierto (hay que coordinar). */
  abierto: boolean;
  motivo: MotivoApertura;
  /** La franja en la que está abierto, si lo está. */
  franjaVigente: Franja | null;
}

/** Lunes a viernes, de 08:00 a 12:00 y de 17:00 a 20:00: el horario con el que arranca un edificio nuevo (criterio 1). */
export const FRANJAS_POR_DEFECTO: FranjasPorDia = {
  lunes: [{ desde: '08:00', hasta: '12:00' }, { desde: '17:00', hasta: '20:00' }],
  martes: [{ desde: '08:00', hasta: '12:00' }, { desde: '17:00', hasta: '20:00' }],
  miercoles: [{ desde: '08:00', hasta: '12:00' }, { desde: '17:00', hasta: '20:00' }],
  jueves: [{ desde: '08:00', hasta: '12:00' }, { desde: '17:00', hasta: '20:00' }],
  viernes: [{ desde: '08:00', hasta: '12:00' }, { desde: '17:00', hasta: '20:00' }],
};

export const MAX_FRANJAS_POR_DIA = 2;
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

export type ColorSemaforo = 'verde' | 'amarillo' | 'rojo';

/** `inspeccionado`: todas sus máquinas tienen una inspección en el mes. `pendiente`: le falta alguna. */
export type EstadoEdificio = 'inspeccionado' | 'pendiente';

export interface FechaCalendario {
  anio: number;
  /** 1 a 12 */
  mes: number;
  /** 1 a 31 */
  dia: number;
}

/** RT de Calle asignado al edificio (terna de HU-02), sin el porcentaje operativo. */
export interface RtCalleAsignado {
  nombre: string;
  telefono: string | null;
  email: string | null;
}

/**
 * Lo que el repositorio sabe de un edificio en el mes consultado: hechos, sin colores.
 * El color lo decide `semaforo.logic.ts`.
 */
export interface EdificioBase {
  id: string;
  nombre: string;
  direccion: string;
  /** Máquinas registradas en el edificio. */
  maquinas: number;
  /** Máquinas del edificio con al menos una inspección en el mes, hasta la fecha consultada. */
  maquinasInspeccionadas: number;
  /** Instante (ISO 8601) de la última inspección del mes hasta la fecha consultada, o null si no hay. */
  ultimaInspeccion: string | null;
  rtCalle: RtCalleAsignado | null;
}

export interface SemaforoEdificio {
  id: string;
  nombre: string;
  direccion: string;
  color: ColorSemaforo;
  estado: EstadoEdificio;
  maquinas: number;
  maquinasInspeccionadas: number;
  /** Día del mes (en hora de Buenos Aires) de la última inspección del mes, o null si todavía no hubo ninguna. */
  diaUltimaInspeccion: number | null;
  rtCalle: RtCalleAsignado | null;
}

export interface SemaforoResponse {
  /** Fecha para la que se calculó, AAAA-MM-DD, en hora de Buenos Aires. */
  fecha: string;
  /** Mes evaluado, AAAA-MM. */
  mes: string;
  /** Color que tiene hoy un edificio pendiente (el tramo del día). */
  tramoDelDia: ColorSemaforo;
  totales: Record<ColorSemaforo, number>;
  /** Primero los rojos, después los amarillos y los verdes; dentro de cada color, por nombre. */
  edificios: SemaforoEdificio[];
}

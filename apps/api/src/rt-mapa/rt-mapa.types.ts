import { FranjasPorDia } from '../horarios/horarios.types';

/** Un edificio del mapa del RT con lo necesario para pintar su pin según esté abierto (HU-16 RF-01). */
export interface EdificioMapaRt {
  id: string;
  nombre: string;
  direccion: string;
  /** null si el edificio todavía no tiene punto en el mapa: aparece en la lista pero no como pin. */
  ubicacion: { latitud: number; longitud: number } | null;
  aCoordinar: boolean;
  franjas: FranjasPorDia;
  /** El encargado del edificio, para llamarlo desde la tarjeta (HU-16 RF-02); sin datos si no está cargado. */
  encargado: { nombre: string | null; telefono: string | null };
}

export interface MapaRt {
  rt: { nombre: string; zona: string | null };
  /** La hora del servidor: el celular la usa para corregir su reloj. */
  ahora: string;
  /** Feriados (AAAA-MM-DD) que cuentan como cerrado. */
  feriados: string[];
  /** Las reglas de presencia que aplica la API al iniciar una inspección (HU-16 RF-02): la pantalla usa las mismas. */
  presencia: { radioM: number; precisionMaxM: number };
  /** Sólo los edificios de este RT que siguen pendientes hoy: sin los bloqueados, sin los que ya tienen visita fallida de hoy y sin los resueltos. */
  edificios: EdificioMapaRt[];
}

/** Datos de un edificio que salen de la base: dónde está y si hoy ya se inspeccionaron todos sus equipos. */
export interface DatosEdificioRt {
  ubicacion: { latitud: number; longitud: number } | null;
  /** Cantidad de equipos del edificio y cuántos tienen una inspección de hoy (día de Buenos Aires). */
  maquinas: number;
  inspeccionadasHoy: number;
  encargado?: { nombre: string | null; telefono: string | null };
}

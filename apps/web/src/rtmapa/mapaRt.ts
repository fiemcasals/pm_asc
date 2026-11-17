import { type HorarioEdificio } from './colorPin';

export interface EdificioMapaRt extends HorarioEdificio {
  id: string;
  nombre: string;
  direccion: string;
  ubicacion: { latitud: number; longitud: number } | null;
  /** El encargado del edificio, para llamarlo desde la tarjeta. */
  encargado: { nombre: string | null; telefono: string | null };
}

export interface MapaRt {
  rt: { nombre: string; zona: string | null };
  ahora: string;
  feriados: string[];
  /** Las reglas de presencia que aplica la API al iniciar una inspección. */
  presencia: { radioM: number; precisionMaxM: number };
  edificios: EdificioMapaRt[];
}

type Enviar = (url: string, init?: RequestInit) => Promise<Response>;

export async function cargarMapaRt(enviar: Enviar): Promise<MapaRt | null> {
  try {
    const res = await enviar('/api/rt/mapa');
    return res.ok ? ((await res.json()) as MapaRt) : null;
  } catch {
    return null;
  }
}

/** Cada cuánto se vuelve a calcular el color de los pines y la hora del encabezado (alcanza con que cambien dentro del minuto). */
export const REFRESCO_MS = 15_000;

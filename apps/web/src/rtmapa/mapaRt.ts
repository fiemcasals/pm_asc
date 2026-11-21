import { CLAVE_MAPA_RT, SesionRevocadaError } from '../auth/sesion';
import { type HorarioEdificio, enBuenosAires } from './colorPin';

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

/** El mapa tal como se guardó en el celular la última vez que se pudo descargar. */
export interface MapaRtGuardado {
  mapa: MapaRt;
  /** Cuándo se descargó (ISO). */
  descargadoEn: string;
}

export type ResultadoMapaRt = { origen: 'servidor'; mapa: MapaRt } | { origen: 'guardado'; mapa: MapaRt; descargadoEn: string };

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const almacenDelNavegador = (): Almacen | undefined => globalThis.localStorage;

/** Guarda los datos descargados para poder mostrarlos sin conexión. Si el almacenamiento está lleno o bloqueado, se sigue sin guardar. */
export function guardarMapaRt(mapa: MapaRt, ahora: Date, almacen: Almacen | undefined = almacenDelNavegador()): void {
  try {
    const guardado: MapaRtGuardado = { mapa, descargadoEn: ahora.toISOString() };
    almacen?.setItem(CLAVE_MAPA_RT, JSON.stringify(guardado));
  } catch {
    // sin lugar para guardar: el mapa sigue funcionando con conexión
  }
}

/** Los últimos datos guardados, o `null` si no hay o están dañados. */
export function leerMapaRtGuardado(almacen: Almacen | undefined = almacenDelNavegador()): MapaRtGuardado | null {
  try {
    const crudo = almacen?.getItem(CLAVE_MAPA_RT);
    const g = (crudo ? JSON.parse(crudo) : null) as Partial<MapaRtGuardado> | null;
    const valido = g && typeof g.descargadoEn === 'string' && !Number.isNaN(Date.parse(g.descargadoEn)) && g.mapa && Array.isArray(g.mapa.edificios) && g.mapa.rt;
    return valido ? (g as MapaRtGuardado) : null;
  } catch {
    return null;
  }
}

export function borrarMapaRtGuardado(almacen: Almacen | undefined = almacenDelNavegador()): void {
  try {
    almacen?.removeItem(CLAVE_MAPA_RT);
  } catch {
    // nada que borrar
  }
}

/**
 * Descarga el mapa del RT y lo guarda. Si no hay conexión (el pedido ni siquiera llega al servidor), devuelve los últimos datos guardados y
 * cuándo se bajaron. Un error del servidor o de la sesión no se tapa con datos viejos: devuelve `null`, como antes (HU-16 RF-05).
 */
export async function cargarMapaRtConRespaldo(enviar: Enviar, almacen: Almacen | undefined = almacenDelNavegador(), ahora: () => Date = () => new Date()): Promise<ResultadoMapaRt | null> {
  try {
    const res = await enviar('/api/rt/mapa');
    if (!res.ok) return null;
    const mapa = (await res.json()) as MapaRt;
    guardarMapaRt(mapa, ahora(), almacen);
    return { origen: 'servidor', mapa };
  } catch (err) {
    if (err instanceof SesionRevocadaError) return null;
    const guardado = leerMapaRtGuardado(almacen);
    return guardado ? { origen: 'guardado', mapa: guardado.mapa, descargadoEn: guardado.descargadoEn } : null;
  }
}

/** «las 14:30 del 21/11/2026», en la hora de Buenos Aires: el cartel que acompaña a los datos guardados. */
export function horaDeLosDatos(descargadoEn: string): string {
  const { fecha, hora } = enBuenosAires(new Date(descargadoEn));
  const [a, m, d] = fecha.split('-');
  return `las ${hora} del ${d}/${m}/${a}`;
}

/** Cada cuánto se vuelve a calcular el color de los pines y la hora del encabezado (alcanza con que cambien dentro del minuto). */
export const REFRESCO_MS = 15_000;

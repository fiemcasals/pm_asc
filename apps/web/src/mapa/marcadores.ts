/** Lógica sin React ni MapLibre del mapa de edificios (HU-16 RF-04): marcadores, prioridad de etiquetas, encuadre y proyección. */
import type { PuntoGeografico } from '../consorcios/consorcios';

export interface MarcadorMapa {
  id: string;
  etiqueta: string;
  subtitulo?: string;
  ubicacion: PuntoGeografico;
  /** Color del pin (por defecto, verde azulado). El semáforo lo usa para pintar cada edificio según su estado. */
  color?: string;
  /** Nombre del color, para leerlo sin mirar el pin (accesibilidad y pruebas). */
  colorNombre?: string;
}

export const COLOR_PIN_POR_DEFECTO = '#0f766e';

/** El nombre del color manda en qué orden se conservan las etiquetas cuando no entran todas: rojo, amarillo, verde y el resto. */
const PRIORIDAD_POR_COLOR: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2 };

/** Cuanto más bajo el número, antes se coloca la etiqueta y más difícil es que se oculte. El seleccionado siempre va primero. */
export function prioridadDeEtiqueta(m: Pick<MarcadorMapa, 'colorNombre'>, seleccionado = false): number {
  if (seleccionado) return -1;
  return PRIORIDAD_POR_COLOR[m.colorNombre ?? ''] ?? 3;
}

/** «Nombre. Color: estado», el texto con que un lector de pantalla anuncia cada pin. */
export function etiquetaAccesible(m: Pick<MarcadorMapa, 'etiqueta' | 'subtitulo'>): string {
  return m.subtitulo ? `${m.etiqueta}. ${m.subtitulo}` : m.etiqueta;
}

/** Latitud y longitud con 6 decimales (unos 11 cm), como se guardan. */
export function a6Decimales(punto: { lat: number; lng: number }): PuntoGeografico {
  return { latitud: Number(punto.lat.toFixed(6)), longitud: Number(punto.lng.toFixed(6)) };
}

/** De qué lado del pin va el nombre: `left` es que el texto queda a la derecha del pin (MapLibre ancla el texto por su borde izquierdo). */
export type AnclaEtiqueta = 'left' | 'right';

const MARGEN_PIN_PX = 12;
const PX_POR_LETRA = 6.8;

/** Lo que ocupa el nombre en pantalla (tipografía de 12 px), a ojo: alcanza para decidir de qué lado entra. */
export function anchoEstimadoEtiqueta(texto: string): number {
  return Math.round(texto.length * PX_POR_LETRA) + 8;
}

/**
 * El nombre va a la derecha del pin; si ahí no entra en el mapa (el pin está cerca del borde derecho), pasa a la izquierda, para que
 * no quede cortado. Si no entra de ningún lado, se queda del lado que tiene más lugar.
 * @param x posición del pin en píxeles desde el borde izquierdo del mapa.
 */
export function anclaDeEtiqueta(x: number, anchoDelMapa: number, texto: string): AnclaEtiqueta {
  const necesario = MARGEN_PIN_PX + anchoEstimadoEtiqueta(texto);
  const aLaDerecha = anchoDelMapa - x;
  if (aLaDerecha >= necesario) return 'left';
  return x > aLaDerecha ? 'right' : 'left';
}

export interface PuntoGeoJSON {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { id: string; etiqueta: string; prioridad: number; ancla: AnclaEtiqueta };
}

/** Los edificios como puntos GeoJSON, que es lo que MapLibre usa para colocar las etiquetas. [longitud, latitud]. */
export function aGeoJSON(
  marcadores: readonly MarcadorMapa[],
  seleccionadoId: string | null = null,
  anclas: Readonly<Record<string, AnclaEtiqueta>> = {},
): { type: 'FeatureCollection'; features: PuntoGeoJSON[] } {
  return {
    type: 'FeatureCollection',
    features: marcadores.map((m) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [m.ubicacion.longitud, m.ubicacion.latitud] },
      properties: { id: m.id, etiqueta: m.etiqueta, prioridad: prioridadDeEtiqueta(m, m.id === seleccionadoId), ancla: anclas[m.id] ?? 'left' },
    })),
  };
}

/** El rectángulo que contiene todos los puntos: [[oeste, sur], [este, norte]], o `null` si no hay ninguno. */
export function limitesDe(puntos: readonly PuntoGeografico[]): [[number, number], [number, number]] | null {
  if (puntos.length === 0) return null;
  let oeste = Infinity, sur = Infinity, este = -Infinity, norte = -Infinity;
  for (const p of puntos) {
    oeste = Math.min(oeste, p.longitud);
    este = Math.max(este, p.longitud);
    sur = Math.min(sur, p.latitud);
    norte = Math.max(norte, p.latitud);
  }
  return [[oeste, sur], [este, norte]];
}

/** Cambia cuando cambia el conjunto de edificios: es lo que decide si hay que volver a encuadrar el mapa. */
export function claveDeMarcadores(marcadores: readonly Pick<MarcadorMapa, 'id'>[]): string {
  return marcadores.map((m) => m.id).sort().join('|');
}

// --- Proyección: la misma que usa MapLibre (Web Mercator con mosaicos de 512 px). Sirve para comprobar que los pines no se
// --- distorsionan: el dibujo anterior estiraba un recuadro de CABA sobre un lienzo de otra proporción.

const RADIO_TIERRA_M = 6_371_008.8;
const RADIO_MERCATOR_M = 6_378_137;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia en metros sobre la superficie de la Tierra (haversine). */
export function distanciaMetros(a: PuntoGeografico, b: PuntoGeografico): number {
  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(h));
}

/** Cuántos metros reales hay en un píxel del mapa a esa latitud y ese zoom (mosaicos de 512 px, como MapLibre). */
export function metrosPorPixel(latitud: number, zoom: number): number {
  return (2 * Math.PI * RADIO_MERCATOR_M * Math.cos(rad(latitud))) / (512 * 2 ** zoom);
}

/** Posición en píxeles del mundo a ese zoom: [x, y], con el origen arriba a la izquierda. */
export function aPixeles(punto: PuntoGeografico, zoom: number): [number, number] {
  const mundo = 512 * 2 ** zoom;
  const x = ((punto.longitud + 180) / 360) * mundo;
  const y = ((1 - Math.log(Math.tan(rad(punto.latitud)) + 1 / Math.cos(rad(punto.latitud))) / Math.PI) / 2) * mundo;
  return [x, y];
}

/** Separación en píxeles, en horizontal y en vertical, entre dos puntos a ese zoom. */
export function separacionEnPixeles(a: PuntoGeografico, b: PuntoGeografico, zoom: number): { dx: number; dy: number; total: number } {
  const [ax, ay] = aPixeles(a, zoom);
  const [bx, by] = aPixeles(b, zoom);
  return { dx: Math.abs(bx - ax), dy: Math.abs(by - ay), total: Math.hypot(bx - ax, by - ay) };
}

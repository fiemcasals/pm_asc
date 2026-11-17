import { type Ubicacion } from '../auth/ubicacion';
import { type EdificioMapaRt } from './mapaRt';

/** Tarjeta del edificio y validación de presencia a 30 m (HU-16 RF-02): lógica de la pantalla, sin React. */

export interface ReglasPresencia {
  radioM: number;
  precisionMaxM: number;
}
export const REGLAS_POR_DEFECTO: ReglasPresencia = { radioM: 30, precisionMaxM: 30 };

/** El enlace para llamar al encargado: abre el marcador del celular con su teléfono. null si no hay un teléfono utilizable. */
export function enlaceLlamada(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const limpio = telefono.trim().replace(/(?!^\+)[^\d]/g, '');
  return /\d{6,}/.test(limpio) ? `tel:${limpio}` : null;
}

/** «Cómo llegar»: abre Google Maps con destino en el edificio (por su punto, o por su dirección si todavía no tiene). */
export function enlaceComoLlegar(e: Pick<EdificioMapaRt, 'ubicacion' | 'direccion'>): string {
  const destino = e.ubicacion ? `${e.ubicacion.latitud},${e.ubicacion.longitud}` : e.direccion;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
}

/** Distancia en metros entre dos puntos (haversine): la misma fórmula que usa la API. */
export function distanciaMetros(a: { latitud: number; longitud: number }, b: { latitud: number; longitud: number }): number {
  const R = 6_371_008.8;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Presencia =
  | { resultado: 'puede_iniciar'; distanciaM: number }
  | { resultado: 'lejos'; distanciaM: number }
  | { resultado: 'sin_buena_senal'; distanciaM: number | null };

/**
 * ¿Está el RT en el edificio? Con buena señal (radio de error del GPS de `precisionMaxM` o menos) y el punto del edificio cargado se mide la
 * distancia: a `radioM` o menos aparecen «Iniciar Inspección» y «No se pudo realizar la inspección»; más lejos no. Sin buena señal (o sin
 * punto del edificio) aparece «Sin buena señal GPS». Es la misma regla que valida la API, que es la que decide.
 */
export function evaluarPresencia(
  ubicacion: Pick<Ubicacion, 'latitud' | 'longitud' | 'precision'>,
  edificio: Pick<EdificioMapaRt, 'ubicacion'>,
  reglas: ReglasPresencia = REGLAS_POR_DEFECTO,
): Presencia {
  const distanciaM = edificio.ubicacion ? Math.round(distanciaMetros(ubicacion, edificio.ubicacion) * 10) / 10 : null;
  if (distanciaM === null || ubicacion.precision > reglas.precisionMaxM) return { resultado: 'sin_buena_senal', distanciaM };
  return distanciaM <= reglas.radioM ? { resultado: 'puede_iniciar', distanciaM } : { resultado: 'lejos', distanciaM };
}

export const MIN_JUSTIFICACION = 10;

export interface BorradorSenalMala {
  foto: string | null;
  justificacion: string;
}

/** Con «Sin buena señal GPS» se puede seguir sólo con la foto del frente y una justificación escrita. */
export function puedeSeguirSinSenal(b: BorradorSenalMala): boolean {
  return !!b.foto && b.foto.length > 0 && b.justificacion.trim().length >= MIN_JUSTIFICACION;
}

/** ¿Se muestran los botones «Iniciar Inspección» y «No se pudo realizar la inspección»? */
export function mostrarBotonesDeInicio(p: Presencia | null, b: BorradorSenalMala): boolean {
  if (!p) return false;
  if (p.resultado === 'puede_iniciar') return true;
  if (p.resultado === 'sin_buena_senal') return puedeSeguirSinSenal(b);
  return false;
}

/** Lo que se manda al iniciar: coordenadas, precisión, hora del GPS y hora del dispositivo (la del servidor la pone la API). */
export function cuerpoInicio(edificioId: string, u: Ubicacion, p: Presencia, b: BorradorSenalMala, ahora: Date = new Date()) {
  const base = {
    consorcioId: edificioId,
    gps: { latitud: u.latitud, longitud: u.longitud, precision: u.precision, timestamp: u.tomadaEn },
    horaDispositivo: ahora.toISOString(),
  };
  return p.resultado === 'sin_buena_senal' ? { ...base, fotoFrenteUrl: b.foto, justificacion: b.justificacion.trim() } : base;
}

export interface InicioGuardado {
  id: string;
  distanciaM: number | null;
  sinBuenaSenal: boolean;
  revision: 'no_requiere' | 'pendiente' | 'revisada';
}

type Enviar = (url: string, init?: RequestInit) => Promise<Response>;

/** Registra el inicio en la API. Devuelve el inicio guardado o el motivo del rechazo (por ejemplo «Estás a 120 m del edificio…»). */
export async function enviarInicio(
  edificioId: string,
  u: Ubicacion,
  p: Presencia,
  b: BorradorSenalMala,
  enviar: Enviar,
  ahora: Date = new Date(),
): Promise<{ ok: true; inicio: InicioGuardado } | { ok: false; error: string }> {
  try {
    const res = await enviar('/api/inicios-inspeccion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoInicio(edificioId, u, p, b, ahora)),
    });
    const json = (await res.json()) as { message?: string | string[]; errores?: string[] } & InicioGuardado;
    if (!res.ok) {
      const motivo = Array.isArray(json.message) ? json.message.join(' · ') : json.message;
      return { ok: false, error: json.errores?.join(' · ') || motivo || `No se pudo iniciar la inspección (error ${res.status})` };
    }
    return { ok: true, inicio: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

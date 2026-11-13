import { fetchConSesion } from '../auth/sesion';
import type { ConsorcioMapaItem, FetchResult } from '../consorcios/consorcios';
import type { MarcadorMapa } from '../consorcios/MapaUbicacionConsorcio';

export type ColorSemaforo = 'verde' | 'amarillo' | 'rojo';
export type EstadoEdificio = 'inspeccionado' | 'pendiente';

export interface RtCalleAsignado {
  nombre: string;
  telefono: string | null;
  email: string | null;
}

export interface SemaforoEdificio {
  id: string;
  nombre: string;
  direccion: string;
  color: ColorSemaforo;
  estado: EstadoEdificio;
  maquinas: number;
  maquinasInspeccionadas: number;
  diaUltimaInspeccion: number | null;
  rtCalle: RtCalleAsignado | null;
}

export interface SemaforoRespuesta {
  fecha: string;
  mes: string;
  tramoDelDia: ColorSemaforo;
  totales: Record<ColorSemaforo, number>;
  edificios: SemaforoEdificio[];
}

export interface RtCandidato {
  usuario: string;
  nombre: string;
  pendientes: number;
}

export interface SugerenciaReasignacion {
  consorcioId: string;
  nombre: string;
  fecha: string;
  color: ColorSemaforo;
  rtActual: RtCalleAsignado | null;
  sugerido: RtCandidato | null;
  candidatos: RtCandidato[];
}

export interface RegistroReasignacion {
  id: string;
  consorcioId: string;
  rtAnterior: string;
  rtNuevo: string;
  usuario: string;
  fecha: string;
}

/** Colores y textos de la leyenda: un solo lugar, para que el mapa, la lista y la leyenda no se desalineen. */
export const COLORES_SEMAFORO: Record<ColorSemaforo, { hex: string; etiqueta: string; significado: string }> = {
  verde: { hex: '#16a34a', etiqueta: 'Verde', significado: 'Inspeccionado este mes, o pendiente del día 1 al 10' },
  amarillo: { hex: '#eab308', etiqueta: 'Amarillo', significado: 'Pendiente del día 11 al 20' },
  rojo: { hex: '#dc2626', etiqueta: 'Rojo', significado: 'Pendiente del día 21 en adelante' },
};

export const ORDEN_COLORES: ColorSemaforo[] = ['rojo', 'amarillo', 'verde'];

/**
 * Une el semáforo con las ubicaciones. Los edificios sin ubicación no se pueden dibujar: se devuelven aparte para
 * avisarlo, en vez de dejarlos desaparecer del mapa sin decir nada. El mapa sólo recibe edificios.
 */
export function marcadoresSemaforo(
  edificios: SemaforoEdificio[],
  ubicaciones: Pick<ConsorcioMapaItem, 'id' | 'ubicacion'>[],
): { marcadores: MarcadorMapa[]; sinUbicacion: SemaforoEdificio[] } {
  const porId = new Map(ubicaciones.map((u) => [u.id, u.ubicacion]));
  const marcadores: MarcadorMapa[] = [];
  const sinUbicacion: SemaforoEdificio[] = [];
  for (const e of edificios) {
    const ubicacion = porId.get(e.id);
    if (!ubicacion) {
      sinUbicacion.push(e);
      continue;
    }
    marcadores.push({
      id: e.id,
      etiqueta: e.nombre,
      subtitulo: `${COLORES_SEMAFORO[e.color].etiqueta}: ${e.estado}`,
      ubicacion,
      color: COLORES_SEMAFORO[e.color].hex,
      colorNombre: e.color,
    });
  }
  return { marcadores, sinUbicacion };
}

/** "carla — 0 pendientes" / "beto — 1 pendiente": el texto de cada opción del selector. */
export function textoCandidato(c: RtCandidato): string {
  return `${c.nombre} — ${c.pendientes} ${c.pendientes === 1 ? 'pendiente' : 'pendientes'}`;
}

/** AAAA-MM-DD → "25/11/2026", sin pasar por Date (que lo correría un día según la zona horaria). */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Instante ISO → "25/11/2026 14:30", en la hora del navegador. */
export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** El texto de error que dejó la API (`message`, o la lista `errores`), o uno genérico con el código. */
export async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { message?: unknown; errores?: unknown };
    if (Array.isArray(cuerpo.errores) && cuerpo.errores.length > 0) return cuerpo.errores.join(' · ');
    if (typeof cuerpo.message === 'string' && cuerpo.message !== '') return cuerpo.message;
  } catch {
    /* el cuerpo no era JSON */
  }
  return `${porDefecto} (error ${res.status})`;
}

const conFecha = (fecha?: string) => (fecha ? `?fecha=${encodeURIComponent(fecha)}` : '');

/** El resultado de una llamada; si la API respondió con error, también el código HTTP (para distinguir un 409). */
export type ResultadoApi<T> = FetchResult<T> & { status?: number };

async function pedir<T>(url: string, porDefecto: string, init?: RequestInit, conSesion = false): Promise<ResultadoApi<T>> {
  try {
    const res = conSesion ? await fetchConSesion(url, init) : await fetch(url, init);
    if (!res.ok) return { ok: false, error: await mensajeDeError(res, porDefecto), status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

export function fetchSemaforo(fecha?: string): Promise<FetchResult<SemaforoRespuesta>> {
  return pedir(`/api/semaforo${conFecha(fecha)}`, 'No se pudo cargar el semáforo', undefined, true);
}

export function fetchSugerencia(consorcioId: string, fecha?: string): Promise<FetchResult<SugerenciaReasignacion>> {
  return pedir(
    `/api/semaforo/${consorcioId}/reasignacion/sugerencia${conFecha(fecha)}`,
    'No se pudo obtener la sugerencia',
    undefined,
    true,
  );
}

export function confirmarReasignacion(
  consorcioId: string,
  datos: { rtAnterior: string; rtNuevo: string; fecha?: string },
): Promise<ResultadoApi<RegistroReasignacion>> {
  return pedir(
    `/api/semaforo/${consorcioId}/reasignacion`,
    'No se pudo aplicar la reasignación',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) },
    true,
  );
}

export function fetchHistorialReasignaciones(consorcioId: string): Promise<FetchResult<RegistroReasignacion[]>> {
  return pedir(`/api/semaforo/${consorcioId}/reasignaciones`, 'No se pudo cargar el historial', undefined, true);
}

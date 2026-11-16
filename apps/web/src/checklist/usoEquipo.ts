import { type EstadoEquipoUso } from './checklist.config';

/** ¿El RT ya respondió si el equipo está en uso? Mientras no responda no se puede avanzar con las solapas (HU-17 RF-02). */
export function usoRespondido(estadoPorEquipo: Record<string, EstadoEquipoUso>, maquinaId: string): boolean {
  return estadoPorEquipo[maquinaId] !== undefined;
}

export interface BorradorParada {
  causa: string;
  /** Fotos adjuntas (data URL). */
  fotos: readonly string[];
}

/** «Guardar Reporte de Parada» se habilita sólo con una causa escrita y al menos una foto (HU-17 RF-03, criterio 1). */
export function puedeGuardarParada(borrador: BorradorParada | undefined): boolean {
  return !!borrador && borrador.causa.trim() !== '' && borrador.fotos.length > 0;
}

/**
 * El pin de un edificio sale del mapa del RT recién cuando todos sus equipos están resueltos: inspeccionados o reportados como parados
 * (HU-17 RF-03, criterio 3). Un edificio sin equipos no se da por resuelto.
 */
export function edificioResuelto(equiposDelEdificio: readonly string[], resueltos: ReadonlySet<string>): boolean {
  return equiposDelEdificio.length > 0 && equiposDelEdificio.every((id) => resueltos.has(id));
}

export interface ReporteParadaGuardado {
  id: string;
  estado: string;
  avisadoA: string[];
}

/** Manda el reporte de parada a la API. Devuelve el reporte guardado o el motivo del error. */
export async function enviarReporteParada(
  maquinaId: string,
  borrador: BorradorParada,
  enviar: (url: string, init: RequestInit) => Promise<Response>,
): Promise<{ ok: true; reporte: ReporteParadaGuardado } | { ok: false; error: string }> {
  try {
    const res = await enviar('/api/paradas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinaId, causa: borrador.causa.trim(), fotos: borrador.fotos }),
    });
    const json = (await res.json()) as { message?: string; errores?: string[] } & ReporteParadaGuardado;
    if (!res.ok) return { ok: false, error: json.errores?.join(' · ') || json.message || `No se pudo guardar el reporte (error ${res.status})` };
    return { ok: true, reporte: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

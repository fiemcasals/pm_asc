import { RtCandidato, RtDisponible } from './reasignacion.types';
import { RtCalleAsignado, SemaforoEdificio } from './semaforo.types';

/**
 * ¿Este RT de la terna es el usuario? El RLS (migración 009) reconoce al RT de un edificio si su nombre de usuario
 * es igual al `nombre` o al `email` de la terna, comparación exacta. Se usa la misma regla para contar.
 */
export function esElRt(rt: RtCalleAsignado | null, usuario: string): boolean {
  return rt !== null && (rt.nombre === usuario || rt.email === usuario);
}

/** Edificios de este RT que siguen pendientes (no inspeccionados) en el mes. */
export function contarPendientes(edificios: SemaforoEdificio[], usuario: string): number {
  return edificios.filter((e) => e.estado === 'pendiente' && esElRt(e.rtCalle, usuario)).length;
}

/** Del menos al más cargado; a igual carga, por nombre de usuario, para que el desempate sea siempre el mismo. */
export function candidatosConCarga(disponibles: RtDisponible[], edificios: SemaforoEdificio[]): RtCandidato[] {
  return disponibles
    .map((d) => ({ ...d, pendientes: contarPendientes(edificios, d.usuario) }))
    .sort((a, b) => a.pendientes - b.pendientes || a.usuario.localeCompare(b.usuario, 'es'));
}

/** Los candidatos sin el RT actual (reasignar al mismo no es reasignar) y el sugerido: el de menos pendientes. */
export function sugerirRt(
  disponibles: RtDisponible[],
  edificios: SemaforoEdificio[],
  rtActual: RtCalleAsignado | null,
): { sugerido: RtCandidato | null; candidatos: RtCandidato[] } {
  const candidatos = candidatosConCarga(disponibles, edificios).filter((c) => !esElRt(rtActual, c.usuario));
  return { sugerido: candidatos[0] ?? null, candidatos };
}

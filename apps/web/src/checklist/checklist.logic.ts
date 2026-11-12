import {
  CHECKLIST_VERSION,
  obtenerChecklistParaTipo,
  requiereFotoChecklist,
  type ChecklistMotorConfig,
  type ChecklistSolapaConfig,
  type EstadoEquipoUso,
  type SolapaId,
  type TipoMaquinaChecklist,
} from './checklist.config';
import { type FotoAnomalia } from './fotos';

export type RespuestasSolapa = Record<string, string>;
export type RespuestasChecklist = Partial<Record<SolapaId, RespuestasSolapa>>;
export type ObservacionesChecklist = Partial<Record<SolapaId, string>>;
export type FotosPorEquipo = Record<string, FotoAnomalia>;

export function claveFotoAnomalia(solapaId: SolapaId, itemId: string): string {
  return `${solapaId}:${itemId}`;
}

export function contarRespondidosSolapa(
  solapa: ChecklistSolapaConfig,
  respuestas: RespuestasSolapa = {},
): { respondidos: number; total: number } {
  let total = 0;
  let respondidos = 0;
  for (const sub of solapa.subgrupos) {
    for (const item of sub.items) {
      total += 1;
      const elegida = respuestas[item.id];
      if (elegida && item.opciones.some((o) => o.id === elegida)) {
        respondidos += 1;
      }
    }
  }
  return { respondidos, total };
}

/**
 * Evalúa si una solapa está completa y si falta alguna foto obligatoria
 * (Falla Crítica o equipo Fuera de Servicio; fallas comunes no bloquean sin foto).
 */
export function evaluarEstadoSolapa(
  solapa: ChecklistSolapaConfig,
  respuestas: RespuestasSolapa = {},
  fotos: FotosPorEquipo = {},
  estadoEquipo: EstadoEquipoUso = 'en_uso',
): {
  completa: boolean;
  faltanFotosObligatorias: string[];
  respondidos: number;
  total: number;
} {
  let total = 0;
  let respondidos = 0;
  const faltanFotosObligatorias: string[] = [];

  for (const sub of solapa.subgrupos) {
    for (const item of sub.items) {
      total += 1;
      const elegidaId = respuestas[item.id];
      const opcion = item.opciones.find((o) => o.id === elegidaId);
      if (opcion) {
        respondidos += 1;
        const exigePorOpcion = requiereFotoChecklist(opcion, 'en_uso');
        const exigePorFueraServicio = opcion.esFalla && estadoEquipo === 'fuera_de_servicio';
        if ((exigePorOpcion || exigePorFueraServicio) && !fotos[claveFotoAnomalia(solapa.id, item.id)]) {
          faltanFotosObligatorias.push(item.id);
        }
      }
    }
  }

  return {
    completa: total > 0 && respondidos === total && faltanFotosObligatorias.length === 0,
    faltanFotosObligatorias,
    respondidos,
    total,
  };
}

/** Una solapa queda completa (tilde) sólo cuando todos sus ítems aplicables están respondidos y sin fotos críticas faltantes. */
export function esSolapaCompleta(
  solapa: ChecklistSolapaConfig,
  respuestas: RespuestasSolapa = {},
  fotos: FotosPorEquipo = {},
  estadoEquipo: EstadoEquipoUso = 'en_uso',
): boolean {
  return evaluarEstadoSolapa(solapa, respuestas, fotos, estadoEquipo).completa;
}

/** Carga el motor configurable desde la API con respaldo local de la misma versión. */
export async function fetchChecklistConfig(tipo: TipoMaquinaChecklist): Promise<ChecklistMotorConfig> {
  try {
    const res = await fetch(`/api/checklist/config?tipo=${encodeURIComponent(tipo)}`);
    if (!res.ok) return obtenerChecklistParaTipo(tipo);
    const data = (await res.json()) as ChecklistMotorConfig;
    if (!data || !Array.isArray(data.solapas) || data.solapas.length === 0) {
      return obtenerChecklistParaTipo(tipo);
    }
    return data;
  } catch {
    return obtenerChecklistParaTipo(tipo);
  }
}

export { CHECKLIST_VERSION };

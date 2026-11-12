import {
  CHECKLIST_VERSION,
  obtenerChecklistParaTipo,
  type ChecklistMotorConfig,
  type ChecklistSolapaConfig,
  type TipoMaquinaChecklist,
} from './checklist.config';

export type RespuestasSolapa = Record<string, string>;
export type RespuestasChecklist = Partial<Record<ChecklistSolapaConfig['id'], RespuestasSolapa>>;
export type ObservacionesChecklist = Partial<Record<ChecklistSolapaConfig['id'], string>>;

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

/** Una solapa queda completa (tilde) sólo cuando todos los ítems que aplican al equipo tienen respuesta. */
export function esSolapaCompleta(
  solapa: ChecklistSolapaConfig,
  respuestas: RespuestasSolapa = {},
): boolean {
  const { respondidos, total } = contarRespondidosSolapa(solapa, respuestas);
  return total > 0 && respondidos === total;
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


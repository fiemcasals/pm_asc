import {
  type ChecklistMotorConfig,
  type ChecklistSolapaConfig,
  type SolapaId,
  type TipoMaquinaChecklist,
} from './checklist.config';
import { type RespuestasChecklist } from './checklist.logic';

export interface EquipoInspeccion {
  maquinaId: string;
  firmanteMaquinaId?: string;
  referenciaAgc: string;
  descripcion: string;
  tipo: TipoMaquinaChecklist;
  salaCompartidaId: string | null;
  salaCompartidaNombre?: string;
}

export const EQUIPOS_EDIFICIO_DEMO: readonly EquipoInspeccion[] = [
  {
    maquinaId: 'demo-m1',
    firmanteMaquinaId: 'MAQ-CALLAO-M1',
    referenciaAgc: 'M1',
    descripcion: 'Principal Tracción',
    tipo: 'traccion',
    salaCompartidaId: 'sala-principal',
    salaCompartidaNombre: 'Sala Principal',
  },
  {
    maquinaId: 'demo-m2',
    firmanteMaquinaId: 'MAQ-CORRIENTES-M1',
    referenciaAgc: 'M2',
    descripcion: 'Servicio Hidráulico',
    tipo: 'hidraulico',
    salaCompartidaId: 'sala-principal',
    salaCompartidaNombre: 'Sala Principal',
  },
  {
    maquinaId: 'demo-m3',
    firmanteMaquinaId: 'MAQ-CORRIENTES-M2',
    referenciaAgc: 'M3',
    descripcion: 'Montavehículos',
    tipo: 'montavehiculos',
    salaCompartidaId: null,
  },
];

export function esItemEntornoSala(
  config: ChecklistMotorConfig,
  solapaId: SolapaId,
  itemId: string,
): boolean {
  const solapa = config.solapas.find((s) => s.id === solapaId);
  if (!solapa) return false;
  for (const sub of solapa.subgrupos) {
    const item = sub.items.find((i) => i.id === itemId);
    if (item) {
      return Boolean(item.esEntornoSala || sub.esEntornoCompartido);
    }
  }
  return false;
}

/**
 * Registra una respuesta en el equipo activo y, si el ítem pertenece al entorno
 * de una sala compartida, la replica en los demás equipos de esa misma sala.
 */
export function aplicarRespuestaConSalaCompartida(params: {
  prevRespuestasPorEquipo: Record<string, RespuestasChecklist>;
  equipos: readonly EquipoInspeccion[];
  equipoActivoId: string;
  config: ChecklistMotorConfig;
  solapaId: SolapaId;
  itemId: string;
  opcionId: string;
}): {
  respuestasPorEquipo: Record<string, RespuestasChecklist>;
  propagadoAEquipos: string[];
} {
  const {
    prevRespuestasPorEquipo,
    equipos,
    equipoActivoId,
    config,
    solapaId,
    itemId,
    opcionId,
  } = params;

  const equipoActivo = equipos.find((e) => e.maquinaId === equipoActivoId);
  const esEntorno = esItemEntornoSala(config, solapaId, itemId);
  const salaId = equipoActivo?.salaCompartidaId ?? null;

  const destinos =
    esEntorno && salaId
      ? equipos.filter((e) => e.salaCompartidaId === salaId).map((e) => e.maquinaId)
      : [equipoActivoId];

  const siguiente = { ...prevRespuestasPorEquipo };
  for (const maquinaId of destinos) {
    const eqPrev = siguiente[maquinaId] ?? {};
    const solPrev = eqPrev[solapaId] ?? {};
    siguiente[maquinaId] = {
      ...eqPrev,
      [solapaId]: {
        ...solPrev,
        [itemId]: opcionId,
      },
    };
  }

  return {
    respuestasPorEquipo: siguiente,
    propagadoAEquipos: destinos.filter((id) => id !== equipoActivoId),
  };
}

export function obtenerSiguienteSolapa(
  solapas: readonly ChecklistSolapaConfig[],
  solapaActivaId: SolapaId,
): ChecklistSolapaConfig | null {
  const idx = solapas.findIndex((s) => s.id === solapaActivaId);
  if (idx < 0 || idx >= solapas.length - 1) return null;
  return solapas[idx + 1];
}

export function obtenerSolapaAnterior(
  solapas: readonly ChecklistSolapaConfig[],
  solapaActivaId: SolapaId,
): ChecklistSolapaConfig | null {
  const idx = solapas.findIndex((s) => s.id === solapaActivaId);
  if (idx <= 0) return null;
  return solapas[idx - 1];
}

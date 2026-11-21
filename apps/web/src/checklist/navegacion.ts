import { CLAVE_INSPECCION_RT } from '../auth/sesion';
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

/** Lo que la pantalla de inspección necesita saber del edificio cuya visita inició el RT: sus equipos y sus pisos (HU-17 RF-10). */
export interface EdificioInspeccion {
  consorcioId?: string;
  nombre?: string;
  equipos: readonly EquipoInspeccion[];
  pisos?: readonly string[] | null;
}

interface MaquinaDeFicha {
  id: string;
  referenciaAgc: string;
  descripcion?: string | null;
  tipo?: TipoMaquinaChecklist;
  salaCompartidaId?: string | null;
}

/**
 * Los equipos del edificio a partir de las máquinas de su ficha (HU-17 RF-02): cada uno con su referencia AGC y su tipo (por defecto,
 * tracción). Los que comparten sala de máquinas se agrupan por su `salaCompartidaId`; los demás tienen sala propia.
 */
export function equiposDeFicha(maquinas: readonly MaquinaDeFicha[]): EquipoInspeccion[] {
  return maquinas.map((m) => ({
    maquinaId: m.id,
    firmanteMaquinaId: m.id,
    referenciaAgc: m.referenciaAgc,
    descripcion: m.descripcion?.trim() || '',
    tipo: m.tipo ?? 'traccion',
    salaCompartidaId: m.salaCompartidaId || null,
    salaCompartidaNombre: m.salaCompartidaId ? `Sala ${m.salaCompartidaId}` : undefined,
  }));
}


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

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Guarda el edificio cuya visita inició el RT (HU-17 RF-10). Si no hay lugar para guardar, la inspección sigue igual. */
export function guardarEdificioEnInspeccion(usuario: string, edificio: EdificioInspeccion | null, almacen: Almacen | undefined = globalThis.localStorage): void {
  try {
    if (edificio) almacen?.setItem(CLAVE_INSPECCION_RT, JSON.stringify({ usuario, edificio }));
    else almacen?.removeItem(CLAVE_INSPECCION_RT);
  } catch {
    // almacenamiento lleno o bloqueado
  }
}

/** El edificio en inspección guardado por ese usuario, o null (otro usuario, nada guardado o dato dañado). */
export function leerEdificioEnInspeccion(usuario: string, almacen: Almacen | undefined = globalThis.localStorage): EdificioInspeccion | null {
  try {
    const g = JSON.parse(almacen?.getItem(CLAVE_INSPECCION_RT) ?? 'null') as { usuario?: string; edificio?: EdificioInspeccion } | null;
    return g && g.usuario === usuario && g.edificio && Array.isArray(g.edificio.equipos) ? g.edificio : null;
  } catch {
    return null;
  }
}

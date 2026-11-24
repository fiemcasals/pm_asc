import { type EstadoEquipoUso, type SolapaId, type TipoMaquinaChecklist } from './checklist.config';
import { type FotoAnomalia } from './fotos';

/**
 * Fotos que el RT saca en cada equipo en uso aunque no haya ninguna falla (HU-17 RF-11, decisión del 23/11/2026): el frente de cabina y
 * botonera, y los cables de tracción en los equipos que los tienen. Son las que el Portal Firmante exige para autorizar la visita.
 *
 * Viajan en el informe dentro de `fotos` de cada equipo, con las claves reservadas `obligatoria:frente` y `obligatoria:cables`, con el mismo
 * formato que las fotos de anomalía; así se guardan sin señal con el resto del borrador y quedan selladas con el informe.
 */
export type FotoObligatoriaId = 'frente' | 'cables';

export interface FotoObligatoriaConfig {
  id: FotoObligatoriaId;
  /** Cómo se le nombra al RT en la pantalla. */
  etiqueta: string;
  /** Qué tiene que verse en la foto. */
  ayuda: string;
  /** Solapa a la que pertenece lo que se fotografía (se guarda en la foto, como en las de anomalía). */
  solapaId: SolapaId;
}

export const FOTOS_OBLIGATORIAS: Record<FotoObligatoriaId, FotoObligatoriaConfig> = {
  frente: {
    id: 'frente',
    etiqueta: 'Frente de cabina y botonera',
    ayuda: 'Que se vea la puerta de cabina y la botonera, de frente.',
    solapaId: 'cabina',
  },
  cables: {
    id: 'cables',
    etiqueta: 'Cables de tracción',
    ayuda: 'Que se vean los cables de tracción, con su estado.',
    solapaId: 'sala_maquinas',
  },
};

/** Prefijo de las claves reservadas, para distinguirlas de las fotos de anomalía (`solapa:item`). */
export const PREFIJO_FOTO_OBLIGATORIA = 'obligatoria:';

export function claveFotoObligatoria(id: FotoObligatoriaId): string {
  return `${PREFIJO_FOTO_OBLIGATORIA}${id}`;
}

/**
 * Qué fotos obligatorias lleva un equipo en uso según su tipo. Los hidráulicos no tienen cables de tracción: sólo la del frente.
 * Tracción y montavehículos llevan las dos.
 */
export function fotosObligatoriasDelTipo(tipo: TipoMaquinaChecklist): FotoObligatoriaId[] {
  return tipo === 'hidraulico' ? ['frente'] : ['frente', 'cables'];
}

/** Las que le faltan a un equipo. Un equipo fuera de servicio no las necesita (ya lleva su reporte de parada con fotos). */
export function fotosObligatoriasFaltantes(
  tipo: TipoMaquinaChecklist,
  estado: EstadoEquipoUso,
  fotos: Record<string, FotoAnomalia | undefined> = {},
): FotoObligatoriaId[] {
  if (estado === 'fuera_de_servicio') return [];
  return fotosObligatoriasDelTipo(tipo).filter((id) => !fotos[claveFotoObligatoria(id)]?.dataUrl);
}

/** La foto como se guarda en el celular y viaja en el informe: el mismo formato que una foto de anomalía. */
export function nuevaFotoObligatoria(
  id: FotoObligatoriaId,
  equipo: { maquinaId: string; referenciaAgc: string },
  imagen: { dataUrl: string; sizeBytes: number },
  ahora: Date = new Date(),
): FotoAnomalia {
  const cfg = FOTOS_OBLIGATORIAS[id];
  return {
    id: `foto-${ahora.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    maquinaId: equipo.maquinaId,
    referenciaAgc: equipo.referenciaAgc,
    solapaId: cfg.solapaId,
    itemId: claveFotoObligatoria(id),
    itemEtiqueta: cfg.etiqueta,
    dataUrl: imagen.dataUrl,
    sizeBytes: imagen.sizeBytes,
    tomadaEn: ahora.toISOString(),
  };
}

/**
 * Las fotos que viajan en el informe: si el RT sacó la de cables y después cambió el tipo a hidráulico, esa foto ya no corresponde al equipo
 * y no se manda (el informe lleva sólo lo que el equipo exige).
 */
export function fotosParaElInforme<T extends Record<string, FotoAnomalia | undefined>>(tipo: TipoMaquinaChecklist, fotos: T): T {
  if (tipo !== 'hidraulico') return fotos;
  const { [claveFotoObligatoria('cables')]: _sobra, ...resto } = fotos;
  return resto as T;
}

/** «el frente de cabina y botonera», «los cables de tracción»: para decir qué foto falta en una frase. */
export function etiquetasDeFaltantes(ids: readonly FotoObligatoriaId[]): string {
  return ids.map((id) => FOTOS_OBLIGATORIAS[id].etiqueta.toLowerCase()).join(' y ');
}

/** Códigos de fallas críticas: incluye los 2 base de HU-06 y el motor HU-17. */
export type FallaCritica = 'CABLES_DESGASTADOS' | 'LIMITADOR_ANULADO' | (string & {});

/** Una falla crítica con su nombre legible y la zona de la máquina donde se detectó (HU-06 RF-03). */
export interface FallaCriticaDetalle {
  codigo: FallaCritica;
  /** Por ejemplo "Paracaídas: Anomalía". */
  nombre: string;
  /** Identificador de la zona: sala_maquinas, cabina, accesos, caja o fosa. */
  zonaId: string;
  /** Por ejemplo "Sala de Máquinas". */
  zona: string;
}

/** Lo que manda el RT de calle al cargar el informe de una máquina. */
export interface InformeFallaInput {
  clientReportId?: string;
  maquinaId: string;
  inspector: string;
  cablesDesgastados: boolean;
  limitadorAnulado: boolean;
  fallasCriticas?: FallaCritica[];
  observaciones?: string;
  fotografias?: string[];
}

export interface InformeFalla {
  id: string;
  clientReportId?: string;
  maquinaId: string;
  codigoAGC: string;
  nombreMaquina: string;
  edificio: {
    direccion: string;
    consorcio: string;
  };
  eca: string;
  inspector: string;
  cablesDesgastados: boolean;
  limitadorAnulado: boolean;
  observaciones: string;
  fotografias: string[];
  /** Vacío si el informe no trae ninguna falla crítica. */
  fallasCriticas: FallaCritica[];
  /** Las mismas fallas críticas con su nombre legible y su zona, en el orden de las zonas del checklist. */
  fallasCriticasDetalle: FallaCriticaDetalle[];
  /** Fallas que el cliente no considera críticas: se registran pero no generan alerta. */
  fallasComunes: string[];
  registradoEn: string;
  /** Ruta de sólo lectura del informe (no registra acuses legales). */
  enlaceInforme: string;
  /** El Firmante asignado al edificio (HU-06 RF-04): es quien recibe la alerta en su portal. */
  firmanteUsername: string;
  /** Quién abrió la alerta primero y cuándo (HU-06 RF-04); null mientras nadie la abrió. */
  abiertaPor: string | null;
  abiertaEn: string | null;
}

/** Lo que se avisa por el canal cuando alguien abre una alerta: detiene la alarma en todas las pantallas. */
export interface EventoAperturaFalla {
  tipo: 'falla-abierta';
  informeId: string;
  abiertaPor: string;
  abiertaEn: string;
}

/** Lo que viaja por el canal en tiempo real hacia el panel de Secretaría. */
export interface EventoFallaCritica {
  tipo: 'falla-critica';
  informeId: string;
  maquinaId: string;
  codigoAGC: string;
  nombreMaquina: string;
  direccion: string;
  consorcio: string;
  eca: string;
  inspector: string;
  fallas: FallaCritica[];
  /** Cada falla crítica con su nombre legible, agrupable por zona. */
  fallasDetalle: FallaCriticaDetalle[];
  registradoEn: string;
  enlaceInforme: string;
  firmanteUsername: string;
  abiertaPor: string | null;
  abiertaEn: string | null;
}

export interface RegistrarInformeResponse {
  informe: InformeFalla;
  /** true si el informe traía una falla crítica y se emitió el evento en tiempo real. */
  eventoEmitido: boolean;
}

/** Las dos fallas que la HU-06 define como críticas. */
export type FallaCritica = 'CABLES_DESGASTADOS' | 'LIMITADOR_ANULADO';

/** Lo que manda el RT de calle al cargar el informe de una máquina. */
export interface InformeFallaInput {
  maquinaId: string;
  inspector: string;
  cablesDesgastados: boolean;
  limitadorAnulado: boolean;
  observaciones?: string;
  fotografias?: string[];
}

export interface InformeFalla {
  id: string;
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
  registradoEn: string;
  /** Ruta de sólo lectura del informe (no registra acuses legales). */
  enlaceInforme: string;
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
  registradoEn: string;
  enlaceInforme: string;
}

export interface RegistrarInformeResponse {
  informe: InformeFalla;
  /** true si el informe traía una falla crítica y se emitió el evento en tiempo real. */
  eventoEmitido: boolean;
}

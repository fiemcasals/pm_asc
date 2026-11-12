export const TIPOS_MAQUINA = ['traccion', 'hidraulico', 'montavehiculos'] as const;

export type TipoMaquina = (typeof TIPOS_MAQUINA)[number];

export interface PuntoGeografico {
  latitud: number;
  longitud: number;
}

export interface Encargado {
  nombre: string | null;
  telefono: string | null;
}

export interface Administracion {
  nombre: string | null;
  telefono: string | null;
  email: string | null;
}

export interface MaquinaInput {
  /** Referencia con que la nombra la AGC: M1, M2, ... */
  referenciaAgc: string;
  /** Descripción libre: Derecha, Izquierda, ... */
  descripcion: string | null;
  /** Tipo técnico de la máquina, determina ítems aplicables del checklist. */
  tipo: TipoMaquina;
  /** Identificador de sala compartida dentro del edificio (ej.: "sala-1"), o null si es individual. */
  salaCompartidaId: string | null;
}

/** Lo que el cliente manda al crear o reemplazar un consorcio, ya validado y normalizado. */
export interface ConsorcioInput {
  nombre: string;
  direccion: string;
  administracion: Administracion;
  encargado: Encargado;
  pisos: string[];
  ubicacion: PuntoGeografico | null;
  maquinas: MaquinaInput[];
}

export interface Maquina extends MaquinaInput {
  id: string;
}

/** La ficha completa de un edificio: dirección, administración, datos operativos y máquinas. */
export interface Consorcio {
  id: string;
  nombre: string;
  direccion: string;
  administracion: Administracion;
  encargado: Encargado;
  pisos: string[];
  ubicacion: PuntoGeografico | null;
  maquinas: Maquina[];
  createdAt: string;
  updatedAt: string;
}

/** Fila del listado: lo justo para elegir un consorcio. */
export interface ConsorcioResumen {
  id: string;
  nombre: string;
  direccion: string;
  cantidadMaquinas: number;
}

/** Consorcio georreferenciado para vistas de mapa (excluye edificios sin ubicación). */
export interface ConsorcioMapaItem extends ConsorcioResumen {
  ubicacion: PuntoGeografico;
}

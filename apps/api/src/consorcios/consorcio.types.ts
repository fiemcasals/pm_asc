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
}

/** Lo que el cliente manda al crear o reemplazar un consorcio, ya validado y normalizado. */
export interface ConsorcioInput {
  nombre: string;
  direccion: string;
  administracion: Administracion;
  maquinas: MaquinaInput[];
}

export interface Maquina extends MaquinaInput {
  id: string;
}

/** La ficha completa de un edificio: dirección, administración y máquinas. */
export interface Consorcio {
  id: string;
  nombre: string;
  direccion: string;
  administracion: Administracion;
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

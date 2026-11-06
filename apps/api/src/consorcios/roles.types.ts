/** Persona o empresa a cargo de un rol, ya validada: siempre tiene al menos un contacto. */
export interface ResponsableInput {
  nombre: string;
  telefono: string | null;
  email: string | null;
}

/** La terna que el cliente manda en PUT /api/consorcios/:id/roles. Se reemplaza entera. */
export interface RolesInput {
  rtCalle: ResponsableInput;
  firmante: ResponsableInput;
  eca: ResponsableInput;
}

export interface Responsable extends ResponsableInput {
  /** Porcentaje operativo del rol. `null` cuando el rol no tiene uno definido (ECA). */
  porcentaje: number | null;
}

/** Los roles de un edificio. Cada rol y `actualizadoEn` son `null` si todavía no se asignó la terna. */
export interface RolesEdificio {
  consorcioId: string;
  rtCalle: Responsable | null;
  firmante: Responsable | null;
  eca: Responsable | null;
  actualizadoEn: string | null;
}

/**
 * Porcentajes operativos que fija la definición de la Tarea: RT de Calle 60% y Firmante 25%.
 * Para la ECA no hay porcentaje definido, por eso es `null` y no un valor deducido.
 */
export const PORCENTAJES_OPERATIVOS = { rtCalle: 60, firmante: 25, eca: null } as const;

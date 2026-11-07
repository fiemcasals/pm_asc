import type { FetchResult } from './consorcios';

export interface Responsable {
  nombre: string;
  telefono: string | null;
  email: string | null;
  porcentaje: number | null;
}

export interface RolesEdificio {
  consorcioId: string;
  rtCalle: Responsable | null;
  firmante: Responsable | null;
  eca: Responsable | null;
  actualizadoEn: string | null;
}

export type ClaveRol = 'rtCalle' | 'firmante' | 'eca';

/** Los textos de los selectores, en un solo lugar: los porcentajes son los que define la Tarea. */
export const ROLES_DE_TRABAJO: { clave: ClaveRol; etiqueta: string }[] = [
  { clave: 'rtCalle', etiqueta: 'RT Calle (60%)' },
  { clave: 'firmante', etiqueta: 'Firmante AGC (25%)' },
  { clave: 'eca', etiqueta: 'ECA Responsable' },
];

export interface DatosResponsable {
  nombre: string;
  telefono: string;
  email: string;
}

export type FormularioRoles = Record<ClaveRol, DatosResponsable>;
export type DirectorioRoles = Record<ClaveRol, DatosResponsable[]>;

function datosDe(responsable: Responsable | null): DatosResponsable {
  return {
    nombre: responsable?.nombre ?? '',
    telefono: responsable?.telefono ?? '',
    email: responsable?.email ?? '',
  };
}

export function formularioDesdeRoles(roles: RolesEdificio): FormularioRoles {
  return {
    rtCalle: datosDe(roles.rtCalle),
    firmante: datosDe(roles.firmante),
    eca: datosDe(roles.eca),
  };
}

export function ternaAsignada(roles: RolesEdificio | undefined): boolean {
  return Boolean(roles?.rtCalle && roles.firmante && roles.eca);
}

/**
 * Las opciones de cada selector: quienes ya ocupan ese rol en algún edificio. El sistema no tiene
 * un padrón de personas, así que sale de las ternas guardadas. Si un nombre se repite con contactos
 * distintos, gana la asignación más reciente.
 */
export function directorioPorRol(roles: RolesEdificio[]): DirectorioRoles {
  const recientes = [...roles].sort((a, b) =>
    (b.actualizadoEn ?? '').localeCompare(a.actualizadoEn ?? ''),
  );
  const opciones = (clave: ClaveRol): DatosResponsable[] => {
    const porNombre = new Map<string, DatosResponsable>();
    for (const edificio of recientes) {
      const responsable = edificio[clave];
      if (!responsable) continue;
      const id = responsable.nombre.toLowerCase();
      if (!porNombre.has(id)) porNombre.set(id, datosDe(responsable));
    }
    return [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  };
  return { rtCalle: opciones('rtCalle'), firmante: opciones('firmante'), eca: opciones('eca') };
}

function cuerpoResponsable(datos: DatosResponsable) {
  return {
    nombre: datos.nombre.trim(),
    telefono: datos.telefono.trim() || null,
    email: datos.email.trim() || null,
  };
}

export async function fetchRoles(consorcioId: string): Promise<FetchResult<RolesEdificio>> {
  try {
    const res = await fetch(`/api/consorcios/${encodeURIComponent(consorcioId)}/roles`);
    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: no se pudieron obtener los roles` };
    }
    return { ok: true, data: (await res.json()) as RolesEdificio };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

export async function guardarRoles(
  consorcioId: string,
  formulario: FormularioRoles,
): Promise<FetchResult<RolesEdificio>> {
  try {
    const res = await fetch(`/api/consorcios/${encodeURIComponent(consorcioId)}/roles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rtCalle: cuerpoResponsable(formulario.rtCalle),
        firmante: cuerpoResponsable(formulario.firmante),
        eca: cuerpoResponsable(formulario.eca),
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.message || 'Error al guardar los roles',
        errores: Array.isArray(json.errores) ? json.errores : undefined,
      };
    }
    return { ok: true, data: json as RolesEdificio };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

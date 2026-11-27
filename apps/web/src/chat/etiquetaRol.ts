// Cómo se nombra cada rol en el chat (insignia junto al nombre y en la lista de conversaciones).
// HU-19 RF-03: la Secretaría figura como contacto, así que su rol tiene que leerse bien («Secretaría»), no como el valor interno.
const ETIQUETAS: Record<string, string> = {
  firmante: 'Ing. Legal',
  rt_calle: 'Técnico RT',
  administrador: 'Admin',
  secretaria: 'Secretaría',
};

export function etiquetaDeRol(rol?: string | null): string {
  if (!rol) return '';
  return ETIQUETAS[rol] ?? rol;
}

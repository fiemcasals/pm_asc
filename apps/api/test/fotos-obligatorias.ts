/**
 * Las fotos obligatorias de un equipo en uso (HU-18 RF-02): una imagen mínima con la clave reservada de cada una, para armar informes
 * válidos en las pruebas. Las claves se escriben a mano, a propósito: si cambian en la API, las pruebas tienen que enterarse.
 */
export const JPG_OBLIGATORIA = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';

type TipoEquipo = 'traccion' | 'hidraulico' | 'montavehiculos';

export function fotosObligatorias(tipo: TipoEquipo = 'traccion'): Record<string, { dataUrl: string }> {
  const fotos: Record<string, { dataUrl: string }> = { 'obligatoria:frente': { dataUrl: JPG_OBLIGATORIA } };
  if (tipo !== 'hidraulico') fotos['obligatoria:cables'] = { dataUrl: JPG_OBLIGATORIA };
  return fotos;
}

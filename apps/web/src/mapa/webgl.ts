/** ¿Este dispositivo puede dibujar el mapa? MapLibre necesita WebGL; sin él se muestra un aviso en lugar de un recuadro roto. */
export function soportaWebGL(documento: Pick<Document, 'createElement'> = document): boolean {
  try {
    const lienzo = documento.createElement('canvas');
    return !!(lienzo.getContext('webgl2') || lienzo.getContext('webgl'));
  } catch {
    return false;
  }
}

import { type SolapaId } from './checklist.config';

export const MAX_FOTO_BYTES = 500 * 1024;

export interface FotoAnomalia {
  id: string;
  maquinaId: string;
  referenciaAgc: string;
  solapaId: SolapaId;
  itemId: string;
  itemEtiqueta: string;
  dataUrl: string;
  sizeBytes: number;
  tomadaEn: string;
}

export function calcularTamanoBase64Bytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Loop puro de compresión JPEG sobre una función generadora de DataURL para validar tope <= 500 KB. */
export function comprimirDataUrlHastaTope(
  generarJpeg: (escala: number, calidad: number) => string,
  maxBytes: number = MAX_FOTO_BYTES,
): { dataUrl: string; sizeBytes: number } {
  const escalas = [1, 0.75, 0.55, 0.4];
  const calidades = [0.82, 0.65, 0.5, 0.35, 0.22];

  let ultimoUrl = '';
  let ultimoSize = Number.MAX_SAFE_INTEGER;

  for (const escala of escalas) {
    for (const calidad of calidades) {
      const dataUrl = generarJpeg(escala, calidad);
      const sizeBytes = calcularTamanoBase64Bytes(dataUrl);
      ultimoUrl = dataUrl;
      ultimoSize = sizeBytes;
      if (sizeBytes <= maxBytes) {
        return { dataUrl, sizeBytes };
      }
    }
  }

  if (ultimoSize <= maxBytes) {
    return { dataUrl: ultimoUrl, sizeBytes: ultimoSize };
  }
  throw new Error(`No se pudo comprimir la foto por debajo de ${Math.round(maxBytes / 1024)} KB`);
}

function leerArchivoComoDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada'));
    reader.readAsDataURL(file);
  });
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Archivo de imagen inválido'));
    img.src = src;
  });
}

/** Comprime la fotografía de campo vía Canvas JPEG garantizando tamaño <= 500 KB. */
export async function comprimirFotoAnomalia(
  archivo: Blob,
  maxBytes: number = MAX_FOTO_BYTES,
): Promise<{ dataUrl: string; sizeBytes: number }> {
  const originalDataUrl = await leerArchivoComoDataUrl(archivo);
  const originalBytes = calcularTamanoBase64Bytes(originalDataUrl);

  if (typeof document === 'undefined') {
    if (originalBytes <= maxBytes) return { dataUrl: originalDataUrl, sizeBytes: originalBytes };
    throw new Error('Compresión Canvas no disponible fuera del navegador');
  }

  const img = await cargarImagen(originalDataUrl);
  const maxDim = 1280;
  const ratioBase = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));

  return comprimirDataUrlHastaTope((escala, calidad) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.width || 800) * ratioBase * escala));
    canvas.height = Math.max(1, Math.round((img.height || 600) * ratioBase * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (originalBytes <= maxBytes) return originalDataUrl;
      throw new Error('Contexto 2D no disponible para comprimir imagen');
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', calidad);
  }, maxBytes);
}

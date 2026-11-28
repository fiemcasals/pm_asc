import { LADO_MAXIMO_FOTO, LIMITE_FOTO_BYTES, OBJETIVO_FOTO_BYTES } from './limites';

// HU-19 RF-05 — la foto del chat se reduce en el dispositivo antes de enviarla: lado mayor de 1.600 px, en JPEG, apuntando a menos de 500 KB.
// Una foto de celular (4000 × 3000, 5 MB) viajaba entera dentro de cada mensaje; ahora sale a 1600 × 1200 y unos 200 a 400 KB.

/** Las calidades JPEG que se prueban, de mejor a peor: se queda con la primera que pesa menos de OBJETIVO_FOTO_BYTES. */
export const CALIDADES_FOTO = [0.82, 0.72, 0.62, 0.5] as const;

export const MENSAJE_NO_ES_IMAGEN = 'El archivo elegido no es una imagen. Elegí una foto (JPG, PNG o WEBP).';
export const MENSAJE_NO_SE_PUDO_ABRIR = 'No se pudo abrir la foto elegida. Probá con otra foto (JPG, PNG o WEBP).';
export const MENSAJE_DEMASIADO_PESADA = `La foto es demasiado pesada aun reducida (puede pesar hasta ${Math.round(LIMITE_FOTO_BYTES / 1024)} KB). Probá con otra foto.`;

export type FotoPreparada =
  | { ok: true; dataUrl: string; bytes: number; ancho: number; alto: number; calidad: number }
  | { ok: false; motivo: string };

/** El tamaño de la foto reducida: el lado mayor queda en `maximo` (si ya era más chica, no se agranda) y se mantiene la proporción. */
export function medidasReducidas(ancho: number, alto: number, maximo = LADO_MAXIMO_FOTO): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (!(mayor > maximo)) return { ancho, alto };
  const escala = maximo / mayor;
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/** Cuántos bytes ocupa la imagen de un `data:...;base64,...` (lo mismo que cuenta la API). */
export function bytesDeDataUrl(dataUrl: string): number {
  const datos = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const relleno = datos.endsWith('==') ? 2 : datos.endsWith('=') ? 1 : 0;
  return Math.floor((datos.length * 3) / 4) - relleno;
}

/** ¿El archivo elegido dice ser una imagen? (lo que el navegador informa del tipo: image/jpeg, image/png, image/heic…) */
export function esArchivoDeImagen(tipo: string | undefined | null): boolean {
  return typeof tipo === 'string' && tipo.startsWith('image/');
}

/**
 * Decide la foto que se envía. `abrir` lee la imagen y devuelve su tamaño (o null si no se pudo leer); `codificar` la dibuja reducida y la devuelve
 * como JPEG con esa calidad. Separado así para poder probarlo sin navegador.
 */
export async function prepararFoto(
  tipo: string | undefined | null,
  abrir: () => Promise<{ ancho: number; alto: number } | null>,
  codificar: (ancho: number, alto: number, calidad: number) => Promise<string>,
): Promise<FotoPreparada> {
  if (!esArchivoDeImagen(tipo)) return { ok: false, motivo: MENSAJE_NO_ES_IMAGEN };
  let original: { ancho: number; alto: number } | null = null;
  try {
    original = await abrir();
  } catch {
    original = null;
  }
  if (!original || !(original.ancho > 0) || !(original.alto > 0)) return { ok: false, motivo: MENSAJE_NO_SE_PUDO_ABRIR };
  const { ancho, alto } = medidasReducidas(original.ancho, original.alto);
  let mejor: { dataUrl: string; bytes: number; calidad: number } | null = null;
  for (const calidad of CALIDADES_FOTO) {
    let dataUrl: string;
    try {
      dataUrl = await codificar(ancho, alto, calidad);
    } catch {
      return { ok: false, motivo: MENSAJE_NO_SE_PUDO_ABRIR };
    }
    if (!dataUrl.startsWith('data:image/jpeg;base64,')) return { ok: false, motivo: MENSAJE_NO_SE_PUDO_ABRIR };
    mejor = { dataUrl, bytes: bytesDeDataUrl(dataUrl), calidad };
    if (mejor.bytes < OBJETIVO_FOTO_BYTES) break;
  }
  if (!mejor || mejor.bytes > LIMITE_FOTO_BYTES) return { ok: false, motivo: MENSAJE_DEMASIADO_PESADA };
  return { ok: true, ...mejor, ancho, alto };
}

/** Lo mismo, con el navegador: lee el archivo (respetando la orientación de la foto), lo dibuja reducido en un lienzo y lo pasa a JPEG. */
export async function reducirFoto(archivo: File): Promise<FotoPreparada> {
  let imagen: ImageBitmap | null = null;
  try {
    return await prepararFoto(
      archivo.type,
      async () => {
        imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
        return { ancho: imagen.width, alto: imagen.height };
      },
      async (ancho, alto, calidad) => {
        const lienzo = document.createElement('canvas');
        lienzo.width = ancho;
        lienzo.height = alto;
        const ctx = lienzo.getContext('2d');
        if (!ctx || !imagen) throw new Error('sin lienzo');
        ctx.fillStyle = '#ffffff'; // una foto PNG con transparencias queda sobre blanco y no sobre negro
        ctx.fillRect(0, 0, ancho, alto);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(imagen, 0, 0, ancho, alto);
        return lienzo.toDataURL('image/jpeg', calidad);
      },
    );
  } finally {
    (imagen as ImageBitmap | null)?.close();
  }
}

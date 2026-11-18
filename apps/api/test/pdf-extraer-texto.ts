import { inflateSync } from 'node:zlib';

// Los signos de la codificación WinAnsi (cp1252) que no coinciden con Latin-1: la fuente estándar del PDF los guarda en 0x80-0x9F.
const CP1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž',
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

const aTexto = (bytes: Buffer): string => Array.from(bytes, (b) => CP1252[b] ?? String.fromCharCode(b)).join('');

/**
 * Lee el texto que un PDF generado con pdfkit y fuentes estándar dibuja de verdad: descomprime los flujos de contenido y junta
 * los textos de cada operación (`Tj` / `TJ`) tal como los vería quien abre el documento. Una línea por operación de texto.
 * Sirve para comprobar QUÉ dice el PDF, no sólo que existe (HU-10 RF-07).
 */
export function textoDelPdf(pdf: Buffer): string {
  const binario = pdf.toString('latin1');
  const lineas: string[] = [];
  for (const flujo of binario.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let contenido: string;
    try {
      contenido = inflateSync(Buffer.from(flujo[1], 'latin1')).toString('latin1');
    } catch {
      continue; // no es un flujo de contenido comprimido (imágenes, fuentes)
    }
    for (const op of contenido.matchAll(/\[((?:\s*(?:<[0-9a-fA-F]*>|\([^)]*\)|-?\d+(?:\.\d+)?))+)\s*\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g)) {
      const trozos = op[1]
        ? [...op[1].matchAll(/<([0-9a-fA-F]*)>|\(((?:\\.|[^)\\])*)\)/g)].map((t) => (t[1] !== undefined ? aTexto(Buffer.from(t[1], 'hex')) : t[2]))
        : [aTexto(Buffer.from(op[2], 'hex'))];
      lineas.push(trozos.join(''));
    }
  }
  return lineas.join('\n');
}

/**
 * Texto seguro para el PDF del remito (HU-10 RF-07).
 *
 * El PDF usa la fuente estándar Helvetica, que sólo tiene los caracteres de la codificación WinAnsi (Latin-1 más unos pocos signos de
 * puntuación). Cualquier otro carácter —un emoji, un símbolo, una letra de otro alfabeto— no se puede dibujar y sale como basura
 * («⚠️» salía como «& þ»). Todo texto que viene de los datos pasa por acá antes de imprimirse.
 */

// Los signos de la codificación WinAnsi (cp1252) que están fuera de Latin-1: comillas tipográficas, guiones largos, viñeta, euro, etc.
const ESPECIALES_WIN_ANSI = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d,
  0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** ¿La fuente estándar puede dibujar este carácter? (ASCII imprimible, Latin-1 sin el guion blando, y los signos de WinAnsi). */
export function esImprimibleEnPdf(codePoint: number): boolean {
  return (codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff && codePoint !== 0xad) || ESPECIALES_WIN_ANSI.has(codePoint);
}

/**
 * Deja sólo lo que el PDF puede dibujar, sin cambiar lo demás:
 * - emojis, símbolos, marcadores invisibles y caracteres de control se descartan (el resto del texto queda igual);
 * - una letra con acento que la fuente no tiene se reemplaza por su letra base («ő» → «o»); una letra de otro alfabeto, por «?»,
 *   para que quien lee sepa que ahí había algo y no se pierda en silencio;
 * - se conservan los saltos de línea, se juntan los espacios repetidos y se recortan los bordes.
 * Acepta cualquier valor (null y undefined dan un texto vacío).
 */
export function textoParaPdf(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  let salida = '';
  for (const c of texto.normalize('NFC')) {
    const cp = c.codePointAt(0) as number;
    if (c === '\n') salida += '\n';
    else if (c === '\t') salida += ' ';
    else if (esImprimibleEnPdf(cp)) salida += c;
    else if (/[\p{L}\p{N}]/u.test(c)) {
      const base = c.normalize('NFD').replace(/\p{M}/gu, '');
      salida += base !== '' && [...base].every((b) => esImprimibleEnPdf(b.codePointAt(0) as number)) ? base : '?';
    }
    // Todo lo demás (emojis, símbolos, marcas, controles, invisibles) no se dibuja.
  }
  return salida
    .replace(/ {2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

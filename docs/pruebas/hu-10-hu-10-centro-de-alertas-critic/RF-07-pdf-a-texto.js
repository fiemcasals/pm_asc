#!/usr/bin/env node
// Imprime el texto que un PDF del remito (pdfkit, fuentes estándar) dibuja de verdad, una línea por operación de texto.
// Uso: node RF-07-pdf-a-texto.js archivo.pdf
// Lo usa RF-07-entrega.sh para comprobar QUÉ dice el documento (no sólo que existe). Sin dependencias.
const fs = require('fs');
const { inflateSync } = require('zlib');

// Los signos de la codificación WinAnsi (cp1252) que no coinciden con Latin-1.
const CP1252 = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž',
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};
const aTexto = (bytes) => Array.from(bytes, (b) => CP1252[b] ?? String.fromCharCode(b)).join('');

const binario = fs.readFileSync(process.argv[2]).toString('latin1');
const lineas = [];
for (const flujo of binario.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
  let contenido;
  try {
    contenido = inflateSync(Buffer.from(flujo[1], 'latin1')).toString('latin1');
  } catch {
    continue;
  }
  for (const op of contenido.matchAll(/\[((?:\s*(?:<[0-9a-fA-F]*>|\([^)]*\)|-?\d+(?:\.\d+)?))+)\s*\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g)) {
    const trozos = op[1]
      ? [...op[1].matchAll(/<([0-9a-fA-F]*)>|\(((?:\\.|[^)\\])*)\)/g)].map((t) => (t[1] !== undefined ? aTexto(Buffer.from(t[1], 'hex')) : t[2]))
      : [aTexto(Buffer.from(op[2], 'hex'))];
    lineas.push(trozos.join(''));
  }
}
process.stdout.write(lineas.join('\n') + '\n');

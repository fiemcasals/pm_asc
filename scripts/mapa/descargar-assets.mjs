// Baja las tipografías y los íconos que necesita el estilo del mapa y los deja en apps/web/public/mapa/,
// para que el mapa no le pida nada a un servidor de terceros (HU-16 RF-03).
//
//   node scripts/mapa/descargar-assets.mjs
//
// Fuente: https://github.com/protomaps/basemaps-assets, en un commit fijo. Licencias: las tipografías son
// SIL Open Font License y los íconos derivan de tangrams/icons (MIT); sus textos quedan junto a los archivos.
// Solo se bajan los rangos de caracteres latinos (el castellano entra en 0-255): un nombre con un carácter
// fuera de esos rangos se dibuja sin ese carácter, y no rompe el mapa.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const COMMIT = '028c18f713baecad011301ff7a69acc39bcc2ae7';
const BASE = `https://raw.githubusercontent.com/protomaps/basemaps-assets/${COMMIT}`;
const DESTINO = resolve(import.meta.dirname, '..', '..', 'apps', 'web', 'public', 'mapa');

const TIPOGRAFIAS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
const RANGOS = ['0-255', '256-511', '8192-8447'];
const SPRITES = ['light', 'dark'].flatMap((f) => [`${f}.json`, `${f}.png`, `${f}@2x.json`, `${f}@2x.png`]);

const archivos = [
  ...TIPOGRAFIAS.flatMap((t) => RANGOS.map((r) => ({ origen: `fonts/${t}/${r}.pbf`, destino: `fuentes/${t}/${r}.pbf` }))),
  ...SPRITES.map((s) => ({ origen: `sprites/v4/${s}`, destino: `sprites/${s}` })),
  { origen: 'fonts/OFL.txt', destino: 'fuentes/OFL.txt' },
  { origen: 'sprites/LICENSE.md', destino: 'sprites/LICENSE.md', opcional: true },
];

let bytes = 0;
for (const a of archivos) {
  const url = `${BASE}/${a.origen.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (a.opcional) { console.log(`(sin ${a.origen}: ${res.status})`); continue; }
    throw new Error(`No se pudo bajar ${a.origen}: HTTP ${res.status}`);
  }
  const datos = Buffer.from(await res.arrayBuffer());
  const ruta = resolve(DESTINO, a.destino);
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, datos);
  bytes += datos.length;
  console.log(`${a.destino}  ${(datos.length / 1024).toFixed(0)} KB`);
}
console.log(`\n${archivos.length} archivos, ${(bytes / 1024 / 1024).toFixed(2)} MB en ${DESTINO}`);

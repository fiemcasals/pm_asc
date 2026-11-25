// Genera el mapa base de CABA para usar sin conexión (HU-16 RF-03).
//
//   node scripts/mapa/generar-mapa-caba.mjs                       # último build de Protomaps, zoom 0 a 15
//   node scripts/mapa/generar-mapa-caba.mjs --build 20261118      # un build puntual
//   node scripts/mapa/generar-mapa-caba.mjs --maxzoom 14          # si el archivo pesa demasiado
//
// Lee la compilación diaria de Protomaps (datos de OpenStreetMap, ODbL) con pedidos de rango, así que baja solo los
// mosaicos que caen en el recuadro de CABA y no los ~140 GB del planeta, y escribe un archivo PMTiles v3 en
// apps/web/public/mapa/caba.pmtiles. El archivo VA en el repositorio (HU-16 RF-06): sin él el sitio desplegado dibuja los mapas vacíos. Para actualizarlo, correr este script y subir el resultado.
// Es lo mismo que hace `pmtiles extract`, pero en Node, para no depender de un ejecutable externo.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { FetchSource, PMTiles, zxyToTileId } from 'pmtiles';

// Mismo recuadro que usaba el mapa dibujado a mano (apps/web/src/consorcios/MapaUbicacionConsorcio.tsx).
const CABA = { oeste: -58.535, sur: -34.705, este: -58.335, norte: -34.525 };

const args = process.argv.slice(2);
const arg = (nombre, defecto) => { const i = args.indexOf(`--${nombre}`); return i >= 0 ? args[i + 1] : defecto; };
const MAXZOOM = Number(arg('maxzoom', '15'));
const CONCURRENCIA = Number(arg('concurrencia', '6'));
const SALIDA = resolve(arg('salida', resolve(import.meta.dirname, '..', '..', 'apps', 'web', 'public', 'mapa', 'caba.pmtiles')));

function mosaicosDelRecuadro(z) {
  const n = 2 ** z;
  const x = (lon) => Math.floor(((lon + 180) / 360) * n);
  const y = (lat) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const x0 = Math.max(0, x(CABA.oeste)), x1 = Math.min(n - 1, x(CABA.este));
  const y0 = Math.max(0, y(CABA.norte)), y1 = Math.min(n - 1, y(CABA.sur));
  const lista = [];
  for (let xx = x0; xx <= x1; xx++) for (let yy = y0; yy <= y1; yy++) lista.push({ z, x: xx, y: yy });
  return lista;
}

/** Los bytes del mosaico sin comprimir, venga o no comprimido con gzip. */
const crudo = (ab) => { const b = Buffer.from(ab); return b.length > 2 && b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; };

function varint(n) {
  const bytes = [];
  while (n >= 0x80) { bytes.push((n % 0x80) | 0x80); n = Math.floor(n / 0x80); }
  bytes.push(n);
  return bytes;
}

/** Directorio PMTiles v3: cantidad, ids en deltas, largos de corrida, largos y desplazamientos (0 = contiguo al anterior). */
function serializarDirectorio(entradas) {
  const b = [...varint(entradas.length)];
  let anterior = 0;
  for (const e of entradas) { b.push(...varint(e.tileId - anterior)); anterior = e.tileId; }
  for (const e of entradas) b.push(...varint(e.corrida));
  for (const e of entradas) b.push(...varint(e.largo));
  entradas.forEach((e, i) => {
    const contiguo = i > 0 && e.desplazamiento === entradas[i - 1].desplazamiento + entradas[i - 1].largo;
    b.push(...varint(contiguo ? 0 : e.desplazamiento + 1));
  });
  return Buffer.from(b);
}

function escribirCabecera(c) {
  const h = Buffer.alloc(127);
  h.write('PMTiles', 0, 'latin1');
  h.writeUInt8(3, 7);
  const u64 = (pos, v) => h.writeBigUInt64LE(BigInt(v), pos);
  u64(8, c.dirRaiz.desplazamiento); u64(16, c.dirRaiz.largo);
  u64(24, c.metadatos.desplazamiento); u64(32, c.metadatos.largo);
  u64(40, c.hojas.desplazamiento); u64(48, c.hojas.largo);
  u64(56, c.datos.desplazamiento); u64(64, c.datos.largo);
  u64(72, c.cantidad); u64(80, c.cantidad); u64(88, c.cantidad);
  h.writeUInt8(1, 96); // clustered
  h.writeUInt8(2, 97); // compresión interna: gzip
  h.writeUInt8(2, 98); // compresión de los mosaicos: gzip
  h.writeUInt8(1, 99); // tipo: MVT
  h.writeUInt8(c.minZoom, 100); h.writeUInt8(c.maxZoom, 101);
  const e7 = (v) => Math.round(v * 1e7);
  h.writeInt32LE(e7(CABA.oeste), 102); h.writeInt32LE(e7(CABA.sur), 106);
  h.writeInt32LE(e7(CABA.este), 110); h.writeInt32LE(e7(CABA.norte), 114);
  h.writeUInt8(12, 118);
  h.writeInt32LE(e7((CABA.oeste + CABA.este) / 2), 119); h.writeInt32LE(e7((CABA.sur + CABA.norte) / 2), 123);
  return h;
}

async function ultimoBuild() {
  const res = await fetch('https://build-metadata.protomaps.dev/builds.json');
  if (!res.ok) throw new Error(`No se pudo leer la lista de compilaciones de Protomaps: HTTP ${res.status}`);
  const lista = await res.json();
  return lista[lista.length - 1].key;
}

async function conReintentos(fn, intentos = 4) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= intentos) throw e;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}

const buildClave = arg('build') ? `${arg('build')}.pmtiles` : await ultimoBuild();
const origenUrl = `https://build.protomaps.com/${buildClave}`;
console.log(`Origen: ${origenUrl}`);
console.log(`Recuadro de CABA: oeste ${CABA.oeste}, sur ${CABA.sur}, este ${CABA.este}, norte ${CABA.norte} · zoom 0 a ${MAXZOOM}`);

const origen = new PMTiles(new FetchSource(origenUrl));
const cabeceraOrigen = await origen.getHeader();
if (cabeceraOrigen.tileType !== 1) throw new Error(`El origen no es de mosaicos vectoriales (tileType ${cabeceraOrigen.tileType})`);
const metadatosOrigen = await origen.getMetadata();

const pedidos = [];
for (let z = 0; z <= MAXZOOM; z++) pedidos.push(...mosaicosDelRecuadro(z));
console.log(`Mosaicos a pedir: ${pedidos.length}`);

const mosaicos = [];
let hechos = 0;
let siguiente = 0;
async function trabajador() {
  while (siguiente < pedidos.length) {
    const p = pedidos[siguiente++];
    const r = await conReintentos(() => origen.getZxy(p.z, p.x, p.y));
    if (r && r.data && r.data.byteLength > 0) mosaicos.push({ ...p, tileId: zxyToTileId(p.z, p.x, p.y), datos: gzipSync(crudo(r.data), { level: 9 }) });
    hechos++;
    if (hechos % 100 === 0 || hechos === pedidos.length) process.stdout.write(`\r  ${hechos}/${pedidos.length} mosaicos`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
console.log(`\nMosaicos con datos: ${mosaicos.length}`);
if (mosaicos.length === 0) throw new Error('No se bajó ningún mosaico');

mosaicos.sort((a, b) => a.tileId - b.tileId);
let desplazamiento = 0;
const entradas = mosaicos.map((m) => { const e = { tileId: m.tileId, corrida: 1, largo: m.datos.length, desplazamiento }; desplazamiento += m.datos.length; return e; });
const datos = Buffer.concat(mosaicos.map((m) => m.datos));

const dirRaiz = gzipSync(serializarDirectorio(entradas), { level: 9 });
if (dirRaiz.length > 16384 - 127) throw new Error(`El directorio raíz (${dirRaiz.length} bytes) no entra en los primeros 16 KB: hay que usar directorios hoja`);
const metadatos = gzipSync(Buffer.from(JSON.stringify({
  ...metadatosOrigen,
  name: 'Mapa base de CABA',
  description: 'Recorte de CABA de la compilación de Protomaps (datos de OpenStreetMap), para usar sin conexión.',
  attribution: '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
  build: buildClave,
  generado: new Date().toISOString(),
  recuadro: CABA,
})), { level: 9 });

const dirRaizPos = 127;
const metadatosPos = dirRaizPos + dirRaiz.length;
const hojasPos = metadatosPos + metadatos.length;
const datosPos = hojasPos;
const cabecera = escribirCabecera({
  dirRaiz: { desplazamiento: dirRaizPos, largo: dirRaiz.length },
  metadatos: { desplazamiento: metadatosPos, largo: metadatos.length },
  hojas: { desplazamiento: hojasPos, largo: 0 },
  datos: { desplazamiento: datosPos, largo: datos.length },
  cantidad: entradas.length,
  minZoom: 0,
  maxZoom: MAXZOOM,
});
const archivo = Buffer.concat([cabecera, dirRaiz, metadatos, datos]);

await mkdir(dirname(SALIDA), { recursive: true });
await writeFile(SALIDA, archivo);

// Verificación: se vuelve a leer con la misma librería que usa el mapa y se compara un mosaico por zoom.
const fuente = { getKey: () => 'caba', getBytes: async (pos, largo) => { const t = archivo.subarray(pos, pos + largo); return { data: t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength) }; } };
const leido = new PMTiles(fuente);
const h = await leido.getHeader();
let comparados = 0;
for (let z = 0; z <= MAXZOOM; z++) {
  const m = mosaicos.find((q) => q.z === z);
  if (!m) continue;
  const a = await leido.getZxy(m.z, m.x, m.y);
  const b = await origen.getZxy(m.z, m.x, m.y);
  if (!a || !b || createHash('sha256').update(crudo(a.data)).digest('hex') !== createHash('sha256').update(crudo(b.data)).digest('hex')) throw new Error(`El mosaico ${m.z}/${m.x}/${m.y} no coincide con el original`);
  comparados++;
}
console.log(`Verificación: cabecera v${h.specVersion ?? 3}, zoom ${h.minZoom} a ${h.maxZoom}, ${comparados} mosaicos releídos e idénticos al original`);
const porZoom = {};
for (const m of mosaicos) porZoom[m.z] = (porZoom[m.z] ?? 0) + m.datos.length;
console.log('Tamaño por zoom (MB):', Object.entries(porZoom).map(([z, b]) => `${z}:${(b / 1048576).toFixed(2)}`).join(' '));
console.log(`\nArchivo: ${SALIDA}\nTamaño: ${(archivo.length / 1048576).toFixed(2)} MB · ${entradas.length} mosaicos · build ${buildClave}`);

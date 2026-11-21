import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PMTiles } from 'pmtiles';
import { describe, expect, it } from 'vitest';
import { BlobSource } from './fuenteBlob';
import { soportaWebGL } from './webgl';

const ARCHIVO = fileURLToPath(new URL('../../public/mapa/caba.pmtiles', import.meta.url));

describe('BlobSource', () => {
  it('entrega el rango pedido del archivo guardado, sin tocar la red', async () => {
    const bytes = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
    const fuente = new BlobSource(new Blob([bytes]), 'caba');
    expect(fuente.getKey()).toBe('caba');
    const { data } = await fuente.getBytes(10, 5);
    expect(Array.from(new Uint8Array(data))).toEqual([10, 11, 12, 13, 14]);
    const { data: final } = await fuente.getBytes(98, 10); // pedir de más no rompe: devuelve lo que hay
    expect(Array.from(new Uint8Array(final))).toEqual([98, 99]);
  });

  // Necesita el archivo generado con `npm run mapa:generar`; sin él se omite en lugar de fallar.
  it.skipIf(!existsSync(ARCHIVO))('lee el mapa real de CABA con la librería que lo dibuja: cabecera, zoom y un mosaico', async () => {
    const contenido = readFileSync(ARCHIVO);
    const mapa = new PMTiles(new BlobSource(new Blob([contenido]), 'caba'));
    const cabecera = await mapa.getHeader();
    expect(cabecera.minZoom).toBe(0);
    expect(cabecera.maxZoom).toBe(15);
    expect(cabecera.minLon).toBeCloseTo(-58.535, 3);
    expect(cabecera.maxLat).toBeCloseTo(-34.525, 3);
    const z = 12;
    const n = 2 ** z;
    const lon = -58.435;
    const lat = -34.615; // el centro de CABA
    const x = Math.floor(((lon + 180) / 360) * n);
    const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
    const mosaico = await mapa.getZxy(z, x, y);
    expect(mosaico?.data.byteLength ?? 0).toBeGreaterThan(1000);
    expect(contenido.length).toBeLessThanOrEqual(60 * 1048576); // el objetivo de la tarea: 60 MB o menos
  });
});

describe('soportaWebGL', () => {
  it('es verdadero si el navegador entrega un contexto WebGL y falso si no, o si falla', () => {
    const con = { createElement: () => ({ getContext: (t: string) => (t === 'webgl2' ? {} : null) }) } as unknown as Document;
    const sin = { createElement: () => ({ getContext: () => null }) } as unknown as Document;
    const roto = { createElement: () => { throw new Error('sin canvas'); } } as unknown as Document;
    expect(soportaWebGL(con)).toBe(true);
    expect(soportaWebGL(sin)).toBe(false);
    expect(soportaWebGL(roto)).toBe(false);
  });
});

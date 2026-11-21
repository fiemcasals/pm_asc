import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ATRIBUCION } from './config';
import { estiloMapa, temaDelDocumento } from './estilo';

const PUBLICO = fileURLToPath(new URL('../../public/mapa/', import.meta.url));
const ORIGEN = 'https://app.test';

describe('estilo del mapa', () => {
  it('pide las tipografías, los íconos y el mapa a la propia app o al protocolo pmtiles, y a nadie más', () => {
    const e = estiloMapa('light', ORIGEN, 'caba');
    expect(e.glyphs?.startsWith(`${ORIGEN}/mapa/fuentes/`)).toBe(true);
    expect(e.sprite).toBe(`${ORIGEN}/mapa/sprites/light`);
    const fuente = e.sources.protomaps as { url?: string };
    expect(fuente.url).toBe('pmtiles://caba');

    // Cualquier otra URL que aparezca (sin contar el texto HTML de la atribución) rompería el uso sin señal.
    const sinAtribucion = JSON.parse(JSON.stringify(e, (clave, valor) => (clave === 'attribution' ? undefined : valor))) as unknown;
    const urls = JSON.stringify(sinAtribucion).match(/(?:[a-z][a-z0-9+.-]*:)?\/\/[^"\\\s]+/gi) ?? [];
    expect(urls.length).toBeGreaterThanOrEqual(3); // glyphs, sprite y la fuente: si no aparecen, el test no está mirando nada
    for (const u of urls) expect(u.startsWith(ORIGEN) || u.startsWith('pmtiles://'), `URL de un tercero en el estilo: ${u}`).toBe(true);
  });

  it('cambia los íconos con el tema y deja las mismas capas', () => {
    const claro = estiloMapa('light', ORIGEN, 'caba');
    const oscuro = estiloMapa('dark', ORIGEN, 'caba');
    expect(claro.sprite).toBe(`${ORIGEN}/mapa/sprites/light`);
    expect(oscuro.sprite).toBe(`${ORIGEN}/mapa/sprites/dark`);
    expect(oscuro.layers.length).toBe(claro.layers.length);
    expect(claro.layers.length).toBeGreaterThan(50);
    expect(JSON.stringify(oscuro.layers)).not.toBe(JSON.stringify(claro.layers)); // los colores cambian
  });

  it('dibuja los nombres en castellano', () => {
    expect(JSON.stringify(estiloMapa('light', ORIGEN, 'caba').layers)).toContain('name:es');
  });

  it('las tipografías que usa el estilo están todas en public/mapa y los íconos de los dos temas también', () => {
    const e = estiloMapa('light', ORIGEN, 'caba');
    const usadas = new Set<string>();
    for (const capa of e.layers) {
      const fuentes = (capa as { layout?: Record<string, unknown> }).layout?.['text-font'];
      for (const m of JSON.stringify(fuentes ?? '').matchAll(/"(Noto Sans [^"]+)"/g)) usadas.add(m[1]);
    }
    expect([...usadas].sort()).toEqual(['Noto Sans Italic', 'Noto Sans Medium', 'Noto Sans Regular']);
    for (const f of usadas) expect(existsSync(`${PUBLICO}fuentes/${f}/0-255.pbf`), `falta la tipografía ${f}`).toBe(true);
    for (const tema of ['light', 'dark']) {
      for (const archivo of [`${tema}.json`, `${tema}.png`, `${tema}@2x.json`, `${tema}@2x.png`]) {
        expect(existsSync(`${PUBLICO}sprites/${archivo}`), `falta el ícono ${archivo}`).toBe(true);
      }
      const sprite = JSON.parse(readFileSync(`${PUBLICO}sprites/${tema}.json`, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(sprite).length).toBeGreaterThan(5);
    }
  });

  it('muestra la atribución de OpenStreetMap y la del estilo', () => {
    const fuente = estiloMapa('light', ORIGEN, 'caba').sources.protomaps as { attribution?: string };
    expect(fuente.attribution).toBe(ATRIBUCION);
    expect(ATRIBUCION).toContain('OpenStreetMap contributors');
    expect(ATRIBUCION).toContain('Protomaps');
  });
});

describe('temaDelDocumento', () => {
  it('sigue el data-theme de la app y, sin él, usa el claro', () => {
    expect(temaDelDocumento({ dataset: { theme: 'dark' } })).toBe('dark');
    expect(temaDelDocumento({ dataset: { theme: 'light' } })).toBe('light');
    expect(temaDelDocumento({ dataset: {} })).toBe('light');
  });
});

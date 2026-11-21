import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';
import { ATRIBUCION } from './config';

export type TemaMapa = 'light' | 'dark';

/** El tema del mapa sigue al de la app (`data-theme` en <html>). */
export function temaDelDocumento(raiz: Pick<HTMLElement, 'dataset'> = document.documentElement): TemaMapa {
  return raiz.dataset.theme === 'dark' ? 'dark' : 'light';
}

/**
 * Estilo del mapa: las capas de Protomaps (calles, manzanas, parques, agua y nombres, en castellano) sobre el
 * archivo de CABA. Las tipografías y los íconos salen de `/mapa/…`, de esta misma app: nada se le pide a un tercero,
 * porque sin señal no habría a quién pedírselo.
 *
 * @param origen   la dirección de la app (`https://…`); MapLibre pide las tipografías y los íconos con URL absoluta.
 * @param urlFuente  lo que va después de `pmtiles://`: la clave de la fuente guardada, o la URL del archivo en el servidor.
 */
export function estiloMapa(tema: TemaMapa, origen: string, urlFuente: string): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origen}/mapa/fuentes/{fontstack}/{range}.pbf`,
    sprite: `${origen}/mapa/sprites/${tema}`,
    sources: {
      protomaps: { type: 'vector', url: `pmtiles://${urlFuente}`, attribution: ATRIBUCION },
    },
    layers: layers('protomaps', namedFlavor(tema), { lang: 'es' }),
  };
}

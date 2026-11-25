// Constantes del mapa base de CABA (HU-16 RF-03). El archivo viene en el repositorio (HU-16 RF-06); para actualizarlo se genera con `npm run mapa:generar`, y las
// tipografías y los íconos con `npm run mapa:assets`; todo se sirve desde esta misma app, sin servidores de terceros.

/** El archivo con las calles de CABA (PMTiles). Va en el repositorio: sin él el sitio dibuja los mapas vacíos. Para actualizarlo: `npm run mapa:generar` y subirlo. */
export const URL_MAPA = '/mapa/caba.pmtiles';

/** Clave con la que se registra la fuente guardada en el celular en el protocolo `pmtiles://`. */
export const CLAVE_FUENTE = 'caba';

/** Caché del navegador donde queda el mapa descargado, y las claves con que se guarda. */
export const CACHE_MAPA = 'mant-asc-mapa-v1';
export const CLAVE_CACHE = '/mapa/caba.pmtiles';
export const CLAVE_CACHE_NUEVO = '/mapa/caba.pmtiles?nuevo';

/** Dónde se anota qué versión se bajó y cuándo. */
export const STORAGE_MAPA = 'mant_asc_mapa';

/** Recuadro de CABA con el que se generó el archivo (el mismo que el generador). */
export const CABA = { oeste: -58.535, sur: -34.705, este: -58.335, norte: -34.525 } as const;

/** [longitud, latitud] del centro de CABA, como los pide MapLibre. */
export const CENTRO_CABA: [number, number] = [-58.435, -34.615];

/** Zoom: el archivo tiene mosaicos hasta el 15; más cerca se agranda el 15 (hasta 17). */
export const ZOOM = { inicial: 11, min: 9, max: 17 } as const;

/**
 * Hasta dónde se puede arrastrar y alejar el mapa: el recuadro de CABA con un margen mínimo. El archivo solo tiene datos
 * ahí; con límites más amplios el mapa se podría alejar o correr hasta mostrar el blanco.
 */
export const LIMITES_DEL_MAPA: [[number, number], [number, number]] = [
  [CABA.oeste - 0.003, CABA.sur - 0.003],
  [CABA.este + 0.003, CABA.norte + 0.003],
];

/** Atribución obligatoria: datos de OpenStreetMap (ODbL) y estilo de Protomaps. */
export const ATRIBUCION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · ' +
  '<a href="https://github.com/protomaps/basemaps" target="_blank" rel="noopener">Protomaps</a>';

/** Textos de los controles de MapLibre en castellano (por defecto vienen en inglés). */
export const TEXTOS_DEL_MAPA: Record<string, string> = {
  'NavigationControl.ZoomIn': 'Acercar',
  'NavigationControl.ZoomOut': 'Alejar',
  'AttributionControl.ToggleAttribution': 'Mostrar u ocultar la atribución del mapa',
  'AttributionControl.MapFeedback': 'Comentarios sobre el mapa',
  'CooperativeGesturesHandler.WindowsHelpText': 'Usá Ctrl + la rueda del mouse para acercar el mapa',
  'CooperativeGesturesHandler.MacHelpText': 'Usá ⌘ + la rueda del mouse para acercar el mapa',
  'CooperativeGesturesHandler.MobileHelpText': 'Usá dos dedos para mover el mapa',
};

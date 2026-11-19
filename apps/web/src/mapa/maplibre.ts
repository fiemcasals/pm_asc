/**
 * Carga MapLibre cuando hace falta (pesa ~1 MB y la app no lo necesita hasta que se abre un mapa) y le dice dónde está su
 * worker. Sin esto, el servidor de desarrollo de Vite empaqueta la librería y MapLibre no encuentra el worker
 * («Worker failed to load»). En la versión compilada el worker queda como un archivo más de la app, que la PWA guarda
 * para que el mapa también se dibuje sin conexión.
 */
let cargado: Promise<typeof import('maplibre-gl')> | null = null;

export function cargarMapLibre(): Promise<typeof import('maplibre-gl')> {
  cargado ??= (async () => {
    const [ml, worker] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')]);
    ml.setWorkerUrl(worker.default);
    return ml;
  })();
  return cargado;
}

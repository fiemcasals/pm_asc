import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MapaMapLibre } from 'maplibre-gl';
import { CENTRO_CABA, CLAVE_FUENTE, LIMITES_DEL_MAPA, TEXTOS_DEL_MAPA, URL_MAPA, ZOOM } from './config';
import { ControlDescargaMapa } from './ControlDescargaMapa';
import { AvisoDelMapa, type EstadoMapaBase } from './AvisoDelMapa';
import { archivoDelServidor, dependenciasDelNavegador, leerMapaGuardado } from './descarga';
import { estiloMapa, temaDelDocumento } from './estilo';
import { BlobSource } from './fuenteBlob';
import { cargarMapLibre } from './maplibre';
import { soportaWebGL } from './webgl';
import './mapa.css';

export type { EstadoMapaBase } from './AvisoDelMapa';
export type OrigenMapa = 'guardado' | 'servidor';

export interface MapaBaseProps {
  testId?: string;
  /** Alto del mapa (CSS). Por defecto 360 px. */
  alto?: number | string;
  /** [longitud, latitud] */
  centro?: [number, number];
  zoom?: number;
  ariaLabel?: string;
  /** Muestra debajo del mapa el botón para bajarlo y usarlo sin señal. Por defecto, sí. */
  descarga?: boolean;
  /**
   * Para un mapa dentro de una página que se desplaza: la rueda del mouse sigue moviendo la página (se acerca con Ctrl + rueda) y en el
   * celular hacen falta dos dedos para mover el mapa. Sin esto el mapa le roba el desplazamiento a la página. Por defecto, no.
   */
  gestosCooperativos?: boolean;
  /** Se llama cuando el mapa base está dibujado, y de nuevo cada vez que cambia el estilo (el tema claro u oscuro). */
  onMapaListo?: (mapa: MapaMapLibre, motivo: 'inicial' | 'tema') => void;
}

// El protocolo `pmtiles://` se registra una sola vez por página.
let protocoloRegistrado: { agregar: (clave: string, fuente: import('pmtiles').Source) => void } | null = null;

async function registrarProtocolo(): Promise<NonNullable<typeof protocoloRegistrado>> {
  if (protocoloRegistrado) return protocoloRegistrado;
  const [ml, pm] = await Promise.all([cargarMapLibre(), import('pmtiles')]);
  const protocolo = new pm.Protocol();
  ml.addProtocol('pmtiles', protocolo.tile);
  protocoloRegistrado = { agregar: (_clave, fuente) => protocolo.add(new pm.PMTiles(fuente)) };
  return protocoloRegistrado;
}

/**
 * El mapa base de CABA: calles, manzanas, parques y nombres, con zoom y desplazamiento. Se dibuja sin conexión cuando el
 * mapa está guardado en el celular (ver ControlDescargaMapa); si no lo está y hay red, lee los mosaicos del servidor de
 * la app a medida que hacen falta. Sin red y sin mapa guardado, lo dice en lugar de dejar un recuadro roto.
 */
export function MapaBase({ testId = 'mapa-base', alto = 360, centro, zoom, ariaLabel = 'Mapa de CABA', descarga = true, gestosCooperativos = false, onMapaListo }: MapaBaseProps): React.JSX.Element {
  const lienzo = useRef<HTMLDivElement | null>(null);
  const alListo = useRef(onMapaListo);
  alListo.current = onMapaListo;
  const [estado, setEstado] = useState<EstadoMapaBase>('cargando');
  const [origen, setOrigen] = useState<OrigenMapa | null>(null);
  const [intento, setIntento] = useState(0);
  const lon = centro?.[0];
  const lat = centro?.[1];

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  useEffect(() => {
    const contenedor = lienzo.current;
    if (!contenedor) return;
    let cancelado = false;
    let mapa: MapaMapLibre | null = null;
    let observadorTema: MutationObserver | null = null;
    let observadorTamano: ResizeObserver | null = null;

    setEstado('cargando');
    void (async () => {
      if (!soportaWebGL()) {
        setEstado('sin-webgl');
        return;
      }
      const dep = dependenciasDelNavegador();
      const guardado = await leerMapaGuardado(dep);
      if (cancelado) return;
      if (!guardado && !navigator.onLine) {
        setEstado('sin-descargar');
        return;
      }
      // Sin copia guardada el mapa se lee del servidor: si el archivo no está (el servidor contesta con su página), se avisa en vez de dibujar vacío.
      if (!guardado && (await archivoDelServidor(dep)) === 'ausente') {
        if (!cancelado) setEstado('sin-archivo');
        return;
      }
      if (cancelado) return;

      try {
        const [ml, pm, protocolo] = await Promise.all([cargarMapLibre(), import('pmtiles'), registrarProtocolo(), import('maplibre-gl/dist/maplibre-gl.css')]);
        if (cancelado) return;

        const origenApp = window.location.origin;
        let urlFuente: string;
        if (guardado) {
          protocolo.agregar(CLAVE_FUENTE, new BlobSource(guardado, CLAVE_FUENTE));
          urlFuente = CLAVE_FUENTE;
          setOrigen('guardado');
        } else {
          const fuente = new pm.FetchSource(new URL(URL_MAPA, origenApp).href);
          protocolo.agregar(fuente.getKey(), fuente);
          urlFuente = fuente.getKey();
          setOrigen('servidor');
        }

        let tema = temaDelDocumento();
        mapa = new ml.Map({
          container: contenedor,
          style: estiloMapa(tema, origenApp, urlFuente),
          center: lon !== undefined && lat !== undefined ? [lon, lat] : CENTRO_CABA,
          zoom: zoom ?? ZOOM.inicial,
          minZoom: ZOOM.min,
          maxZoom: ZOOM.max,
          maxBounds: LIMITES_DEL_MAPA,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          cooperativeGestures: gestosCooperativos,
          locale: TEXTOS_DEL_MAPA,
        });
        mapa.touchZoomRotate.disableRotation();
        mapa.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');
        mapa.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');

        const mapaActual = mapa;
        // El centro y el zoom quedan en el DOM (data-centro, data-zoom): las pruebas los leen sin tocar el canvas.
        const publicarVista = () => {
          const caja = contenedor.parentElement;
          if (!caja) return;
          const c = mapaActual.getCenter();
          caja.dataset.centro = `${c.lng.toFixed(5)},${c.lat.toFixed(5)}`;
          caja.dataset.zoom = mapaActual.getZoom().toFixed(2);
        };
        mapaActual.on('moveend', publicarVista);
        mapaActual.once('load', () => {
          if (cancelado) return;
          publicarVista();
          setEstado('listo');
          alListo.current?.(mapaActual, 'inicial');
        });
        mapaActual.on('error', (ev) => {
          const mensaje = String((ev as { error?: { message?: string } }).error?.message ?? '');
          // Una tipografía o un ícono que falta no rompe el mapa; un mapa que no se puede leer sí.
          if (!guardado && !navigator.onLine && /Failed to fetch|NetworkError|Load failed/i.test(mensaje)) setEstado('sin-descargar');
        });

        // El mapa sigue al tema de la app: se cambia el estilo y se avisa para que se vuelvan a dibujar los pines.
        observadorTema = new MutationObserver(() => {
          const nuevo = temaDelDocumento();
          if (nuevo === tema || !mapa) return;
          tema = nuevo;
          mapa.setStyle(estiloMapa(nuevo, origenApp, urlFuente));
          const m = mapa;
          m.once('style.load', () => alListo.current?.(m, 'tema'));
        });
        observadorTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        observadorTamano = new ResizeObserver(() => mapa?.resize());
        observadorTamano.observe(contenedor);
      } catch {
        if (!cancelado) setEstado('error');
      }
    })();

    return () => {
      cancelado = true;
      observadorTema?.disconnect();
      observadorTamano?.disconnect();
      mapa?.remove();
    };
  }, [lon, lat, zoom, gestosCooperativos, intento]);

  // Al volver la conexión, un mapa que no se había podido dibujar se vuelve a intentar.
  useEffect(() => {
    if (estado !== 'sin-descargar') return;
    window.addEventListener('online', reintentar);
    return () => window.removeEventListener('online', reintentar);
  }, [estado, reintentar]);

  return (
    <div className="mapa-base-envoltorio">
      <div className="mapa-base" data-testid={testId} data-estado={estado} data-origen={origen ?? undefined} style={{ height: alto }}>
        <div ref={lienzo} className="mapa-base__lienzo" role="application" aria-label={ariaLabel} />
        <AvisoDelMapa estado={estado} onReintentar={reintentar} />
      </div>
      {descarga && <ControlDescargaMapa compacto onDescargado={reintentar} />}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapaMapLibre, Marker } from 'maplibre-gl';
import type { PuntoGeografico } from '../consorcios/consorcios';
import { MapaBase } from './MapaBase';
import { temaDelDocumento, type TemaMapa } from './estilo';
import { cargarMapLibre } from './maplibre';
import { COLOR_PIN_POR_DEFECTO, a6Decimales, aGeoJSON, claveDeMarcadores, etiquetaAccesible, limitesDe, type MarcadorMapa } from './marcadores';
import './mapa.css';

export type { MarcadorMapa } from './marcadores';

export interface MapaEdificiosProps {
  /** El edificio que se está viendo o editando (pin rojo). */
  ubicacion: PuntoGeografico | null;
  marcadores?: MarcadorMapa[];
  /** Tocar el mapa fija la ubicación y el pin se puede arrastrar para ajustarla. */
  editable?: boolean;
  onCambiarUbicacion?: (punto: PuntoGeografico | null) => void;
  testId?: string;
  /** Si se pasa, los pines se pueden elegir (clic o teclado) y devuelven el id del edificio. */
  onSeleccionarMarcador?: (id: string) => void;
  marcadorSeleccionadoId?: string | null;
  /** Alto del mapa (CSS). Por defecto 360 px. */
  alto?: number | string;
  /** Muestra debajo del mapa el botón para bajarlo y usarlo sin señal. Por defecto, no: lo ofrece la pantalla que lo necesita. */
  descarga?: boolean;
}

const FUENTE = 'edificios';
const CAPA_ETIQUETAS = 'edificios-etiquetas';
const ZOOM_UN_EDIFICIO = 15;

const COLORES_TEXTO: Record<TemaMapa, { texto: string; halo: string }> = {
  light: { texto: '#0f172a', halo: '#ffffff' },
  dark: { texto: '#f1f5f9', halo: '#0b0b0e' },
};

/** Las etiquetas de los edificios: las dibuja MapLibre, que oculta las que se pisan y deja primero las de mayor prioridad (los rojos). */
function instalarEtiquetas(mapa: MapaMapLibre, datos: ReturnType<typeof aGeoJSON>): void {
  const colores = COLORES_TEXTO[temaDelDocumento()];
  if (!mapa.getSource(FUENTE)) mapa.addSource(FUENTE, { type: 'geojson', data: datos as never });
  else (mapa.getSource(FUENTE) as GeoJSONSource).setData(datos as never);
  if (mapa.getLayer(CAPA_ETIQUETAS)) return;
  mapa.addLayer({
    id: CAPA_ETIQUETAS,
    type: 'symbol',
    source: FUENTE,
    layout: {
      'text-field': ['get', 'etiqueta'],
      'text-font': ['Noto Sans Medium'],
      'text-size': 12,
      'text-anchor': 'left',
      'text-offset': [1.1, 0],
      'text-allow-overlap': false,
      'text-optional': true,
      // Menor número, se coloca antes: si dos etiquetas se pisan, queda la de mayor prioridad.
      'symbol-sort-key': ['get', 'prioridad'],
    },
    paint: { 'text-color': colores.texto, 'text-halo-color': colores.halo, 'text-halo-width': 1.6 },
  });
}

/**
 * El mapa de edificios (HU-16 RF-04): MapLibre sobre el mapa base de CABA propio. Recibe los mismos datos que el dibujo anterior
 * (`MapaUbicacionConsorcio`) para poder cambiarlo pantalla por pantalla. Los pines se ubican por latitud y longitud reales; el mapa
 * se acerca, se aleja y se desplaza; al abrirse encuadra todos los edificios; y los nombres que se pisan se ocultan (rojos primero)
 * y reaparecen al acercar.
 */
export function MapaEdificios({
  ubicacion,
  marcadores = [],
  editable = false,
  onCambiarUbicacion,
  testId = 'mapa-postgis-caba',
  onSeleccionarMarcador,
  marcadorSeleccionadoId = null,
  alto,
  descarga = false,
}: MapaEdificiosProps): React.JSX.Element {
  const [mapa, setMapa] = useState<MapaMapLibre | null>(null);
  const pinesRef = useRef<Map<string, Marker>>(new Map());
  const pinUbicacionRef = useRef<Marker | null>(null);
  const claveEncuadre = useRef<string | null>(null);

  // Los manejadores de MapLibre viven más que cada render: leen siempre lo último desde acá.
  const ultimo = useRef({ marcadores, ubicacion, editable, onCambiarUbicacion, onSeleccionarMarcador, marcadorSeleccionadoId });
  ultimo.current = { marcadores, ubicacion, editable, onCambiarUbicacion, onSeleccionarMarcador, marcadorSeleccionadoId };

  const datos = useMemo(() => aGeoJSON(marcadores, marcadorSeleccionadoId), [marcadores, marcadorSeleccionadoId]);
  const datosRef = useRef(datos);
  datosRef.current = datos;

  const alMapaListo = useCallback((m: MapaMapLibre, motivo: 'inicial' | 'tema') => {
    instalarEtiquetas(m, datosRef.current);
    if (motivo === 'inicial') setMapa(m);
  }, []);

  // Las etiquetas siguen a los datos.
  useEffect(() => {
    if (mapa) instalarEtiquetas(mapa, datos);
  }, [mapa, datos]);

  // Tocar el mapa fija la ubicación (sólo en modo editable).
  useEffect(() => {
    if (!mapa) return;
    const alClic = (e: { lngLat: { lat: number; lng: number } }) => {
      const u = ultimo.current;
      if (u.editable && u.onCambiarUbicacion) u.onCambiarUbicacion(a6Decimales(e.lngLat));
    };
    mapa.on('click', alClic);
    mapa.getCanvas().style.cursor = editable ? 'crosshair' : '';
    return () => {
      mapa.off('click', alClic);
    };
  }, [mapa, editable]);

  // Los pines de los edificios: botones, así se eligen con clic o con teclado y un lector de pantalla los anuncia.
  useEffect(() => {
    if (!mapa) return;
    let cancelado = false;
    void cargarMapLibre().then((ml) => {
      if (cancelado) return;
      const pines = pinesRef.current;
      const ids = new Set(marcadores.map((m) => m.id));
      for (const [id, pin] of pines) {
        if (!ids.has(id)) {
          pin.remove();
          pines.delete(id);
        }
      }
      for (const m of marcadores) {
        const elegible = Boolean(onSeleccionarMarcador);
        let pin = pines.get(m.id);
        if (!pin) {
          const el = document.createElement(elegible ? 'button' : 'span');
          if (elegible) (el as HTMLButtonElement).type = 'button';
          else el.setAttribute('role', 'img');
          el.className = 'mapa-pin';
          el.dataset.testid = `marcador-mapa-${m.id}`;
          if (elegible) {
            el.addEventListener('click', (ev) => {
              ev.stopPropagation();
              ultimo.current.onSeleccionarMarcador?.(m.id);
            });
          }
          pin = new ml.Marker({ element: el, anchor: 'center' }).setLngLat([m.ubicacion.longitud, m.ubicacion.latitud]).addTo(mapa);
          pines.set(m.id, pin);
        }
        const el = pin.getElement();
        pin.setLngLat([m.ubicacion.longitud, m.ubicacion.latitud]);
        el.setAttribute('aria-label', etiquetaAccesible(m));
        el.title = m.subtitulo ? `${m.etiqueta} — ${m.subtitulo}` : m.etiqueta;
        el.style.setProperty('--pin', m.color ?? COLOR_PIN_POR_DEFECTO);
        if (m.colorNombre) el.dataset.color = m.colorNombre;
        else delete el.dataset.color;
        el.classList.toggle('mapa-pin--elegido', marcadorSeleccionadoId === m.id);
      }
      const caja = mapa.getContainer().parentElement;
      if (caja) caja.dataset.pines = String(marcadores.length);
    });
    return () => {
      cancelado = true;
    };
  }, [mapa, marcadores, onSeleccionarMarcador, marcadorSeleccionadoId]);

  // Al desmontarse (o si el mapa se vuelve a crear), se sacan los pines viejos.
  useEffect(() => {
    const pines = pinesRef.current;
    return () => {
      for (const pin of pines.values()) pin.remove();
      pines.clear();
      pinUbicacionRef.current?.remove();
      pinUbicacionRef.current = null;
    };
  }, [mapa]);

  // El pin del edificio que se ve o se edita; en modo editable se arrastra para ajustarlo.
  useEffect(() => {
    if (!mapa) return;
    let cancelado = false;
    void cargarMapLibre().then((ml) => {
      if (cancelado) return;
      if (!ubicacion) {
        pinUbicacionRef.current?.remove();
        pinUbicacionRef.current = null;
        return;
      }
      let pin = pinUbicacionRef.current;
      if (!pin) {
        const el = document.createElement('span');
        el.className = 'mapa-pin mapa-pin--ubicacion';
        el.dataset.testid = 'pin-ubicacion-edificio';
        el.setAttribute('role', 'img');
        pin = new ml.Marker({ element: el, anchor: 'center', draggable: editable });
        pin.on('dragend', () => {
          const u = ultimo.current;
          if (u.editable && u.onCambiarUbicacion) u.onCambiarUbicacion(a6Decimales(pin!.getLngLat()));
        });
        pin.setLngLat([ubicacion.longitud, ubicacion.latitud]).addTo(mapa);
        pinUbicacionRef.current = pin;
      }
      pin.setDraggable(editable);
      pin.setLngLat([ubicacion.longitud, ubicacion.latitud]);
      pin.getElement().setAttribute('aria-label', `Ubicación del edificio: ${ubicacion.latitud.toFixed(6)}, ${ubicacion.longitud.toFixed(6)}`);
    });
    return () => {
      cancelado = true;
    };
  }, [mapa, ubicacion, editable]);

  // Al abrirse (y cuando cambia el conjunto de edificios) el mapa encuadra a todos con margen; no se mueve cada vez que se fija un punto.
  useEffect(() => {
    if (!mapa) return;
    const clave = `${claveDeMarcadores(marcadores)}#${marcadores.length === 0 && ubicacion ? 'unico' : ''}`;
    if (claveEncuadre.current === clave) return;
    claveEncuadre.current = clave;
    const puntos = marcadores.length > 0 ? marcadores.map((m) => m.ubicacion) : ubicacion ? [ubicacion] : [];
    const limites = limitesDe(puntos);
    if (!limites) return;
    if (puntos.length === 1) {
      mapa.jumpTo({ center: [puntos[0].longitud, puntos[0].latitud], zoom: ZOOM_UN_EDIFICIO });
    } else {
      mapa.fitBounds(limites, { padding: 56, maxZoom: 16, animate: false });
    }
  }, [mapa, marcadores, ubicacion]);

  // Qué etiquetas quedaron a la vista: las pruebas lo leen del DOM sin tocar el canvas.
  useEffect(() => {
    if (!mapa) return;
    const publicar = () => {
      const caja = mapa.getContainer().parentElement;
      if (!caja || !mapa.getLayer(CAPA_ETIQUETAS)) return;
      const vistas = mapa.queryRenderedFeatures({ layers: [CAPA_ETIQUETAS] });
      caja.dataset.etiquetas = [...new Set(vistas.map((f) => String(f.properties?.id)))].sort().join(',');
    };
    mapa.on('idle', publicar);
    return () => {
      mapa.off('idle', publicar);
    };
  }, [mapa]);

  const sinNada = !ubicacion && marcadores.length === 0;

  return (
    <div className="mapa-edificios" data-testid={testId}>
      <div className="mapa-edificios__lienzo">
        <MapaBase testId={`${testId}-base`} alto={alto} descarga={descarga} ariaLabel={editable ? 'Mapa para fijar la ubicación del edificio' : 'Mapa de edificios en CABA'} onMapaListo={alMapaListo} />
        {sinNada && (
          <p className="mapa-edificios__vacio" data-testid={`${testId}-vacio`}>
            {editable ? 'Hacé clic en el mapa para fijar el punto del edificio' : 'Sin punto geográfico asignado'}
          </p>
        )}
      </div>
      {editable && (
        <div className="mapa-edificios__pie">
          <span>
            {ubicacion
              ? `Punto PostGIS: ${ubicacion.latitud}, ${ubicacion.longitud} (clic en el mapa o arrastrá el pin para mover)`
              : 'Sin ubicación fijada: hacé clic en el mapa para ubicar el edificio.'}
          </span>
          {ubicacion && onCambiarUbicacion && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCambiarUbicacion(null)} data-testid="btn-quitar-ubicacion">
              Quitar ubicación
            </button>
          )}
        </div>
      )}
    </div>
  );
}

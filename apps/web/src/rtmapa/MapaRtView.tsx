import React, { useEffect, useMemo, useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import { MapaUbicacionConsorcio, type MarcadorMapa } from '../consorcios/MapaUbicacionConsorcio';
import { COLOR_HEX, LEYENDA, ahoraCorregido, colorDePin, desfaseDeReloj, encabezadoRt } from './colorPin';
import { type MapaRt, REFRESCO_MS, cargarMapaRt } from './mapaRt';

const NOMBRE_COLOR = { verde: 'Abierto ahora', rojo: 'Cerrado', amarillo: 'A coordinar' } as const;

/**
 * Pantalla inicial del RT de Calle (HU-16 RF-01): encabezado con saludo, zona y hora, y el mapa con sus edificios pendientes, cada pin
 * pintado según esté abierto (verde), cerrado (rojo) o «A coordinar» (amarillo). Los colores y la hora se recalculan solos, sin recargar.
 */
export function MapaRtView({ nombreSesion }: { nombreSesion: string }) {
  const [mapa, setMapa] = useState<MapaRt | null>(null);
  const [error, setError] = useState(false);
  const [desfase, setDesfase] = useState(0);
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    let activo = true;
    void cargarMapaRt(fetchConSesion).then((m) => {
      if (!activo) return;
      if (!m) return setError(true);
      setMapa(m);
      setDesfase(desfaseDeReloj(m.ahora, Date.now()));
    });
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAhora(ahoraCorregido(Date.now(), desfase)), REFRESCO_MS);
    setAhora(ahoraCorregido(Date.now(), desfase));
    return () => clearInterval(t);
  }, [desfase]);

  const marcadores = useMemo<MarcadorMapa[]>(() => {
    if (!mapa) return [];
    return mapa.edificios.flatMap((e) => {
      if (!e.ubicacion) return [];
      const color = colorDePin(e, mapa.feriados, ahora);
      return [{ id: e.id, etiqueta: e.nombre, subtitulo: `${NOMBRE_COLOR[color]} · ${e.direccion}`, ubicacion: e.ubicacion, color: COLOR_HEX[color], colorNombre: color }];
    });
  }, [mapa, ahora]);
  const sinPunto = mapa?.edificios.filter((e) => !e.ubicacion) ?? [];

  return (
    <section className="mapa-rt" aria-labelledby="rt-titulo" data-testid="mapa-rt" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <h2 id="rt-titulo" className="portal-title" data-testid="rt-encabezado" style={{ overflowWrap: 'anywhere' }}>
        {encabezadoRt(mapa?.rt.nombre ?? nombreSesion, mapa?.rt.zona ?? null, ahora)}
      </h2>
      {error && (
        <p className="error" role="alert" data-testid="rt-mapa-error">
          No se pudo cargar tu mapa.
        </p>
      )}
      {mapa && (
        <>
          <MapaUbicacionConsorcio ubicacion={null} marcadores={marcadores} testId="mapa-rt-pines" />
          <ul className="mapa-rt-leyenda" aria-label="Leyenda de colores" data-testid="mapa-rt-leyenda" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', listStyle: 'none', padding: 0, margin: '8px 0' }}>
            {LEYENDA.map((l) => (
              <li key={l.color} data-testid={`leyenda-${l.color}`}>
                <span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: COLOR_HEX[l.color], marginRight: 6 }} />
                {l.texto}
              </li>
            ))}
          </ul>
          {mapa.edificios.length === 0 && <p className="portal-desc">No tenés edificios pendientes por hoy.</p>}
          {sinPunto.length > 0 && (
            <p className="portal-desc" data-testid="mapa-rt-sin-punto">
              Sin ubicación en el mapa: {sinPunto.map((e) => e.nombre).join(', ')}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import { MapaEdificios, type MarcadorMapa } from '../mapa/MapaEdificios';
import { ConstanciaVisitaFallida } from '../visitasFallidas/ConstanciaVisitaFallida';
import { COLOR_HEX, LEYENDA, ahoraCorregido, colorDePin, desfaseDeReloj, encabezadoRt } from './colorPin';
import { type EdificioMapaRt, type MapaRt, REFRESCO_MS, cargarMapaRtConRespaldo, horaDeLosDatos } from './mapaRt';
import { TarjetaEdificio } from './TarjetaEdificio';

// Nombre legible de cada color (para el subtítulo del pin y la tarjeta).
const NOMBRE_COLOR = { verde: 'Abierto ahora', rojo: 'Cerrado', amarillo: 'A coordinar' } as const;

interface Props {
  nombreSesion: string;
  /** El RT inició la inspección del edificio (ya validada su presencia y registrada por la API): la app pasa a la inspección. */
  onIniciarInspeccion: (edificio: EdificioMapaRt) => void;
}

/**
 * Pantalla inicial del RT de Calle (HU-16 RF-01 y RF-02): encabezado con saludo, zona y hora, y el mapa con sus edificios pendientes, cada pin
 * pintado según esté abierto (verde), cerrado (rojo) o «A coordinar» (amarillo). Al tocar un pin se abre la tarjeta del edificio. Los colores
 * y la hora se recalculan solos, sin recargar.
 */
export function MapaRtView({ nombreSesion, onIniciarInspeccion }: Props) {
  const [mapa, setMapa] = useState<MapaRt | null>(null);
  // Si no hay conexión se muestran los últimos datos guardados, y se dice de qué hora son.
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [desfase, setDesfase] = useState(0);
  const [ahora, setAhora] = useState(() => new Date());
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [constanciaDe, setConstanciaDe] = useState<EdificioMapaRt | null>(null);

  const cargar = useCallback(async () => {
    const r = await cargarMapaRtConRespaldo(fetchConSesion);
    if (!r) return setError(true);
    setError(false);
    setMapa(r.mapa);
    setGuardadoEn(r.origen === 'guardado' ? r.descargadoEn : null);
    // Con datos guardados la hora del servidor es vieja: el reloj del celular manda.
    setDesfase(r.origen === 'servidor' ? desfaseDeReloj(r.mapa.ahora, Date.now()) : 0);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Al volver la conexión se bajan los datos de nuevo.
  useEffect(() => {
    if (!guardadoEn) return;
    window.addEventListener('online', cargar);
    return () => window.removeEventListener('online', cargar);
  }, [guardadoEn, cargar]);

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
  const seleccionado = mapa?.edificios.find((e) => e.id === seleccionadoId) ?? null;

  if (constanciaDe) {
    return (
      <ConstanciaVisitaFallida
        edificio={{ id: constanciaDe.id, nombre: constanciaDe.nombre, direccion: constanciaDe.direccion, bloqueado: false, visitaFallidaHoy: false }}
        onCancelar={() => setConstanciaDe(null)}
        onGuardada={() => {
          setConstanciaDe(null);
          setSeleccionadoId(null);
          void cargar(); // el edificio ya tiene visita fallida de hoy: sale del mapa
        }}
        onYaRegistrada={() => {
          setConstanciaDe(null);
          setSeleccionadoId(null);
          void cargar();
        }}
      />
    );
  }

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
          {guardadoEn && (
            <p className="alert alert-warning" role="status" data-testid="rt-datos-guardados">
              Sin conexión: los edificios son los últimos datos descargados, de {horaDeLosDatos(guardadoEn)}.
            </p>
          )}
          <MapaEdificios
            ubicacion={null}
            marcadores={marcadores}
            descarga
            testId="mapa-rt-pines"
            onSeleccionarMarcador={setSeleccionadoId}
            marcadorSeleccionadoId={seleccionadoId}
          />
          <ul className="mapa-rt-leyenda" aria-label="Leyenda de colores" data-testid="mapa-rt-leyenda" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', listStyle: 'none', padding: 0, margin: '8px 0' }}>
            {LEYENDA.map((l) => (
              <li key={l.color} data-testid={`leyenda-${l.color}`}>
                <span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: COLOR_HEX[l.color], marginRight: 6 }} />
                {l.texto}
              </li>
            ))}
          </ul>
          {seleccionado && (
            <TarjetaEdificio
              key={seleccionado.id}
              edificio={seleccionado}
              color={colorDePin(seleccionado, mapa.feriados, ahora)}
              reglas={{ radioM: mapa.presencia.radioM, precisionMaxM: mapa.presencia.precisionMaxM }}
              onCerrar={() => setSeleccionadoId(null)}
              onIniciada={(e) => onIniciarInspeccion(e)}
              onNoSePudo={(e) => setConstanciaDe(e)}
            />
          )}
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

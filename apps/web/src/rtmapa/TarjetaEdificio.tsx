import React, { useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import { tomarUbicacion, type Ubicacion } from '../auth/ubicacion';
import { comprimirFotoAnomalia } from '../checklist/fotos';
import { DIAS, ETIQUETA_DIA, resumenDia } from '../horarios/horarios';
import { type ColorPin } from './colorPin';
import { type EdificioMapaRt } from './mapaRt';
import {
  type InicioGuardado,
  type Presencia,
  type ReglasPresencia,
  enlaceComoLlegar,
  enlaceLlamada,
  enviarInicio,
  evaluarPresencia,
  mostrarBotonesDeInicio,
  MIN_JUSTIFICACION,
} from './tarjeta';

const ESTADO: Record<ColorPin, string> = { verde: 'Abierto ahora', rojo: 'Cerrado', amarillo: 'A coordinar' };

interface Props {
  edificio: EdificioMapaRt;
  color: ColorPin;
  reglas: ReglasPresencia;
  onCerrar: () => void;
  onIniciada: (edificio: EdificioMapaRt, inicio: InicioGuardado) => void;
  onNoSePudo: (edificio: EdificioMapaRt) => void;
}

/**
 * La tarjeta del edificio (HU-16 RF-02): dirección, estado, encargado y horarios, «Llamar» y «Cómo llegar». Los botones «Iniciar
 * Inspección» y «No se pudo realizar la inspección» aparecen recién a 30 m del edificio; con mala señal de GPS aparece «Sin buena señal
 * GPS», que exige foto del frente y justificación y deja la visita para revisión de la Secretaría.
 */
export function TarjetaEdificio({ edificio, color, reglas, onCerrar, onIniciada, onNoSePudo }: Props) {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [presencia, setPresencia] = useState<Presencia | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [justificacion, setJustificacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const llamada = enlaceLlamada(edificio.encargado.telefono);
  const borrador = { foto, justificacion };

  const verificar = async () => {
    setLeyendo(true);
    setErrorGps(null);
    setError(null);
    const r = await tomarUbicacion('inicio-inspeccion');
    setLeyendo(false);
    if (r.kind === 'error') return setErrorGps(r.message);
    setUbicacion(r.ubicacion);
    setPresencia(evaluarPresencia(r.ubicacion, edificio, reglas));
  };

  const elegirFoto = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      setFoto((await comprimirFotoAnomalia(archivo)).dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la foto');
    }
  };

  const iniciar = async () => {
    if (!ubicacion || !presencia) return;
    setEnviando(true);
    setError(null);
    const r = await enviarInicio(edificio.id, ubicacion, presencia, borrador, fetchConSesion);
    setEnviando(false);
    if (r.ok) onIniciada(edificio, r.inicio);
    else setError(r.error);
  };

  return (
    <article className="tarjeta-edificio" aria-labelledby="tarjeta-titulo" data-testid="tarjeta-edificio" style={{ border: '1px solid var(--border, #cbd5e1)', borderRadius: 8, padding: 12, margin: '8px 0', overflowWrap: 'anywhere' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <h3 id="tarjeta-titulo" style={{ margin: 0 }}>
          {edificio.nombre}
        </h3>
        <button type="button" className="btn btn-secondary" onClick={onCerrar} aria-label="Cerrar la tarjeta" data-testid="tarjeta-cerrar">
          ✕
        </button>
      </header>
      <dl style={{ margin: '8px 0' }}>
        <dt>Dirección</dt>
        <dd data-testid="tarjeta-direccion">{edificio.direccion}</dd>
        <dt>Estado</dt>
        <dd data-testid="tarjeta-estado" data-color={color}>
          {ESTADO[color]}
        </dd>
        <dt>Encargado</dt>
        <dd data-testid="tarjeta-encargado">{edificio.encargado.nombre ? `${edificio.encargado.nombre}${edificio.encargado.telefono ? ` · ${edificio.encargado.telefono}` : ''}` : 'Sin datos del encargado'}</dd>
        <dt>Horarios</dt>
        <dd data-testid="tarjeta-horarios">
          {edificio.aCoordinar ? (
            'A coordinar'
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {DIAS.map((d) => (
                <li key={d}>
                  {ETIQUETA_DIA[d]}: {resumenDia(edificio.franjas[d])}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {llamada && (
          <a className="btn btn-secondary" href={llamada} data-testid="tarjeta-llamar">
            📞 Llamar al encargado
          </a>
        )}
        <a className="btn btn-secondary" href={enlaceComoLlegar(edificio)} target="_blank" rel="noopener noreferrer" data-testid="tarjeta-como-llegar">
          🧭 Cómo llegar
        </a>
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={() => void verificar()} disabled={leyendo} data-testid="tarjeta-verificar">
          {leyendo ? 'Tomando tu ubicación…' : presencia ? 'Verificar de nuevo' : 'Verificar que estoy en el edificio'}
        </button>
        {errorGps && (
          <p className="error" role="alert" data-testid="tarjeta-error-gps">
            {errorGps}
          </p>
        )}
        {presencia?.resultado === 'puede_iniciar' && (
          <p role="status" data-testid="tarjeta-presencia">
            Estás a {Math.round(presencia.distanciaM)} m del edificio.
          </p>
        )}
        {presencia?.resultado === 'lejos' && (
          <p role="status" data-testid="tarjeta-lejos">
            Estás a {Math.round(presencia.distanciaM)} m del edificio: acercate a {reglas.radioM} m o menos para iniciar la inspección.
          </p>
        )}
        {presencia?.resultado === 'sin_buena_senal' && (
          <div role="group" aria-labelledby="sin-senal-titulo" data-testid="tarjeta-sin-senal">
            <p id="sin-senal-titulo" style={{ fontWeight: 700 }}>
              Sin buena señal GPS
            </p>
            <p className="portal-desc">
              {presencia.distanciaM === null ? 'Este edificio no tiene punto en el mapa' : `La precisión del GPS (± ${Math.round(ubicacion?.precision ?? 0)} m) no alcanza`}: no se puede verificar que estés en el edificio. Sacá una foto del frente y
              escribí por qué. La Secretaría va a revisar la visita.
            </p>
            <label htmlFor="sin-senal-foto">Foto del frente del edificio</label>
            <input id="sin-senal-foto" type="file" accept="image/*" capture="environment" onChange={(e) => void elegirFoto(e.target.files?.[0])} data-testid="sin-senal-foto" />
            {foto && <img src={foto} alt="Foto del frente del edificio" style={{ maxWidth: '100%', maxHeight: 140 }} />}
            <label htmlFor="sin-senal-justificacion">Justificación (al menos {MIN_JUSTIFICACION} caracteres)</label>
            <textarea id="sin-senal-justificacion" value={justificacion} onChange={(e) => setJustificacion(e.target.value)} maxLength={500} rows={3} style={{ width: '100%' }} data-testid="sin-senal-justificacion" />
          </div>
        )}
        {error && (
          <p className="error" role="alert" data-testid="tarjeta-error">
            {error}
          </p>
        )}
        {mostrarBotonesDeInicio(presencia, borrador) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }} data-testid="tarjeta-botones-inicio">
            <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => void iniciar()} data-testid="tarjeta-iniciar">
              {enviando ? 'Iniciando…' : 'Iniciar Inspección'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => onNoSePudo(edificio)} data-testid="tarjeta-no-se-pudo">
              No se pudo realizar la inspección
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { fechaHora } from '../fechas/formato';
import { fetchConSesion } from '../auth/sesion';
import { tomarUbicacion, type Ubicacion } from '../auth/ubicacion';
import { comprimirFotoAnomalia } from '../checklist/fotos';
import {
  type CausasVisita,
  type EdificioRecorrido,
  cargarCausas,
  causaInicial,
  enviarConstancia,
  puedeGuardarAdvertencia,
} from './constanciaVisita';

interface Props {
  edificio: EdificioRecorrido;
  onGuardada: (numeroAdvertencia: number) => void;
  onCancelar: () => void;
  /** Si la API dice que ya hay una constancia de hoy, el pin sale del recorrido. */
  onYaRegistrada: () => void;
}

/**
 * Pantalla de constancia de visita fallida del RT (HU-07 RF-06). La causa se elige de una lista que viene de la configuración;
 * el GPS y la hora los toma el celular y se muestran sólo para lectura; «Guardar Advertencia de Visita» queda deshabilitado
 * hasta tener causa, foto del ingreso y ubicación.
 */
export function ConstanciaVisitaFallida({ edificio, onGuardada, onCancelar, onYaRegistrada }: Props) {
  const [causas, setCausas] = useState<CausasVisita | null>(null);
  const [causa, setCausa] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());
  const inputFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let activo = true;
    void cargarCausas(fetchConSesion).then((c) => {
      if (!activo) return;
      setCausas(c);
      setCausa(causaInicial(c));
    });
    void tomarUbicacion('visita-fallida').then((r) => {
      if (!activo) return;
      if (r.kind === 'ok') setUbicacion(r.ubicacion);
      else setErrorGps(r.message);
    });
    const reloj = setInterval(() => setAhora(new Date()), 1000);
    return () => {
      activo = false;
      clearInterval(reloj);
    };
  }, []);

  const lista = causas?.causas ?? [causaInicial(null)];
  const borrador = { causa, foto, ubicacion };
  const habilitado = puedeGuardarAdvertencia(borrador, causas) && !guardando;

  const elegirFoto = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      setFoto((await comprimirFotoAnomalia(archivo)).dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la foto');
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const r = await enviarConstancia(edificio.id, borrador, fetchConSesion);
    setGuardando(false);
    if (r.ok) onGuardada(r.constancia.numeroAdvertencia);
    else if (r.yaRegistradaHoy) {
      setError(r.error);
      onYaRegistrada();
    } else setError(r.error);
  };

  return (
    <section className="constancia-visita" aria-labelledby="constancia-titulo" data-testid="constancia-visita">
      <h3 id="constancia-titulo">No se pudo realizar la inspección</h3>
      <p className="portal-desc">
        {edificio.nombre} — {edificio.direccion}
      </p>

      <label htmlFor="constancia-causa">Causa</label>
      <select id="constancia-causa" value={causa} onChange={(e) => setCausa(e.target.value)} data-testid="constancia-causa">
        {lista.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label htmlFor="constancia-foto">Foto del ingreso</label>
      <input
        id="constancia-foto"
        ref={inputFoto}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void elegirFoto(e.target.files?.[0])}
        data-testid="constancia-foto"
      />
      {foto && <img src={foto} alt="Foto del ingreso del edificio" style={{ maxWidth: '100%', maxHeight: 160 }} />}

      <dl className="constancia-datos" data-testid="constancia-datos">
        <dt>Ubicación (GPS)</dt>
        <dd data-testid="constancia-gps">
          {ubicacion
            ? `${ubicacion.latitud.toFixed(6)}, ${ubicacion.longitud.toFixed(6)} (± ${Math.round(ubicacion.precision)} m)`
            : errorGps ?? 'Tomando la ubicación…'}
        </dd>
        <dt>Hora del dispositivo</dt>
        <dd data-testid="constancia-hora">{fechaHora(ahora, { segundos: true })}</dd>
      </dl>
      <p className="portal-desc">La ubicación y la hora las toma el celular y no se pueden cambiar. La hora del servidor se agrega al guardar.</p>

      {error && (
        <p className="error" role="alert" data-testid="constancia-error">
          {error}
        </p>
      )}

      <div className="constancia-acciones">
        <button type="button" className="btn btn-primary" disabled={!habilitado} onClick={() => void guardar()} data-testid="constancia-guardar">
          {guardando ? 'Guardando…' : 'Guardar Advertencia de Visita'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancelar} data-testid="constancia-cancelar">
          Cancelar
        </button>
      </div>
    </section>
  );
}

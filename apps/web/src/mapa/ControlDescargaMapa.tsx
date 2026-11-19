import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  dependenciasDelNavegador,
  descargarMapa,
  ErrorMapa,
  formatearTamano,
  hayVersionNueva,
  mapaDescargado,
  tamanoRemoto,
  type InfoMapa,
} from './descarga';
import './mapa.css';

type Fase = 'comprobando' | 'sin-descargar' | 'descargando' | 'descargado' | 'error';

interface Props {
  /** Versión corta, para ponerla debajo de un mapa. */
  compacto?: boolean;
  /** Se llama cuando termina una descarga, por si quien muestra el mapa quiere leerlo ya desde el celular. */
  onDescargado?: () => void;
}

function fechaCorta(iso: string): string {
  const f = new Date(iso);
  return Number.isNaN(f.getTime()) ? '' : f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * «Descargar mapa para usar sin señal»: baja el archivo del mapa una sola vez, con su avance, y lo deja guardado en el
 * celular. Avisa cuando el servidor tiene una versión más nueva.
 */
export function ControlDescargaMapa({ compacto = false, onDescargado }: Props): React.JSX.Element {
  const dep = useMemo(() => dependenciasDelNavegador(), []);
  const [fase, setFase] = useState<Fase>('comprobando');
  const [info, setInfo] = useState<InfoMapa | null>(null);
  const [tamano, setTamano] = useState<number | null>(null);
  const [porcentaje, setPorcentaje] = useState<number | null>(null);
  const [hayNueva, setHayNueva] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const aborto = useRef<AbortController | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const guardado = await mapaDescargado(dep);
      if (!vivo) return;
      if (guardado) {
        setInfo(guardado);
        setFase('descargado');
        void hayVersionNueva(dep).then((nueva) => vivo && setHayNueva(nueva));
      } else {
        setFase('sin-descargar');
        void tamanoRemoto(dep).then((t) => vivo && setTamano(t));
      }
    })();
    return () => {
      vivo = false;
      aborto.current?.abort();
    };
  }, [dep]);

  const descargar = useCallback(async () => {
    const anterior = info;
    setMensaje(null);
    setPorcentaje(0);
    setFase('descargando');
    const ac = new AbortController();
    aborto.current = ac;
    try {
      const nueva = await descargarMapa(dep, {
        signal: ac.signal,
        onProgreso: ({ recibidos, total }) => setPorcentaje(total ? Math.min(100, Math.round((recibidos / total) * 100)) : null),
      });
      setInfo(nueva);
      setHayNueva(false);
      setFase('descargado');
      onDescargado?.();
    } catch (e) {
      const cancelo = e instanceof DOMException && e.name === 'AbortError';
      if (!cancelo) setMensaje(e instanceof ErrorMapa ? e.message : 'No se pudo bajar el mapa. Revisá la conexión y probá de nuevo.');
      setFase(cancelo ? (anterior ? 'descargado' : 'sin-descargar') : anterior ? 'descargado' : 'error');
    } finally {
      aborto.current = null;
    }
  }, [dep, info, onDescargado]);

  const clase = `mapa-descarga${compacto ? ' mapa-descarga--compacto' : ''}`;

  return (
    <div className={clase} data-testid="mapa-descarga" data-fase={fase}>
      {fase === 'comprobando' && <p role="status">Comprobando el mapa guardado…</p>}

      {(fase === 'sin-descargar' || fase === 'error') && (
        <>
          <p className="mapa-descarga__texto">
            El mapa todavía no está guardado en este celular{tamano ? ` (${formatearTamano(tamano)})` : ''}. Bajalo con wifi para usarlo sin señal.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void descargar()} data-testid="mapa-descargar">
            Descargar mapa para usar sin señal
          </button>
        </>
      )}

      {fase === 'descargando' && (
        <div className="mapa-descarga__avance">
          <p role="status" aria-live="polite" className="mapa-descarga__texto">
            Descargando el mapa… {porcentaje !== null ? `${porcentaje} %` : ''}
          </p>
          <progress max={100} value={porcentaje ?? undefined} aria-label="Avance de la descarga del mapa" data-testid="mapa-progreso" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => aborto.current?.abort()}>
            Cancelar
          </button>
        </div>
      )}

      {fase === 'descargado' && info && (
        <>
          <p className="mapa-descarga__texto" data-testid="mapa-guardado">
            ✓ Mapa guardado en este celular · {formatearTamano(info.bytes)}
            {fechaCorta(info.fecha) ? ` · bajado el ${fechaCorta(info.fecha)}` : ''}. Funciona sin señal.
          </p>
          {hayNueva && (
            <>
              <p className="mapa-descarga__texto" role="status">
                Hay una versión más nueva del mapa. El que tenés sigue funcionando hasta que termine de bajar.
              </p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void descargar()} data-testid="mapa-actualizar">
                Actualizar el mapa
              </button>
            </>
          )}
        </>
      )}

      {mensaje && (
        <p role="alert" className="mapa-descarga__error">
          {mensaje}
        </p>
      )}
    </div>
  );
}

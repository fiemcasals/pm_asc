import React, { useEffect, useState } from 'react';
import { aceptarConsentimiento, fetchTextoConsentimiento, type TextoConsentimiento } from './consentimiento';
import './login.css';

interface Props {
  onAceptado: () => void;
  onCerrarSesion: () => void;
}

/** Aviso de uso de ubicación: el RT no puede seguir sin aceptarlo (Ley 25.326). */
export function ConsentimientoUbicacion({ onAceptado, onCerrarSesion }: Props) {
  const [texto, setTexto] = useState<TextoConsentimiento | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let activo = true;
    void fetchTextoConsentimiento().then((t) => {
      if (!activo) return;
      setTexto(t);
      setCargando(false);
      if (!t) setError('No se pudo cargar el aviso. Para leerlo y aceptarlo hace falta señal.');
    });
    return () => {
      activo = false;
    };
  }, []);

  async function aceptar() {
    if (!texto || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const fallo = await aceptarConsentimiento(texto.version);
      if (fallo) setError(fallo);
      else onAceptado();
    } catch {
      // Sesión revocada: la app ya cerró la sesión y muestra el motivo.
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card consentimiento" aria-labelledby="consentimiento-titulo" data-testid="consentimiento">
        <h1 id="consentimiento-titulo" className="consentimiento-titulo">
          {texto?.titulo ?? 'Uso de tu ubicación'}
        </h1>
        {cargando && <p className="login-title">Cargando…</p>}
        {texto && (
          <div className="consentimiento-texto" data-testid="consentimiento-texto">
            {texto.parrafos.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p className="consentimiento-version">Versión del aviso: {texto.version}</p>
          </div>
        )}
        {error && (
          <p className="login-error" role="alert" data-testid="consentimiento-error">
            {error}
          </p>
        )}
        <button
          type="button"
          className="login-submit"
          onClick={aceptar}
          disabled={!texto || enviando}
          data-testid="consentimiento-aceptar"
        >
          {enviando ? 'Guardando…' : 'Acepto'}
        </button>
        <button type="button" className="login-ver consentimiento-salir" onClick={onCerrarSesion}>
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}

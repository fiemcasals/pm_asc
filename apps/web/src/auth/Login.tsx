import React, { useState } from 'react';
import { login, pedirRecupero, restablecerPassword, type Usuario } from './sesion';
import './login.css';

/** Largo mínimo de la contraseña nueva, el mismo que valida la API. */
const MIN_PASSWORD = 10;

/**
 * Token del enlace del mail de recupero: llega como ?t=... en la URL de la app.
 * Se lee una sola vez, al montar, y se saca de la barra de direcciones en cuanto se usa.
 */
function tokenDeLaUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('t');
}

function limpiarUrl(): void {
  if (typeof window !== 'undefined') {
    window.history.replaceState(null, '', window.location.pathname);
  }
}

/**
 * Logo provisorio de MAICON S.R.L. El logo oficial lo envía el cliente (P13.a):
 * cuando llegue, se reemplaza este componente y nada más.
 */
function LogoMaicon() {
  return (
    <div className="login-logo" role="img" aria-label="MAICON S.R.L." data-testid="login-logo">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 7v10M8.5 10.5 12 7l3.5 3.5M8.5 13.5 12 17l3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="login-logo-text">MAICON S.R.L.</span>
    </div>
  );
}

interface LoginProps {
  onIngreso: (usuario: Usuario) => void;
  /** Motivo por el que se volvió al ingreso (por ejemplo, sesión revocada). */
  aviso?: string;
}

type Vista = 'ingreso' | 'recupero' | 'nueva-password';

export function Login({ onIngreso, aviso }: LoginProps) {
  const [token] = useState(tokenDeLaUrl);
  const [vista, setVista] = useState<Vista>(token ? 'nueva-password' : 'ingreso');
  const [avisoPropio, setAvisoPropio] = useState<string | null>(null);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    setEnviando(true);
    const r = await login(usuario.trim(), password);
    setEnviando(false);
    if (r.kind === 'ok') {
      onIngreso(r.usuario);
    } else {
      setError(r.message);
      setPassword('');
    }
  }

  function volverAlIngreso(mensaje: string): void {
    limpiarUrl();
    setAvisoPropio(mensaje);
    setVista('ingreso');
  }

  if (vista === 'recupero') {
    return <Recupero sugerido={usuario.trim()} onVolver={volverAlIngreso} />;
  }
  if (vista === 'nueva-password' && token) {
    return <NuevaPassword token={token} onVolver={volverAlIngreso} />;
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={ingresar} noValidate aria-labelledby="login-titulo">
        <LogoMaicon />
        <h1 id="login-titulo" className="login-title">
          Inspecciones de Ascensores
        </h1>

        {(avisoPropio ?? aviso) && (
          <p className="login-aviso" role="status" data-testid="login-aviso">
            {avisoPropio ?? aviso}
          </p>
        )}

        <label className="login-field">
          <span className="login-label">Usuario / Email</span>
          <input
            className="login-input"
            name="usuario"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            data-testid="login-usuario"
          />
        </label>

        <label className="login-field">
          <span className="login-label">Contraseña</span>
          <span className="login-password">
            <input
              className="login-input"
              name="password"
              type={verPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="login-password"
            />
            <button
              type="button"
              className="login-ver"
              onClick={() => setVerPassword((v) => !v)}
              aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={verPassword}
              data-testid="login-ver-password"
            >
              {verPassword ? 'Ocultar' : 'Ver'}
            </button>
          </span>
        </label>

        {error && (
          <p className="login-error" role="alert" data-testid="login-error">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="login-submit"
          disabled={enviando || !usuario.trim() || !password}
          data-testid="login-ingresar"
        >
          {enviando ? 'Ingresando…' : 'Ingresar al Sistema'}
        </button>

        <button
          type="button"
          className="login-enlace"
          onClick={() => {
            setError(null);
            setAvisoPropio(null);
            setVista('recupero');
          }}
          data-testid="login-olvide"
        >
          Olvidé mi contraseña
        </button>
      </form>
    </main>
  );
}

/** Paso 1: pedir el mail con el enlace. La respuesta es la misma exista o no la cuenta. */
function Recupero({ sugerido, onVolver }: { sugerido: string; onVolver: (aviso: string) => void }) {
  const [usuario, setUsuario] = useState(sugerido);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function pedir(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    setEnviando(true);
    const r = await pedirRecupero(usuario.trim());
    setEnviando(false);
    if (r.kind === 'ok') {
      onVolver(
        'Si la cuenta existe y tiene un email registrado, te mandamos un enlace para elegir una contraseña nueva. Revisá tu correo (también el spam): el enlace vence en 1 hora.',
      );
    } else {
      setError(r.message);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={pedir} noValidate aria-labelledby="recupero-titulo">
        <LogoMaicon />
        <h1 id="recupero-titulo" className="login-title">
          Recuperar el acceso
        </h1>
        <p className="login-aviso" role="note">
          Escribí tu usuario o tu email y te mandamos un enlace por correo para elegir una contraseña nueva.
        </p>

        <label className="login-field">
          <span className="login-label">Usuario / Email</span>
          <input
            className="login-input"
            name="usuario"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            data-testid="recupero-usuario"
          />
        </label>

        {error && (
          <p className="login-error" role="alert" data-testid="recupero-error">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="login-submit"
          disabled={enviando || !usuario.trim()}
          data-testid="recupero-enviar"
        >
          {enviando ? 'Enviando…' : 'Enviarme el enlace'}
        </button>
        <button
          type="button"
          className="login-enlace"
          onClick={() => onVolver('')}
          data-testid="recupero-volver"
        >
          Volver al ingreso
        </button>
      </form>
    </main>
  );
}

/** Paso 2: elegir la contraseña nueva con el token del mail. */
function NuevaPassword({ token, onVolver }: { token: string; onVolver: (aviso: string) => void }) {
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const corta = password.length > 0 && password.length < MIN_PASSWORD;
  const distintas = repetida.length > 0 && password !== repetida;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    setEnviando(true);
    const r = await restablecerPassword(token, password);
    setEnviando(false);
    if (r.kind === 'ok') {
      onVolver('Listo: ya podés ingresar con tu contraseña nueva.');
    } else {
      setError(r.message);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={guardar} noValidate aria-labelledby="nueva-titulo">
        <LogoMaicon />
        <h1 id="nueva-titulo" className="login-title">
          Elegí tu contraseña nueva
        </h1>

        <label className="login-field">
          <span className="login-label">Contraseña nueva (mínimo {MIN_PASSWORD} caracteres)</span>
          <span className="login-password">
            <input
              className="login-input"
              name="password"
              type={verPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="nueva-password"
            />
            <button
              type="button"
              className="login-ver"
              onClick={() => setVerPassword((v) => !v)}
              aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={verPassword}
            >
              {verPassword ? 'Ocultar' : 'Ver'}
            </button>
          </span>
        </label>

        <label className="login-field">
          <span className="login-label">Repetila</span>
          <input
            className="login-input"
            name="password-repetida"
            type={verPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            required
            data-testid="nueva-password-repetida"
          />
        </label>

        {(error || corta || distintas) && (
          <p className="login-error" role="alert" data-testid="nueva-error">
            {error ??
              (corta
                ? `La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`
                : 'Las dos contraseñas tienen que ser iguales.')}
          </p>
        )}

        <button
          type="submit"
          className="login-submit"
          disabled={enviando || corta || distintas || !password || !repetida}
          data-testid="nueva-guardar"
        >
          {enviando ? 'Guardando…' : 'Guardar y volver al ingreso'}
        </button>
        <button
          type="button"
          className="login-enlace"
          onClick={() => onVolver('')}
          data-testid="nueva-volver"
        >
          Volver al ingreso
        </button>
      </form>
    </main>
  );
}

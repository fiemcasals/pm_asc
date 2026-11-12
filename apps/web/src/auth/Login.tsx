import React, { useState } from 'react';
import { login, type Usuario } from './sesion';
import './login.css';

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
}

export function Login({ onIngreso }: LoginProps) {
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

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={ingresar} noValidate aria-labelledby="login-titulo">
        <LogoMaicon />
        <h1 id="login-titulo" className="login-title">
          Inspecciones de Ascensores
        </h1>

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
      </form>
    </main>
  );
}

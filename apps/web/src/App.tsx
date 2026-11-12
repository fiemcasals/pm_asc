import React, { useCallback, useEffect, useState } from 'react';
import { Login } from './auth/Login';
import { cerrarSesion, pantallaInicial, restaurarSesion, type Usuario } from './auth/sesion';
import { puedeSalir } from './consorcios/roles';
import { SecretariaView } from './consorcios/SecretariaView';
import { PortalEca } from './eca/PortalEca';
import { PortalFirmante } from './firmante/PortalFirmante';
import { fetchHealth, type HealthState } from './health';
import { type ThemeMode, type Vista } from './ui/command';
import { GlobalSearch } from './ui/GlobalSearch';
import {
  IconBrand,
  IconEca,
  IconFirmante,
  IconMoon,
  IconPanelLeft,
  IconSalir,
  IconSecretaria,
  IconSistema,
  IconSun,
} from './ui/Icons';

type SwState = 'verificando' | 'registrado' | 'no-soportado' | 'no-registrado';

const THEME_STORAGE_KEY = 'mant_asc_theme';

function useServiceWorkerState(): SwState {
  const [state, setState] = useState<SwState>('verificando');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setState('no-soportado');
      return;
    }
    let active = true;
    const timeout = setTimeout(() => active && setState('no-registrado'), 10_000);
    navigator.serviceWorker.ready.then(() => {
      clearTimeout(timeout);
      if (active) setState('registrado');
    });
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  return state;
}

const SW_LABEL: Record<SwState, string> = {
  verificando: 'Verificando…',
  registrado: 'Registrado',
  'no-soportado': 'No soportado por este navegador',
  'no-registrado': 'No registrado',
};

const NAV_RT = {
  id: 'rt' as const,
  label: 'Mapa del RT',
  shortLabel: 'Mapa',
  testId: 'tab-rt',
  icon: IconBrand,
};

const NAV_ITEMS: Array<{
  id: Vista;
  label: string;
  shortLabel: string;
  testId: string;
  icon: (props: { size?: number }) => React.ReactElement;
}> = [
  {
    id: 'firmante',
    label: 'Portal Firmante (RT Legal)',
    shortLabel: 'Firmante',
    testId: 'tab-firmante',
    icon: IconFirmante,
  },
  {
    id: 'eca',
    label: 'Portal ECA (Conservadoras)',
    shortLabel: 'Portal ECA',
    testId: 'tab-eca',
    icon: IconEca,
  },
  {
    id: 'secretaria',
    label: 'Secretaría (Edificios y Máquinas)',
    shortLabel: 'Secretaría',
    testId: 'tab-secretaria',
    icon: IconSecretaria,
  },
  {
    id: 'sistema',
    label: 'Estado del Sistema',
    shortLabel: 'Sistema',
    testId: 'tab-sistema',
    icon: IconSistema,
  },
];

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

type EstadoSesion =
  | { kind: 'cargando' }
  | { kind: 'sin-sesion' }
  | { kind: 'activa'; usuario: Usuario; sinSenal: boolean };

/** Puerta de entrada: sin sesión muestra el ingreso; con sesión, la pantalla del rol. */
export function App() {
  const [sesion, setSesion] = useState<EstadoSesion>({ kind: 'cargando' });

  useEffect(() => {
    let activo = true;
    void restaurarSesion().then((r) => {
      if (!activo) return;
      setSesion(
        r.kind === 'sin-sesion'
          ? { kind: 'sin-sesion' }
          : { kind: 'activa', usuario: r.usuario, sinSenal: r.kind === 'sin-senal' },
      );
    });
    return () => {
      activo = false;
    };
  }, []);

  const salir = useCallback(async () => {
    if (!puedeSalir()) return;
    await cerrarSesion();
    setSesion({ kind: 'sin-sesion' });
  }, []);

  if (sesion.kind === 'cargando') {
    return (
      <main className="login-page" aria-busy="true">
        <p className="login-title">Cargando…</p>
      </main>
    );
  }
  if (sesion.kind === 'sin-sesion') {
    return <Login onIngreso={(usuario) => setSesion({ kind: 'activa', usuario, sinSenal: false })} />;
  }
  return (
    <Escritorio
      key={sesion.usuario.id}
      usuario={sesion.usuario}
      sinSenal={sesion.sinSenal}
      onCerrarSesion={salir}
    />
  );
}

interface EscritorioProps {
  usuario: Usuario;
  sinSenal: boolean;
  onCerrarSesion: () => void;
}

function Escritorio({ usuario, sinSenal, onCerrarSesion }: EscritorioProps) {
  const esRt = usuario.rol === 'rt_calle';
  // El RT de Calle sólo ve su recorrido; el resto, los portales de oficina.
  const navItems = esRt ? [NAV_RT] : NAV_ITEMS;
  const [vista, setVista] = useState<Vista>(() => pantallaInicial(usuario.rol));
  const [health, setHealth] = useState<HealthState | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [consorcioBuscadoId, setConsorcioBuscadoId] = useState<string | null>(null);
  const [maquinaBuscadaId, setMaquinaBuscadaId] = useState<string | null>(null);
  const swState = useServiceWorkerState();

  const irA = useCallback(
    (destino: Vista) => {
      if (destino === vista || puedeSalir()) setVista(destino);
    },
    [vista],
  );

  const handleSelectConsorcio = useCallback(
    (consorcioId: string) => {
      if (vista === 'secretaria' || puedeSalir()) {
        setConsorcioBuscadoId(consorcioId);
        setVista('secretaria');
      }
    },
    [vista],
  );

  const handleSelectMaquina = useCallback(
    (maquinaId: string) => {
      if (vista === 'firmante' || puedeSalir()) {
        setMaquinaBuscadaId(maquinaId);
        setVista('firmante');
      }
    },
    [vista],
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    void fetchHealth().then(setHealth);
  }, []);

  const currentNav = navItems.find((item) => item.id === vista) ?? navItems[0];
  const systemOnline = health?.kind === 'ok';
  const systemDotClass =
    health === null ? 'dot-pending' : systemOnline ? 'dot-ok' : 'dot-error';

  return (
    <div className={`neo-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar Desktop estilo Linear */}
      <aside className="neo-sidebar" aria-label="Navegación principal">
        <div className="neo-sidebar-top">
          <div className="neo-brand">
            <span className="neo-brand-mark">
              <IconBrand size={16} />
            </span>
            {!sidebarCollapsed && (
              <div className="neo-brand-text">
                <span className="neo-brand-name">mant_asc</span>
                <span className="neo-brand-env">AGC · CABA</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="neo-icon-btn"
            onClick={() => setSidebarCollapsed((c) => !c)}
            title={sidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            aria-label="Alternar barra lateral"
          >
            <IconPanelLeft size={15} />
          </button>
        </div>

        <nav className="neo-nav-group" aria-label="Secciones del sistema">
          {!sidebarCollapsed && <div className="neo-nav-label">PORTALES</div>}
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = vista === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`tab-btn neo-nav-item ${active ? 'active' : ''}`}
                onClick={() => irA(item.id)}
                data-testid={item.testId}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon size={16} />
                {!sidebarCollapsed && <span className="neo-nav-text">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="neo-sidebar-footer">
          {!sidebarCollapsed && (
            <span className="neo-status-label" data-testid="sesion-usuario" title={usuario.usuario}>
              {usuario.nombre}
            </span>
          )}
          <button
            type="button"
            className="neo-icon-btn"
            onClick={onCerrarSesion}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            data-testid="btn-cerrar-sesion"
          >
            <IconSalir size={15} />
          </button>
          <button
            type="button"
            className="neo-status-pill"
            onClick={() => irA('sistema')}
            title="Ver detalle del estado del sistema"
          >
            <span className={`neo-dot ${systemDotClass}`} />
            {!sidebarCollapsed && (
              <span className="neo-status-label">
                {health === null
                  ? 'Conectando…'
                  : systemOnline
                    ? 'API + PostGIS OK'
                    : 'Revisar sistema'}
              </span>
            )}
          </button>

          <button
            type="button"
            className="neo-icon-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            aria-label="Cambiar tema visual"
            data-testid="btn-toggle-theme"
          >
            {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
          </button>
        </div>
      </aside>

      {/* Workspace principal */}
      <div className="neo-workspace">
        <header className="neo-topbar">
          <div className="neo-breadcrumb">
            <span className="neo-breadcrumb-root">Inspecciones de Ascensores</span>
            <span className="neo-breadcrumb-sep">/</span>
            <h1 className="neo-topbar-title">{currentNav.label}</h1>
          </div>

          <div className="neo-topbar-actions">
            {!esRt && (
              <GlobalSearch
                onNavigate={irA}
                onSelectConsorcio={handleSelectConsorcio}
                onSelectMaquina={handleSelectMaquina}
              />
            )}

            <button
              type="button"
              className="neo-icon-btn neo-mobile-theme-btn"
              onClick={onCerrarSesion}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <IconSalir size={15} />
            </button>

            <button
              type="button"
              className="neo-icon-btn neo-mobile-theme-btn"
              onClick={toggleTheme}
              aria-label="Cambiar tema visual"
            >
              {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
            </button>
          </div>
        </header>

        <main className="page neo-main">
          {sinSenal && (
            <p className="sesion-aviso" role="status" data-testid="aviso-sin-senal">
              Sin señal: estás trabajando con la sesión guardada en este dispositivo.
            </p>
          )}
          {vista === 'rt' && (
            <section className="rt-inicio" aria-labelledby="rt-titulo" data-testid="vista-rt">
              <h2 id="rt-titulo" className="portal-title">
                Hola {usuario.nombre}
              </h2>
              <p className="portal-desc">
                Acá vas a ver el mapa con tus edificios pendientes. Llega con la tarea "Mapa del RT con
                pines por horario" (HU-16).
              </p>
            </section>
          )}
          {vista === 'firmante' && (
            <PortalFirmante
              maquinaInicialId={maquinaBuscadaId}
              onConsumirMaquinaInicial={() => setMaquinaBuscadaId(null)}
            />
          )}
          {vista === 'eca' && <PortalEca />}
          {vista === 'secretaria' && (
            <SecretariaView consorcioInicialId={consorcioBuscadoId} />
          )}
          {vista === 'sistema' && (
            <section className="neo-bento-section" aria-labelledby="estado-titulo">
              <div className="portal-header">
                <div>
                  <h2 id="estado-titulo" className="portal-title">
                    Estado del sistema
                  </h2>
                  <p className="portal-desc">
                    Telemetría en tiempo real de la API NestJS, PostgreSQL + PostGIS y Service Worker PWA.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setHealth(null);
                    void fetchHealth().then(setHealth);
                  }}
                >
                  Actualizar
                </button>
              </div>

              <div className="neo-bento-grid">
                <article className="card neo-bento-card">
                  <span className="neo-bento-kicker">BACKEND · NESTJS</span>
                  <div className="neo-bento-row">
                    <span className={`neo-dot ${health === null ? 'dot-pending' : health.kind === 'api-error' ? 'dot-error' : 'dot-ok'}`} />
                    <strong className="neo-bento-value" data-testid="estado-api">
                      {health === null
                        ? 'Verificando…'
                        : health.kind === 'api-error'
                          ? health.message
                          : 'En línea'}
                    </strong>
                  </div>
                  <p className="neo-bento-sub">Proxy local `/api` → puerto `:3050`</p>
                </article>

                <article className="card neo-bento-card">
                  <span className="neo-bento-kicker">BASE DE DATOS</span>
                  <div className="neo-bento-row">
                    <span className={`neo-dot ${health?.kind === 'ok' ? 'dot-ok' : health === null ? 'dot-pending' : 'dot-error'}`} />
                    <strong className="neo-bento-value" data-testid="estado-db">
                      {health === null && 'Verificando…'}
                      {health?.kind === 'ok' && `En línea (PostGIS ${health.postgis})`}
                      {health?.kind === 'db-error' && health.message}
                      {health?.kind === 'api-error' && 'Sin datos'}
                    </strong>
                  </div>
                  <p className="neo-bento-sub">PostgreSQL 16 + PostGIS (Docker :5433)</p>
                </article>

                <article className="card neo-bento-card">
                  <span className="neo-bento-kicker">MODO OFFLINE · PWA</span>
                  <div className="neo-bento-row">
                    <span className={`neo-dot ${swState === 'registrado' ? 'dot-ok' : swState === 'verificando' ? 'dot-pending' : 'dot-error'}`} />
                    <strong className="neo-bento-value" data-testid="estado-sw">
                      {SW_LABEL[swState]}
                    </strong>
                  </div>
                  <p className="neo-bento-sub">Caché local para trabajo en sala de máquinas</p>
                </article>

                <article className="card neo-bento-card">
                  <span className="neo-bento-kicker">INTERFAZ · NEO LINEAR</span>
                  <div className="neo-bento-row">
                    <strong className="neo-bento-value">
                      {theme === 'dark' ? 'Oscuro (Command)' : 'Claro (High Contrast)'}
                    </strong>
                  </div>
                  <p className="neo-bento-sub">Rama experimental local `GONZA`</p>
                </article>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Barra inferior mobile PWA */}
      <nav className="neo-mobile-nav" aria-label="Navegación móvil">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = vista === item.id;
          return (
            <button
              key={`mob-${item.id}`}
              type="button"
              className={`neo-mobile-btn ${active ? 'active' : ''}`}
              onClick={() => irA(item.id)}
            >
              <Icon size={17} />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

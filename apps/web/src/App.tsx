import React, { useCallback, useEffect, useState } from 'react';
import { AdminUsuarios } from './admin/AdminUsuarios';
import { ConsentimientoUbicacion } from './auth/ConsentimientoUbicacion';
import { Login } from './auth/Login';
import { ChatOperativoView } from './chat/ChatOperativoView';
import {
  alRevocarse,
  cerrarSesion,
  fetchConSesion,
  guardarPerfil,
  MENSAJE_REVOCADA,
  pantallaInicial,
  restaurarSesion,
  type Usuario,
} from './auth/sesion';
import { InspeccionCampoView } from './checklist/InspeccionCampoView';
import { ColaInformesAviso } from './informe/ColaInformesAviso';
import { RecorridoRt } from './visitasFallidas/RecorridoRt';
import { PanelMapaSinConexion } from './mapa/PanelMapaSinConexion';
import { MapaRtView } from './rtmapa/MapaRtView';
import { type EdificioMapaRt } from './rtmapa/mapaRt';
import { type EdificioInspeccion, equiposDeFicha, guardarEdificioEnInspeccion, leerEdificioEnInspeccion } from './checklist/navegacion';
import { cargarVisitaEnCurso, tieneProgresoVisita } from './checklist/offlineStore';
import { puedeSalir } from './consorcios/roles';
import { SecretariaView } from './consorcios/SecretariaView';
import { PortalEca } from './eca/PortalEca';
import { PortalFirmante } from './firmante/PortalFirmante';
import { fetchHealth, type HealthState } from './health';
import { type ThemeMode, type Vista } from './ui/command';
import { GlobalSearch } from './ui/GlobalSearch';
import { IconBrand, IconMoon, IconPanelLeft, IconSalir, IconSun } from './ui/Icons';
import { IndicadorEstado } from './ui/IndicadorEstado';
import { itemsDeNavegacion } from './ui/navegacion';
import { textoContador } from './chat/noLeidos';
import { useNoLeidosChat } from './chat/useNoLeidosChat';

const THEME_STORAGE_KEY = 'mant_asc_theme';

/** La ruta /admin abre directo la pantalla de usuarios (sólo si quien entra es Administrador). */
const RUTA_ADMIN = '/admin';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

type EstadoSesion =
  | { kind: 'cargando' }
  | { kind: 'sin-sesion'; aviso?: string }
  | { kind: 'activa'; usuario: Usuario; sinSenal: boolean };

/** Puerta de entrada: sin sesión muestra el ingreso; con sesión, la pantalla del rol. */
export function App() {
  const [sesion, setSesion] = useState<EstadoSesion>({ kind: 'cargando' });

  useEffect(() => {
    let activo = true;
    void restaurarSesion().then((r) => {
      if (!activo) return;
      if (r.kind === 'sin-sesion') setSesion({ kind: 'sin-sesion' });
      else if (r.kind === 'revocada') setSesion({ kind: 'sin-sesion', aviso: MENSAJE_REVOCADA });
      else setSesion({ kind: 'activa', usuario: r.usuario, sinSenal: r.kind === 'sin-senal' });
    });
    return () => {
      activo = false;
    };
  }, []);

  // Si en cualquier pedido el servidor informa que la sesión fue revocada, se vuelve al ingreso con el motivo.
  useEffect(() => alRevocarse(() => setSesion({ kind: 'sin-sesion', aviso: MENSAJE_REVOCADA })), []);

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
    return (
      <Login
        aviso={sesion.aviso}
        onIngreso={(usuario) => setSesion({ kind: 'activa', usuario, sinSenal: false })}
      />
    );
  }
  // El RT de Calle no puede seguir sin aceptar el aviso de uso de ubicación (Ley 25.326).
  if (sesion.usuario.rol === 'rt_calle' && sesion.usuario.consentimientoUbicacionPendiente) {
    return (
      <ConsentimientoUbicacion
        onCerrarSesion={salir}
        onAceptado={() => {
          const usuario = { ...sesion.usuario, consentimientoUbicacionPendiente: false };
          guardarPerfil(usuario);
          setSesion({ ...sesion, usuario });
        }}
      />
    );
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
  const esAdmin = usuario.rol === 'administrador';
  // El RT de Calle ve su mapa, la inspección técnica y el chat operativo (HU-19).
  // Las empresas conservadoras (ECA) no tienen acceso al chat interno.
  // Usuarios y permisos es sólo del Administrador (la API además lo exige).
  const navItems = itemsDeNavegacion(usuario.rol);
  // HU-19 RF-09: los mensajes del chat sin leer, en el menú y en el título de la pestaña, esté en la pantalla que esté (solo si tiene chat)
  const noLeidosChat = useNoLeidosChat(navItems.some((item) => item.id === 'chat'));
  const [vista, setVista] = useState<Vista>(() =>
    esAdmin && typeof window !== 'undefined' && window.location.pathname.startsWith(RUTA_ADMIN)
      ? 'usuarios'
      : pantallaInicial(usuario.rol),
  );
  const [health, setHealth] = useState<HealthState | null>(null);
  // El edificio cuya inspección inició el RT desde el mapa (HU-16 RF-02): la pantalla de inspección usa sus equipos y sus pisos.
  // Se guarda en el celular (HU-17 RF-10): si se recarga la página sin señal, la inspección sigue en el mismo edificio.
  const [edificioEnInspeccion, setEdificioEnInspeccion] = useState<EdificioInspeccion | null>(() => (esRt ? leerEdificioEnInspeccion(usuario.usuario) : null));
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [consorcioBuscadoId, setConsorcioBuscadoId] = useState<string | null>(null);
  const [maquinaBuscadaId, setMaquinaBuscadaId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const destino = vista === 'usuarios' ? RUTA_ADMIN : '/';
    if (window.location.pathname !== destino) window.history.replaceState(null, '', destino);
  }, [vista]);

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

  /** El RT inició la inspección desde la tarjeta del mapa: se cargan los equipos y pisos del edificio y se pasa a la pantalla de inspección. */
  const iniciarInspeccionDesdeMapa = useCallback(async (e: EdificioMapaRt) => {
    let equipos: ReturnType<typeof equiposDeFicha> = [];
    let pisos: string[] | null = null;
    try {
      const res = await fetchConSesion(`/api/consorcios/${encodeURIComponent(e.id)}`);
      if (res.ok) {
        const ficha = (await res.json()) as { maquinas?: Parameters<typeof equiposDeFicha>[0]; pisos?: string[] };
        equipos = equiposDeFicha(ficha.maquinas ?? []);
        pisos = ficha.pisos ?? null;
      }
    } catch {
      // Sin conexión: la inspección explica que no se pudieron traer los equipos (HU-17 RF-10), nunca usa un edificio de demostración.
    }
    const enInspeccion: EdificioInspeccion = { consorcioId: e.id, nombre: e.nombre, equipos, pisos };
    setEdificioEnInspeccion(enInspeccion);
    if (equipos.length > 0) guardarEdificioEnInspeccion(usuario.usuario, enInspeccion);
    setVista('inspeccion');
  }, [usuario.usuario]);

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

  useEffect(() => {
    if (usuario.rol !== 'rt_calle' && usuario.rol !== 'administrador') return;
    let activo = true;
    void cargarVisitaEnCurso()
      .then((snap) => {
        if (activo && tieneProgresoVisita(snap)) {
          setVista('inspeccion');
        }
      })
      .catch(() => {
        // Entorno sin IndexedDB
      });
    return () => {
      activo = false;
    };
  }, [usuario.rol]);

  const currentNav = navItems.find((item) => item.id === vista) ?? navItems[0];

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
                {item.id === 'chat' && noLeidosChat > 0 && (
                  <span className="neo-nav-badge" data-testid="chat-no-leidos-menu" aria-label={`${noLeidosChat} mensajes sin leer`}>
                    {textoContador(noLeidosChat)}
                  </span>
                )}
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
          <IndicadorEstado health={health} colapsado={sidebarCollapsed} />

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
          {esRt && <ColaInformesAviso usuario={usuario.usuario} />}
          {vista === 'rt' && (
            <section className="rt-inicio" data-testid="vista-rt">
              <MapaRtView nombreSesion={usuario.nombre} onIniciarInspeccion={(e) => void iniciarInspeccionDesdeMapa(e)} />
              <RecorridoRt />
            </section>
          )}
          {vista === 'firmante' && (
            <PortalFirmante
              maquinaInicialId={maquinaBuscadaId}
              onConsumirMaquinaInicial={() => setMaquinaBuscadaId(null)}
              usuario={usuario.usuario}
              rol={usuario.rol}
            />
          )}
          {vista === 'inspeccion' && <InspeccionCampoView inspectorNombre={usuario.nombre} edificio={edificioEnInspeccion ?? undefined} onIrAlMapa={esRt ? () => setVista('rt') : undefined} />}
          {vista === 'eca' && <PortalEca usuario={usuario} />}
          {vista === 'secretaria' && (
            <SecretariaView consorcioInicialId={consorcioBuscadoId} />
          )}
          {vista === 'chat' && usuario.rol !== 'eca' && (
            <ChatOperativoView usuario={usuario} />
          )}
          {vista === 'usuarios' && <AdminUsuarios />}
          {vista === 'mapa-sin-conexion' && <PanelMapaSinConexion />}
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
              data-testid={`mob-${item.testId}`}
            >
              <Icon size={17} />
              <span>{item.shortLabel}</span>
              {item.id === 'chat' && noLeidosChat > 0 && (
                <span className="neo-mobile-badge" data-testid="mob-chat-no-leidos-menu" aria-label={`${noLeidosChat} mensajes sin leer`}>
                  {textoContador(noLeidosChat)}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

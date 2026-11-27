import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fetchConSesion, Usuario } from '../auth/sesion';
import { etiquetaDeRol } from './etiquetaRol';
import './chat.css';

export interface MensajeChat {
  id: string;
  emisorId: string;
  emisorNombre: string;
  emisorUsuario: string;
  emisorRol: string;
  destinatarioId: string | null;
  destinatarioNombre?: string | null;
  destinatarioUsuario?: string | null;
  tipoSala: 'global' | 'directo';
  contenido: string;
  adjuntoUrl?: string | null;
  consorcioId?: string | null;
  edificioNombre?: string | null;
  maquinaRef?: string | null;
  creadoEn: string;
}

export interface CanalChat {
  id: string;
  tipo: 'global' | 'directo';
  nombre: string;
  usuario?: string;
  rol?: string;
  ultimoMensaje?: string | null;
  ultimoMensajeHora?: string | null;
}

interface ConsorcioOpcion {
  id: string;
  nombre: string;
}

interface ChatOperativoViewProps {
  usuario: Usuario;
}

export function ChatOperativoView({ usuario }: ChatOperativoViewProps) {
  const [canales, setCanales] = useState<CanalChat[]>([
    {
      id: 'global',
      tipo: 'global',
      nombre: '👥 Grupo General (Operarios e Ingenieros)',
    },
  ]);
  const [canalActivoId, setCanalActivoId] = useState<string>('global');
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [texto, setTexto] = useState<string>('');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [consorcios, setConsorcios] = useState<ConsorcioOpcion[]>([]);
  const [consorcioSeleccionado, setConsorcioSeleccionado] = useState<string>('');
  const [maquinaRef, setMaquinaRef] = useState<string>('');
  const [fotoModal, setFotoModal] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cargar canales disponibles
  const cargarCanales = useCallback(async () => {
    try {
      const res = await fetchConSesion('/api/chat/canales');
      if (res.ok) {
        const data = (await res.json()) as CanalChat[];
        setCanales(data);
      }
    } catch {
      // Usar canales locales si falla la red
    }
  }, []);

  // Cargar lista de consorcios para etiquetar
  const cargarConsorcios = useCallback(async () => {
    try {
      const res = await fetchConSesion('/api/consorcios');
      if (res.ok) {
        const data = (await res.json()) as Array<{ id: string; nombre: string }>;
        setConsorcios(data.map((c) => ({ id: c.id, nombre: c.nombre })));
      }
    } catch {
      // Ignorar sin red
    }
  }, []);

  // Cargar mensajes del canal activo
  const cargarMensajes = useCallback(async () => {
    try {
      const res = await fetchConSesion(`/api/chat/mensajes?sala=${encodeURIComponent(canalActivoId)}`);
      if (res.ok) {
        const data = (await res.json()) as MensajeChat[];
        setMensajes(data);
      }
    } catch {
      // Error de red
    } finally {
      setCargando(false);
    }
  }, [canalActivoId]);

  useEffect(() => {
    void cargarCanales();
    void cargarConsorcios();
  }, [cargarCanales, cargarConsorcios]);

  useEffect(() => {
    setCargando(true);
    void cargarMensajes();

    // Polling ligero para mantener sincronizado
    const interval = setInterval(() => {
      void cargarMensajes();
    }, 3500);

    return () => clearInterval(interval);
  }, [canalActivoId, cargarMensajes]);

  // Scroll al final al recibir mensajes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensajes]);

  // Manejo de adjuntar foto
  const handleSeleccionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFotoBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Enviar mensaje
  const handleEnviar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textoLimpio = texto.trim();
    if (!textoLimpio && !fotoBase64) return;

    setEnviando(true);
    try {
      const payload = {
        tipoSala: canalActivoId === 'global' ? 'global' : 'directo',
        destinatarioId: canalActivoId === 'global' ? null : canalActivoId,
        contenido: textoLimpio || (fotoBase64 ? '📷 Foto adjunta' : ''),
        adjuntoUrl: fotoBase64,
        consorcioId: consorcioSeleccionado || null,
        maquinaRef: maquinaRef || null,
      };

      const res = await fetchConSesion('/api/chat/mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const nuevo = (await res.json()) as MensajeChat;
        setMensajes((prev) => [...prev, nuevo]);
        setTexto('');
        setFotoBase64(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch {
      // Manejar error de envío
    } finally {
      setEnviando(false);
    }
  };

  const canalActivo = canales.find((c) => c.id === canalActivoId) ?? canales[0];

  // Helper para convertir links a etiquetas <a>
  const renderContenidoConLinks = (contenido: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const partes = contenido.split(urlRegex);

    return partes.map((parte, i) => {
      if (parte.match(urlRegex)) {
        return (
          <a key={i} href={parte} target="_blank" rel="noopener noreferrer" className="chat-link">
            {parte}
          </a>
        );
      }
      return parte;
    });
  };

  return (
    <section className="chat-contenedor" data-testid="vista-chat" aria-label="Chat Operativo">
      {/* Panel Izquierdo: Lista de Canales y Contactos */}
      <aside className="chat-canales-panel">
        <div className="chat-canales-header">
          <h2 className="chat-canales-titulo">Comunicaciones</h2>
          <span className="chat-badge-rol">{etiquetaDeRol(usuario.rol)}</span>
        </div>

        <div className="chat-canales-lista" data-testid="chat-lista-canales">
          {canales.map((c) => {
            const esActivo = c.id === canalActivoId;
            const esGlobal = c.tipo === 'global';

            return (
              <button
                key={c.id}
                type="button"
                className={`chat-canal-card ${esActivo ? 'activo' : ''}`}
                onClick={() => setCanalActivoId(c.id)}
                data-testid={esGlobal ? 'chat-canal-global' : `chat-canal-item-${c.id}`}
              >
                <div className={`chat-canal-avatar ${esGlobal ? 'global' : c.rol ?? ''}`}>
                  {esGlobal ? '👥' : (c.nombre?.charAt(0) ?? 'U')}
                </div>
                <div className="chat-canal-info">
                  <div className="chat-canal-nombre-row">
                    <span className="chat-canal-nombre">{c.nombre}</span>
                    {c.ultimoMensajeHora && (
                      <span className="chat-canal-hora">
                        {new Date(c.ultimoMensajeHora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="chat-canal-subtexto">
                    {c.rol && <span className={`chat-badge-rol ${c.rol}`}>{etiquetaDeRol(c.rol)}</span>}{' '}
                    {c.ultimoMensaje ? c.ultimoMensaje : esGlobal ? 'Sala abierta a todos' : 'Conversación privada'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Panel Derecho: Conversación Activa */}
      <main className="chat-conversacion-panel">
        <header className="chat-header">
          <div className="chat-header-info">
            <h3 className="chat-header-titulo" data-testid="chat-header-titulo">
              {canalActivo.nombre}
            </h3>
            <span className="chat-header-estado">
              {canalActivo.tipo === 'global' ? 'Equipo conectado' : `${etiquetaDeRol(canalActivo.rol)} · En línea`}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void cargarMensajes()}
            title="Refrescar mensajes"
          >
            Refrescar
          </button>
        </header>

        {/* Hilo de Mensajes */}
        <div className="chat-mensajes-area" ref={scrollRef} data-testid="chat-hilo-mensajes">
          {cargando ? (
            <div className="chat-empty-mensajes">Cargando mensajes…</div>
          ) : mensajes.length === 0 ? (
            <div className="chat-empty-mensajes" data-testid="chat-sin-mensajes">
              {canalActivo.tipo === 'global'
                ? 'No hay mensajes en el grupo general. Escribe para iniciar la conversación con el equipo.'
                : 'No hay mensajes en esta conversación privada. Escribe un mensaje directo a tu compañero.'}
            </div>
          ) : (
            mensajes.map((m) => {
              const esPropio = m.emisorUsuario === usuario.usuario || m.emisorId === usuario.id;

              return (
                <div key={m.id} className={`chat-globo-fila ${esPropio ? 'propio' : 'otro'}`}>
                  <div
                    className={`chat-globo ${esPropio ? 'propio' : 'otro'}`}
                    data-testid="chat-globo-mensaje"
                  >
                    {!esPropio && (
                      <div className="chat-globo-emisor">
                        <span>{m.emisorNombre}</span>
                        <span className={`chat-badge-rol ${m.emisorRol}`}>{etiquetaDeRol(m.emisorRol)}</span>
                      </div>
                    )}

                    {m.edificioNombre && (
                      <div className="chat-globo-tag-edificio" data-testid="chat-tag-edificio">
                        📍 {m.edificioNombre} {m.maquinaRef ? `· Ascensor ${m.maquinaRef}` : ''}
                      </div>
                    )}

                    <div className="chat-globo-contenido">{renderContenidoConLinks(m.contenido)}</div>

                    {m.adjuntoUrl && (
                      <div className="chat-globo-foto">
                        <img
                          src={m.adjuntoUrl}
                          alt="Adjunto del chat"
                          onClick={() => setFotoModal(m.adjuntoUrl ?? null)}
                          data-testid="chat-foto-mensaje"
                        />
                      </div>
                    )}

                    <div className="chat-globo-meta">
                      {new Date(m.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Barra de Entrada / Redacción */}
        <footer className="chat-input-seccion">
          {/* Fila superior: Selector de edificio y previsualización de foto */}
          <div className="chat-input-context-row">
            <select
              className="chat-select-consorcio"
              value={consorcioSeleccionado}
              onChange={(e) => setConsorcioSeleccionado(e.target.value)}
              data-testid="chat-select-consorcio"
            >
              <option value="">(Opcional) Vincular Edificio…</option>
              {consorcios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>

            {consorcioSeleccionado && (
              <input
                type="text"
                placeholder="Máquina (ej. M1)"
                value={maquinaRef}
                onChange={(e) => setMaquinaRef(e.target.value)}
                style={{
                  background: '#252a34',
                  border: '1px solid #3b4252',
                  color: '#d8dee9',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  width: '120px',
                }}
              />
            )}

            {fotoBase64 && (
              <div className="chat-preview-adjunto" data-testid="chat-preview-foto">
                <span>📷 Foto seleccionada</span>
                <button type="button" onClick={() => setFotoBase64(null)} title="Quitar foto">
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Formulario de texto y botones */}
          <form className="chat-input-form" onSubmit={handleEnviar}>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleSeleccionarFoto}
              data-testid="chat-input-foto"
            />
            <button
              type="button"
              className="chat-btn-clip"
              onClick={() => fileInputRef.current?.click()}
              title="Adjuntar foto de falla o componente"
              data-testid="chat-btn-clip"
            >
              📷
            </button>

            <input
              type="text"
              className="chat-text-input"
              placeholder="Escribe un mensaje para el equipo… (puedes incluir enlaces http)"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              data-testid="chat-input-texto"
            />

            <button
              type="submit"
              className="chat-btn-enviar"
              disabled={enviando || (!texto.trim() && !fotoBase64)}
              data-testid="chat-btn-enviar"
            >
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </form>
        </footer>
      </main>

      {/* Modal Zoom de Foto */}
      {fotoModal && (
        <div className="chat-modal-overlay" onClick={() => setFotoModal(null)} data-testid="chat-modal-zoom">
          <div className="chat-modal-content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="chat-modal-cerrar" onClick={() => setFotoModal(null)}>
              ✕
            </button>
            <img src={fotoModal} alt="Foto ampliada" />
          </div>
        </div>
      )}
    </section>
  );
}

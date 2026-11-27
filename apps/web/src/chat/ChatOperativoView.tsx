import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { fetchConSesion, Usuario } from '../auth/sesion';
import { etiquetaDeRol } from './etiquetaRol';
import { estaAlFinal, fusionarVentana, sumarAnteriores, sumarPropio } from './hilo';
import { MAX_CARACTERES_MENSAJE } from './limites';
import { avisarCambioDeLecturas, INTERVALO_CANALES_MS, ordenarCanales, textoContador } from './noLeidos';
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
  /** Mensajes de otros que todavía no se leyeron en esta conversación (HU-19 RF-09). */
  noLeidos?: number;
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
  // HU-19 RF-02: si quedan mensajes anteriores a los que se ven, y cuántos mensajes nuevos llegaron mientras se leía más arriba.
  const [hayAnteriores, setHayAnteriores] = useState<boolean>(false);
  const [cargandoAnteriores, setCargandoAnteriores] = useState<boolean>(false);
  const [mensajesNuevos, setMensajesNuevos] = useState<number>(0);
  // HU-19 RF-09: si se está mirando el final del hilo (lo que se ve ya está leído) y hasta qué mensaje se avisó al servidor de cada conversación
  const [enElFinal, setEnElFinal] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Lo que el hilo hace al cambiar los mensajes: 'fondo' (baja al último), 'mantener' (queda en lo que se estaba leyendo) o 'ninguno'.
  const modoScrollRef = useRef<'fondo' | 'mantener' | 'ninguno'>('fondo');
  const medidaAntesRef = useRef({ alto: 0, arriba: 0 });
  const alFinalRef = useRef<boolean>(true);
  const canalRef = useRef<string>('global');
  const cargadoRef = useRef<boolean>(false);
  const mensajesRef = useRef<MensajeChat[]>([]);
  const ultimoMarcadoRef = useRef<Record<string, string>>({});
  mensajesRef.current = mensajes;

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

  const esPropio = useCallback((m: MensajeChat) => m.emisorUsuario === usuario.usuario || m.emisorId === usuario.id, [usuario.usuario, usuario.id]);

  // Cargar los mensajes más nuevos del canal activo y juntarlos con los que ya se ven (HU-19 RF-02)
  const cargarMensajes = useCallback(async () => {
    const sala = canalActivoId;
    try {
      const res = await fetchConSesion(`/api/chat/mensajes?sala=${encodeURIComponent(sala)}`);
      if (!res.ok || canalRef.current !== sala) return;
      const data = (await res.json()) as MensajeChat[];
      if (canalRef.current !== sala) return; // se cambió de conversación mientras llegaba la respuesta
      if (!cargadoRef.current) {
        cargadoRef.current = true;
        modoScrollRef.current = 'fondo';
        setHayAnteriores(res.headers.get('X-Hay-Anteriores') === 'true');
        setMensajes(data);
        return;
      }
      const { lista, nuevos } = fusionarVentana(mensajesRef.current, data);
      if (lista === mensajesRef.current) return; // nada cambió: no se vuelve a dibujar ni se mueve el hilo
      if (alFinalRef.current) modoScrollRef.current = 'fondo';
      else {
        const deOtros = nuevos.filter((m) => !esPropio(m)).length;
        if (deOtros > 0) setMensajesNuevos((n) => n + deOtros);
      }
      setMensajes(lista);
    } catch {
      // Error de red
    } finally {
      if (canalRef.current === sala) setCargando(false);
    }
  }, [canalActivoId, esPropio]);

  // «Ver mensajes anteriores»: pide los que preceden al más viejo que se ve y los pone arriba sin mover lo que se está leyendo
  const cargarAnteriores = useCallback(async () => {
    const sala = canalActivoId;
    const masViejo = mensajesRef.current[0];
    if (!masViejo) return;
    setCargandoAnteriores(true);
    try {
      const res = await fetchConSesion(`/api/chat/mensajes?sala=${encodeURIComponent(sala)}&antes=${encodeURIComponent(masViejo.id)}`);
      if (!res.ok || canalRef.current !== sala) return;
      const data = (await res.json()) as MensajeChat[];
      if (canalRef.current !== sala) return;
      const area = scrollRef.current;
      if (area) medidaAntesRef.current = { alto: area.scrollHeight, arriba: area.scrollTop };
      modoScrollRef.current = 'mantener';
      setHayAnteriores(res.headers.get('X-Hay-Anteriores') === 'true');
      setMensajes(sumarAnteriores(mensajesRef.current, data));
    } catch {
      // Error de red: el botón sigue ahí para volver a intentar
    } finally {
      setCargandoAnteriores(false);
    }
  }, [canalActivoId]);

  // HU-19 RF-09: lo que se está viendo se marca como leído en el servidor: la conversación abierta, con la pestaña a la vista y mirando el
  // final del hilo. Si se está leyendo más arriba, lo que llega queda sin leer hasta volver al final.
  const marcarLeido = useCallback(async () => {
    const sala = canalRef.current;
    const ultimo = mensajesRef.current[mensajesRef.current.length - 1];
    if (!ultimo || !alFinalRef.current || document.visibilityState !== 'visible') return;
    if (ultimoMarcadoRef.current[sala] === ultimo.id) return;
    ultimoMarcadoRef.current[sala] = ultimo.id;
    try {
      const res = await fetchConSesion('/api/chat/lecturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sala, hasta: ultimo.id }),
      });
      if (!res.ok) {
        delete ultimoMarcadoRef.current[sala]; // se vuelve a intentar con la próxima actualización
        return;
      }
      const lectura = (await res.json()) as { sala: string; noLeidos: number };
      setCanales((previos) => previos.map((c) => (c.id === lectura.sala ? { ...c, noLeidos: lectura.noLeidos } : c)));
      avisarCambioDeLecturas();
    } catch {
      delete ultimoMarcadoRef.current[sala];
    }
  }, []);

  const irAlFinal = useCallback(() => {
    const area = scrollRef.current;
    if (area) area.scrollTop = area.scrollHeight;
    alFinalRef.current = true;
    setEnElFinal(true);
    setMensajesNuevos(0);
    void marcarLeido();
  }, [marcarLeido]);

  const alMoverElHilo = useCallback(() => {
    const area = scrollRef.current;
    if (!area) return;
    const alFinal = estaAlFinal(area.scrollTop, area.clientHeight, area.scrollHeight);
    alFinalRef.current = alFinal;
    setEnElFinal(alFinal);
    if (alFinal) {
      setMensajesNuevos(0);
      void marcarLeido();
    }
  }, [marcarLeido]);

  useEffect(() => {
    void cargarCanales();
    void cargarConsorcios();
    // HU-19 RF-09: la lista de conversaciones se actualiza sola (contadores, último mensaje y orden)
    const intervalo = setInterval(() => void cargarCanales(), INTERVALO_CANALES_MS);
    return () => clearInterval(intervalo);
  }, [cargarCanales, cargarConsorcios]);

  // Al llegar o cambiar mensajes, o al volver a mirar la pestaña, lo que se ve queda leído
  useEffect(() => {
    void marcarLeido();
  }, [mensajes, cargando, marcarLeido]);

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') void marcarLeido();
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [marcarLeido]);

  useEffect(() => {
    // Conversación nueva: se empieza de cero y se baja al último mensaje al cargar
    canalRef.current = canalActivoId;
    cargadoRef.current = false;
    modoScrollRef.current = 'fondo';
    alFinalRef.current = true;
    setEnElFinal(true);
    setMensajes([]);
    setHayAnteriores(false);
    setMensajesNuevos(0);
    setCargando(true);
    void cargarMensajes();

    // Polling ligero para mantener sincronizado
    const interval = setInterval(() => {
      void cargarMensajes();
    }, 3500);

    return () => clearInterval(interval);
  }, [canalActivoId, cargarMensajes]);

  // El hilo baja al último mensaje solo cuando corresponde (al abrir la conversación, al enviar, o si ya se estaba al final): si se está
  // leyendo más arriba, un mensaje nuevo no mueve nada y al sumar anteriores se queda en lo que se estaba leyendo.
  useLayoutEffect(() => {
    const area = scrollRef.current;
    const modo = modoScrollRef.current;
    modoScrollRef.current = 'ninguno';
    if (!area) return;
    if (modo === 'fondo') {
      area.scrollTop = area.scrollHeight;
      alFinalRef.current = true;
      setEnElFinal(true);
    } else if (modo === 'mantener') {
      area.scrollTop = medidaAntesRef.current.arriba + (area.scrollHeight - medidaAntesRef.current.alto);
    }
  }, [mensajes, cargando]);

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
        modoScrollRef.current = 'fondo';
        setMensajes((prev) => sumarPropio(prev, nuevo));
        setMensajesNuevos(0);
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
          {ordenarCanales(canales).map((c) => {
            const esActivo = c.id === canalActivoId;
            const esGlobal = c.tipo === 'global';
            // La conversación que se está mirando al final no muestra contador: lo que se ve ya está leído
            const pendientes = esActivo && enElFinal ? 0 : c.noLeidos ?? 0;

            return (
              <button
                key={c.id}
                type="button"
                className={`chat-canal-card ${esActivo ? 'activo' : ''} ${pendientes > 0 ? 'con-no-leidos' : ''}`}
                onClick={() => setCanalActivoId(c.id)}
                data-testid={esGlobal ? 'chat-canal-global' : `chat-canal-item-${c.id}`}
              >
                <div className={`chat-canal-avatar ${esGlobal ? 'global' : c.rol ?? ''}`}>
                  {esGlobal ? '👥' : (c.nombre?.charAt(0) ?? 'U')}
                </div>
                <div className="chat-canal-info">
                  <div className="chat-canal-nombre-row">
                    <span className={`chat-canal-nombre ${pendientes > 0 ? 'no-leido' : ''}`}>{c.nombre}</span>
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
                {pendientes > 0 && (
                  <span className="chat-contador" data-testid={`chat-contador-${c.id}`} aria-label={`${pendientes} mensajes sin leer`}>
                    {textoContador(pendientes)}
                  </span>
                )}
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
        <div className="chat-hilo-contenedor">
        <div className="chat-mensajes-area" ref={scrollRef} onScroll={alMoverElHilo} data-testid="chat-hilo-mensajes">
          {!cargando && hayAnteriores && (
            <button
              type="button"
              className="btn btn-secondary btn-sm chat-btn-anteriores"
              onClick={() => void cargarAnteriores()}
              disabled={cargandoAnteriores}
              data-testid="chat-btn-anteriores"
            >
              {cargandoAnteriores ? 'Cargando…' : 'Ver mensajes anteriores'}
            </button>
          )}
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
              const propio = esPropio(m);

              return (
                <div key={m.id} className={`chat-globo-fila ${propio ? 'propio' : 'otro'}`}>
                  <div
                    className={`chat-globo ${propio ? 'propio' : 'otro'}`}
                    data-testid="chat-globo-mensaje"
                  >
                    {!propio && (
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
                          onLoad={() => {
                            // Al cargarse una foto el hilo crece: si se estaba al final, se sigue al final
                            if (alFinalRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                          }}
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
        {mensajesNuevos > 0 && (
          <button type="button" className="chat-aviso-nuevos" onClick={irAlFinal} data-testid="chat-aviso-mensajes-nuevos">
            Mensajes nuevos ↓ <span className="chat-aviso-nuevos-cuenta">{mensajesNuevos}</span>
          </button>
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
              maxLength={MAX_CARACTERES_MENSAJE}
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

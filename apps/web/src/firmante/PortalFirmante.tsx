import React, { useEffect, useState } from 'react';
import {
  autorizarFirmaMaquina,
  fetchMaquinasFirmante,
  type MaquinaAsignada,
  obtenerMotivoBloqueo,
  puedeAutorizar,
} from './firmante';
import { ModalAuditoria } from './ModalAuditoria';

interface PortalFirmanteProps {
  maquinaInicialId?: string | null;
  onConsumirMaquinaInicial?: () => void;
}

export function PortalFirmante({
  maquinaInicialId,
  onConsumirMaquinaInicial,
}: PortalFirmanteProps) {
  const [maquinas, setMaquinas] = useState<MaquinaAsignada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [maquinaSeleccionada, setMaquinaSeleccionada] = useState<MaquinaAsignada | null>(null);

  const cargarDatos = async () => {
    setCargando(true);
    setError(null);
    const res = await fetchMaquinasFirmante();
    if (res.ok) {
      setMaquinas(res.data);
    } else {
      setError(res.error || 'Error al cargar máquinas');
    }
    setCargando(false);
  };

  useEffect(() => {
    void cargarDatos();
  }, []);

  useEffect(() => {
    if (!maquinaInicialId || maquinas.length === 0) return;
    const encontrada = maquinas.find((m) => m.id === maquinaInicialId);
    if (encontrada) {
      setMaquinaSeleccionada(encontrada);
      onConsumirMaquinaInicial?.();
    }
  }, [maquinaInicialId, maquinas, onConsumirMaquinaInicial]);

  const handleAutorizar = async (maquinaId: string) => {
    const res = await autorizarFirmaMaquina(maquinaId);
    if (!res.ok) {
      throw new Error(res.error || 'Error al autorizar firma');
    }

    setMensajeExito(
      `✓ Firma digital autorizada con respaldo legal ante AGC para ${maquinaId}. Protocolo: ${res.data?.autorizacion.protocoloAGC}`,
    );

    // Actualiza el estado local de la máquina
    setMaquinas((prev) =>
      prev.map((m) => {
        if (m.id === maquinaId && m.visita && res.data) {
          return {
            ...m,
            visita: {
              ...m.visita,
              autorizada: true,
              fechaAutorizacion: res.data.autorizacion.fechaAutorizacion,
              autorizadoPor: res.data.autorizacion.autorizadoPor,
              protocoloAGC: res.data.autorizacion.protocoloAGC,
            },
          };
        }
        return m;
      }),
    );

    // Cierra el modal
    setMaquinaSeleccionada(null);
  };

  const recorridasCount = maquinas.filter((m) => m.estado === 'Recorrida').length;
  const pendientesCount = maquinas.filter((m) => m.estado === 'Pendiente de Visita').length;
  const advertenciasCount = maquinas.filter((m) => m.estado === 'Advertencia').length;
  const autorizadasCount = maquinas.filter((m) => m.visita?.autorizada).length;

  return (
    <section className="portal-firmante" aria-labelledby="portal-firmante-titulo">
      <div className="portal-header">
        <div>
          <h2 id="portal-firmante-titulo" className="portal-title">
            Panel de Liquidación y Firma AGC
          </h2>
          <p className="portal-desc">
            Revisión técnica de informes con fotos obligatorias y conformidad legal ante la Agencia Gubernamental de Control.
          </p>
        </div>
        <div className="firmante-badge">
          <span className="user-icon">👤</span> RT Legal: <strong>gonza</strong>
        </div>
      </div>

      {mensajeExito && (
        <div className="alert alert-success" role="status">
          {mensajeExito}
          <button className="btn-link" onClick={() => setMensajeExito(null)} style={{ marginLeft: '12px' }}>
            Descartar
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          <button className="btn-link" onClick={cargarDatos} style={{ marginLeft: '12px' }}>
            Reintentar
          </button>
        </div>
      )}

      {/* Métricas resumidas */}
      <div className="stats-row">
        <div className="stat-chip">
          Total Máquinas: <strong>{maquinas.length}</strong>
        </div>
        <div className="stat-chip stat-chip-success">
          Recorridas: <strong>{recorridasCount}</strong>
        </div>
        <div className="stat-chip stat-chip-warning">
          Pendientes: <strong>{pendientesCount}</strong>
        </div>
        <div className="stat-chip stat-chip-danger">
          Advertencias: <strong>{advertenciasCount}</strong>
        </div>
        <div className="stat-chip stat-chip-authorized">
          Autorizadas AGC: <strong>{autorizadasCount}</strong>
        </div>
      </div>

      {cargando ? (
        <div className="loading-box">Cargando flota asignada…</div>
      ) : maquinas.length === 0 ? (
        <div className="empty-box">No se encontraron máquinas asignadas para este mes.</div>
      ) : (
        <div className="maquinas-list" data-testid="maquinas-lista">
          {maquinas.map((m) => {
            const habilitado = puedeAutorizar(m);
            const motivoBloqueo = obtenerMotivoBloqueo(m);
            const yaAutorizada = m.visita?.autorizada;

            return (
              <article key={m.id} className="maquina-card" data-testid={`maquina-card-${m.id}`}>
                <div className="maquina-main">
                  <div className="maquina-badge-col">
                    <span className="agc-code">{m.codigoAGC}</span>
                  </div>

                  <div className="maquina-info">
                    <h3 className="maquina-name">{m.nombre}</h3>
                    <p className="maquina-address">
                      📍 <strong>{m.edificio.direccion}</strong> · {m.edificio.consorcio}
                    </p>
                    <div className="maquina-meta">
                      <span>ECA: {m.eca}</span>
                      <span>•</span>
                      <span>RT Calle (60%): {m.rtCalle}</span>
                      <span>•</span>
                      <span>Mes: {m.mes}</span>
                    </div>
                  </div>

                  <div className="maquina-status-col">
                    <span className={`badge badge-${m.estado.toLowerCase().replace(/\s+/g, '-')}`}>
                      {m.estado}
                    </span>
                    {yaAutorizada && (
                      <span className="badge badge-autorizada" style={{ marginTop: '6px' }}>
                        ✓ Autorizada AGC
                      </span>
                    )}
                  </div>
                </div>

                <div className="maquina-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setMaquinaSeleccionada(m)}
                    data-testid={`btn-auditar-${m.id}`}
                  >
                    Auditar Informe y Fotos
                  </button>

                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!habilitado}
                    title={motivoBloqueo || 'Autorizar firma digital ante AGC'}
                    onClick={() => setMaquinaSeleccionada(m)}
                    data-testid={`btn-autorizar-${m.id}`}
                  >
                    {yaAutorizada ? '✓ Autorizada' : 'Autorizar Firma AGC'}
                  </button>
                </div>

                {!habilitado && !yaAutorizada && (
                  <div className="bloqueo-hint">
                    🔒 <small>{motivoBloqueo}</small>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {maquinaSeleccionada && (
        <ModalAuditoria
          maquina={maquinaSeleccionada}
          onClose={() => setMaquinaSeleccionada(null)}
          onAutorizar={handleAutorizar}
        />
      )}
    </section>
  );
}

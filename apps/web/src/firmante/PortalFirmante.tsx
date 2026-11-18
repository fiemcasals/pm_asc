import React, { useEffect, useState } from 'react';
import { AlertaFallaCritica } from '../fallas/AlertaFallaCritica';
import {
  autorizarFirmaMaquina,
  fetchMaquinasFirmante,
  type MaquinaAsignada,
  obtenerMotivoBloqueo,
  puedeAutorizar,
  puedeFirmarComo,
} from './firmante';
import { ModalAuditoria } from './ModalAuditoria';

interface PortalFirmanteProps {
  maquinaInicialId?: string | null;
  onConsumirMaquinaInicial?: () => void;
  /** El usuario de la sesión: el cartel de falla crítica muestra sólo las alertas de sus edificios (HU-06 RF-04). */
  usuario?: string;
  /** El rol de la sesión: un Firmante ve y firma lo suyo; la Secretaría y el Administrador ven todo en modo lectura (HU-08 RF-04). */
  rol?: string;
}

/** La tarjeta de una máquina del Firmante. Sólo el Firmante ve el botón de autorizar (HU-08 RF-04). */
export function TarjetaMaquina({
  m,
  puedeFirmar,
  onSeleccionar,
}: {
  m: MaquinaAsignada;
  puedeFirmar: boolean;
  onSeleccionar: (m: MaquinaAsignada) => void;
}) {
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
        onClick={() => onSeleccionar(m)}
        data-testid={`btn-auditar-${m.id}`}
      >
        Auditar Informe y Fotos
      </button>

      {puedeFirmar && (
        <button
          className="btn btn-primary btn-sm"
          disabled={!habilitado}
          title={motivoBloqueo || 'Autorizar firma digital ante AGC'}
          onClick={() => onSeleccionar(m)}
          data-testid={`btn-autorizar-${m.id}`}
        >
          {yaAutorizada ? '✓ Autorizada' : 'Autorizar Firma AGC'}
        </button>
      )}
    </div>

    {puedeFirmar && !habilitado && !yaAutorizada && (
      <div className="bloqueo-hint">
        🔒 <small>{motivoBloqueo}</small>
      </div>
    )}
  </article>
  );
}

export function PortalFirmante({
  maquinaInicialId,
  onConsumirMaquinaInicial,
  usuario,
  rol = 'firmante',
}: PortalFirmanteProps) {
  const puedeFirmar = puedeFirmarComo({ rol });
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
      <AlertaFallaCritica rol="firmante" usuario={usuario} />
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
          <span className="user-icon">👤</span>{' '}
          {puedeFirmar ? (
            <>
              RT Legal: <strong data-testid="firmante-usuario">{usuario}</strong>
            </>
          ) : (
            <>
              Vista de lectura: <strong data-testid="firmante-todos">todos los Firmantes</strong>
            </>
          )}
        </div>
      </div>

      {!puedeFirmar && (
        <p className="portal-desc" data-testid="nota-solo-firmante">
          Acá ves las máquinas de todos los Firmantes. La firma AGC la autoriza el Firmante: la Secretaría y el Administrador no la autorizan.
        </p>
      )}

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
          {maquinas.map((m) => (
            <TarjetaMaquina key={m.id} m={m} puedeFirmar={puedeFirmar} onSeleccionar={setMaquinaSeleccionada} />
          ))}
        </div>
      )}

      {maquinaSeleccionada && (
        <ModalAuditoria
          maquina={maquinaSeleccionada}
          onClose={() => setMaquinaSeleccionada(null)}
          onAutorizar={handleAutorizar}
          puedeFirmar={puedeFirmar}
        />
      )}
    </section>
  );
}

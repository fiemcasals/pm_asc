import React, { useState } from 'react';
import {
  type MaquinaAsignada,
  obtenerMotivoBloqueo,
  puedeAutorizar,
} from './firmante';

interface ModalAuditoriaProps {
  maquina: MaquinaAsignada;
  onClose: () => void;
  onAutorizar: (maquinaId: string) => Promise<void>;
}

export function ModalAuditoria({ maquina, onClose, onAutorizar }: ModalAuditoriaProps) {
  const [autorizando, setAutorizando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const habilitado = puedeAutorizar(maquina);
  const motivoBloqueo = obtenerMotivoBloqueo(maquina);
  const visita = maquina.visita;

  const handleAutorizar = async () => {
    if (!habilitado || autorizando) return;
    setErrorLocal(null);
    setAutorizando(true);
    try {
      await onAutorizar(maquina.id);
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error al autorizar');
    } finally {
      setAutorizando(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
      <div className="modal-container">
        <div className="modal-header">
          <div>
            <h2 id="modal-titulo" className="modal-title">
              Auditoría Técnica — {maquina.codigoAGC}: {maquina.nombre}
            </h2>
            <p className="modal-subtitle">{maquina.edificio.direccion} · {maquina.edificio.consorcio}</p>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Cerrar modal">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {errorLocal && (
            <div className="alert alert-error" role="alert">
              {errorLocal}
            </div>
          )}

          {/* Información de Visita */}
          <div className="audit-section">
            <h3 className="section-title">1. Estado de la Inspección</h3>
            <div className="audit-grid">
              <div>
                <strong>Estado:</strong>{' '}
                <span className={`badge badge-${maquina.estado.toLowerCase().replace(/\s+/g, '-')}`}>
                  {maquina.estado}
                </span>
              </div>
              <div>
                <strong>ECA Responsable:</strong> {maquina.eca}
              </div>
              <div>
                <strong>Inspector RT Calle:</strong> {maquina.rtCalle}
              </div>
              <div>
                <strong>Fecha de Visita:</strong>{' '}
                {visita?.fecha ? new Date(visita.fecha).toLocaleString('es-AR') : 'No realizada'}
              </div>
            </div>

            {visita?.motivoAdvertencia && (
              <div className="alert alert-warning" style={{ marginTop: '12px' }}>
                ⚠️ <strong>Motivo de advertencia:</strong> {visita.motivoAdvertencia}
              </div>
            )}
          </div>

          {/* Fotos Obligatorias */}
          <div className="audit-section">
            <h3 className="section-title">2. Fotos Obligatorias (Normativa AGC)</h3>
            <div className="photos-grid">
              {/* Foto Cables */}
              <div className="photo-card">
                <div className="photo-header">
                  <span>Cables de Tracción</span>
                  {visita?.fotosObligatorias?.cables ? (
                    <span className="badge badge-recorrida">✓ Presente</span>
                  ) : (
                    <span className="badge badge-advertencia">✗ Falta</span>
                  )}
                </div>
                <div className="photo-preview">
                  {visita?.fotosObligatorias?.cables ? (
                    <img
                      src={visita.fotosObligatorias.cables}
                      alt="Cables de tracción del ascensor"
                      className="photo-img"
                    />
                  ) : (
                    <div className="photo-placeholder">Sin captura de cables</div>
                  )}
                </div>
              </div>

              {/* Foto Frente */}
              <div className="photo-card">
                <div className="photo-header">
                  <span>Frente de Cabina y Botonera</span>
                  {visita?.fotosObligatorias?.frente ? (
                    <span className="badge badge-recorrida">✓ Presente</span>
                  ) : (
                    <span className="badge badge-advertencia">✗ Falta</span>
                  )}
                </div>
                <div className="photo-preview">
                  {visita?.fotosObligatorias?.frente ? (
                    <img
                      src={visita.fotosObligatorias.frente}
                      alt="Frente de cabina y botonera"
                      className="photo-img"
                    />
                  ) : (
                    <div className="photo-placeholder">Sin captura de frente</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Firma del Encargado */}
          <div className="audit-section">
            <h3 className="section-title">3. Conformidad del Consorcio</h3>
            <div className="signature-card">
              <div className="photo-header">
                <span>Firma del Encargado / Administrador</span>
                {visita?.firmaEncargado ? (
                  <span className="badge badge-recorrida">✓ Firmado</span>
                ) : (
                  <span className="badge badge-advertencia">✗ Sin firma</span>
                )}
              </div>
              <div className="signature-preview">
                {visita?.firmaEncargado ? (
                  <img
                    src={visita.firmaEncargado}
                    alt="Firma del encargado del edificio"
                    className="signature-img"
                  />
                ) : (
                  <div className="photo-placeholder">El informe no cuenta con la firma del encargado</div>
                )}
              </div>
              {visita?.nombreEncargado && (
                <p className="signature-author">Firmante: {visita.nombreEncargado}</p>
              )}
            </div>
          </div>

          {/* Estado de Autorización */}
          {visita?.autorizada && (
            <div className="alert alert-success">
              ✅ <strong>Firma digital AGC ya autorizada</strong> con respaldo legal.
              <br />
              <small>
                Protocolo: <code>{visita.protocoloAGC}</code> · Autorizado por {visita.autorizadoPor} el{' '}
                {visita.fechaAutorizacion && new Date(visita.fechaAutorizacion).toLocaleString('es-AR')}
              </small>
            </div>
          )}

          {!habilitado && !visita?.autorizada && (
            <div className="alert alert-warning">
              🔒 <strong>Autorización bloqueada:</strong> {motivoBloqueo}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={autorizando}>
            Cerrar
          </button>
          {!visita?.autorizada && (
            <button
              className="btn btn-primary"
              disabled={!habilitado || autorizando}
              onClick={handleAutorizar}
              data-testid="btn-confirmar-autorizar"
            >
              {autorizando ? 'Registrando firma AGC…' : 'Autorizar Firma AGC'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

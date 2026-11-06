import React from 'react';
import { Consorcio } from './consorcios';

interface FichaConsorcioProps {
  consorcio: Consorcio;
  onCerrar?: () => void;
}

export function FichaConsorcio({ consorcio, onCerrar }: FichaConsorcioProps) {
  const { nombre, direccion, administracion, maquinas, createdAt } = consorcio;

  return (
    <article
      className="ficha-tecnica-card"
      data-testid={`ficha-consorcio-${consorcio.id}`}
      aria-labelledby="ficha-titulo"
    >
      <div className="ficha-header">
        <div>
          <span className="badge badge-recorrida" style={{ marginBottom: '6px' }}>
            Ficha Oficial de Edificio
          </span>
          <h3 id="ficha-titulo" className="ficha-title" data-testid="ficha-nombre">
            {nombre}
          </h3>
          <p className="ficha-address" data-testid="ficha-direccion">
            📍 <strong>{direccion}</strong>
          </p>
        </div>

        {onCerrar && (
          <button
            type="button"
            className="btn-close"
            onClick={onCerrar}
            aria-label="Cerrar ficha técnica"
            data-testid="btn-cerrar-ficha"
          >
            ✕
          </button>
        )}
      </div>

      <div className="ficha-body">
        {/* Sección de Administración */}
        <div className="ficha-section">
          <h4 className="section-title">Datos de Administración</h4>
          <div className="admin-info-box">
            <div>
              <strong>Razón Social:</strong>{' '}
              <span data-testid="admin-nombre-val">
                {administracion.nombre || 'No especificada'}
              </span>
            </div>
            <div>
              <strong>Teléfono:</strong>{' '}
              <span data-testid="admin-tel-val">
                {administracion.telefono || 'Sin registrar'}
              </span>
            </div>
            <div>
              <strong>Email de Notificaciones:</strong>{' '}
              <span data-testid="admin-email-val">
                {administracion.email || 'Sin registrar'}
              </span>
            </div>
          </div>
        </div>

        {/* Sección de Máquinas y Elevadores AGC */}
        <div className="ficha-section">
          <div className="section-header-row">
            <h4 className="section-title">
              Máquinas Empadronadas ante AGC ({maquinas.length})
            </h4>
          </div>

          {maquinas.length === 0 ? (
            <p className="text-muted">No posee máquinas asociadas.</p>
          ) : (
            <div className="table-responsive">
              <table className="ficha-table" data-testid="tabla-maquinas-ficha">
                <thead>
                  <tr>
                    <th>Ref. AGC</th>
                    <th>Descripción / Ubicación</th>
                    <th>Identificador Único</th>
                  </tr>
                </thead>
                <tbody>
                  {maquinas.map((m) => (
                    <tr key={m.id || m.referenciaAgc} data-testid={`maquina-item-${m.referenciaAgc}`}>
                      <td>
                        <span className="agc-code">{m.referenciaAgc}</span>
                      </td>
                      <td>
                        <strong>{m.descripcion || 'Sin descripción'}</strong>
                      </td>
                      <td>
                        <small className="text-muted font-mono">{m.id}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Metadatos */}
        <div className="ficha-meta">
          <small>
            Registrado en PostgreSQL:{' '}
            {createdAt ? new Date(createdAt).toLocaleString('es-AR') : 'Recién creado'}
          </small>
        </div>
      </div>
    </article>
  );
}

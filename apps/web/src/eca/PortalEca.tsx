import React, { useEffect, useState } from 'react';
import { AlertasCriticas } from './AlertasCriticas';
import {
  type CoberturaEca,
  fetchCoberturaEca,
  fetchMaquinasEca,
  type MaquinaEca,
} from './eca';
import { MedidorCobertura } from './MedidorCobertura';

const EMPRESAS_DISPONIBLES = [
  'Conservación Porteña S.R.L.',
  'Elevadores San Martín',
  'MAICON Mantenimiento',
];

export function PortalEca() {
  const [ecaSeleccionada, setEcaSeleccionada] = useState<string>(
    'Conservación Porteña S.R.L.',
  );
  const [mesSeleccionado, setMesSeleccionado] = useState<string>('2026-11');
  const [cobertura, setCobertura] = useState<CoberturaEca | null>(null);
  const [maquinas, setMaquinas] = useState<MaquinaEca[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = async () => {
    setCargando(true);
    setError(null);
    try {
      const [resCob, resMaq] = await Promise.all([
        fetchCoberturaEca(ecaSeleccionada, mesSeleccionado),
        fetchMaquinasEca(ecaSeleccionada, mesSeleccionado),
      ]);

      if (resCob.ok && resCob.data) {
        setCobertura(resCob.data);
      } else {
        setError(resCob.error || 'Error al obtener métricas de cobertura');
      }

      if (resMaq.ok && resMaq.data) {
        setMaquinas(resMaq.data);
      } else {
        setError(resMaq.error || 'Error al obtener máquinas de la ECA');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de comunicación');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarDatos();
  }, [ecaSeleccionada, mesSeleccionado]);

  return (
    <section className="portal-eca" aria-labelledby="portal-eca-titulo">
      {/* Cabecera del Portal ECA */}
      <div className="portal-header">
        <div>
          <h2 id="portal-eca-titulo" className="portal-title">
            Portal de Cobertura y Monitoreo ECA
          </h2>
          <p className="portal-desc">
            Vista exclusiva para la Empresa Conservadora Aliada. Monitoreo en tiempo real de inspecciones y firmas AGC.
          </p>
        </div>

        <div className="read-only-badge" data-testid="badge-solo-lectura">
          Solo lectura
        </div>
      </div>

      {/* Selector de Empresa y Mes */}
      <div className="filter-card">
        <div className="filter-group">
          <label htmlFor="select-eca" className="filter-label">
            Empresa Conservadora (ECA):
          </label>
          <select
            id="select-eca"
            className="filter-select"
            value={ecaSeleccionada}
            onChange={(e) => setEcaSeleccionada(e.target.value)}
            data-testid="select-eca"
          >
            {EMPRESAS_DISPONIBLES.map((eca) => (
              <option key={eca} value={eca}>
                {eca}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="select-mes" className="filter-label">
            Período / Mes:
          </label>
          <select
            id="select-mes"
            className="filter-select"
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            data-testid="select-mes"
          >
            <option value="2026-11">Noviembre 2026</option>
            <option value="2026-12">Diciembre 2026</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          <button className="btn-link" onClick={cargarDatos} style={{ marginLeft: '12px' }}>
            Reintentar
          </button>
        </div>
      )}

      {cargando ? (
        <div className="loading-box">Cargando métricas de cobertura y catálogo de flota…</div>
      ) : (
        <>
          {/* Alertas Críticas (Fuera de Servicio y Reparación Urgente) */}
          <AlertasCriticas maquinas={maquinas} />

          {/* Criterio 1: Gráfico/Medidor de Cobertura */}
          {cobertura && <MedidorCobertura cobertura={cobertura} />}

          {/* Criterio 2: Listado de flota en MODO SOLO LECTURA sin opciones de edición */}
          <div className="catalogo-flota-section" data-testid="listado-solo-lectura">
            <div className="section-header-row">
              <h3 className="section-title">
                Flota Asignada a {ecaSeleccionada} ({maquinas.length} máquinas)
              </h3>
            </div>

            {maquinas.length === 0 ? (
              <div className="empty-box">
                No se registraron máquinas asociadas a esta conservadora en el período seleccionado.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="flota-table" data-testid="tabla-flota-eca">
                  <thead>
                    <tr>
                      <th>Código AGC</th>
                      <th>Ascensor</th>
                      <th>Edificio / Consorcio</th>
                      <th>RT Calle</th>
                      <th>Estado de Inspección</th>
                      <th>Certificación Legal AGC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maquinas.map((m) => (
                      <tr key={m.id} data-testid={`fila-maquina-${m.id}`}>
                        <td>
                          <span className="agc-code">{m.codigoAGC}</span>
                        </td>
                        <td>
                          <strong>{m.nombre}</strong>
                          {m.estadoOperativo === 'Fuera de Servicio' && (
                            <span
                              className="badge badge-alerta-roja"
                              data-testid={`badge-alerta-${m.id}`}
                              style={{ display: 'inline-block', marginLeft: '6px' }}
                            >
                              🚨 Fuera de Servicio
                            </span>
                          )}
                          {m.estadoOperativo === 'Reparación Urgente' && (
                            <span
                              className="badge badge-alerta-naranja"
                              data-testid={`badge-alerta-${m.id}`}
                              style={{ display: 'inline-block', marginLeft: '6px' }}
                            >
                              ⚠️ Rep. Urgente
                            </span>
                          )}
                        </td>
                        <td>
                          <div>{m.edificio.direccion}</div>
                          <small className="text-muted">{m.edificio.consorcio}</small>
                        </td>
                        <td>{m.rtCalle}</td>
                        <td>
                          <span
                            className={`badge badge-${m.estado.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {m.estado}
                          </span>
                        </td>
                        <td>
                          {m.visita?.autorizada ? (
                            <div className="autorizada-cell">
                              <span className="badge badge-autorizada">✓ Firmada AGC</span>
                              {m.visita.protocoloAGC && (
                                <small className="protocolo-code">
                                  {m.visita.protocoloAGC}
                                </small>
                              )}
                            </div>
                          ) : (
                            <span className="badge badge-pendiente-de-visita">
                              Pendiente de Firma
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

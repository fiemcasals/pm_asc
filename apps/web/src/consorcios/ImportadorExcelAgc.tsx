import React, { useState } from 'react';
import {
  descargarPlantillaExcelAgc,
  ETIQUETAS_TIPO_MAQUINA,
  importarExcelAgc,
  ResultadoImportacionAgc,
  validarArchivoExcelAgc,
} from './consorcios';

interface ImportadorExcelAgcProps {
  onImportacionCompleta: (resultado: ResultadoImportacionAgc) => void;
  onCerrar: () => void;
}

export function ImportadorExcelAgc({ onImportacionCompleta, onCerrar }: ImportadorExcelAgcProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [descargandoPlantilla, setDescargandoPlantilla] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionAgc | null>(null);

  const handleSeleccionarArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seleccionado = e.target.files?.[0] ?? null;
    setError(null);
    setResultado(null);
    setArchivo(seleccionado);
    if (seleccionado) {
      const errValidacion = validarArchivoExcelAgc(seleccionado);
      if (errValidacion) {
        setError(errValidacion);
      }
    }
  };

  const handleDescargarPlantilla = async () => {
    setDescargandoPlantilla(true);
    setError(null);
    const res = await descargarPlantillaExcelAgc();
    setDescargandoPlantilla(false);
    if (!res.ok || !res.data) {
      setError(res.error || 'No se pudo descargar la plantilla .xlsx');
      return;
    }
    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-padron-agc.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errValidacion = validarArchivoExcelAgc(archivo);
    if (errValidacion || !archivo) {
      setError(errValidacion || 'Seleccioná un archivo .xlsx.');
      return;
    }

    setImportando(true);
    setError(null);
    const res = await importarExcelAgc(archivo);
    setImportando(false);

    if (!res.ok || !res.data) {
      setError(res.error || 'Error al importar el archivo .xlsx');
      return;
    }

    setResultado(res.data);
    onImportacionCompleta(res.data);
  };

  return (
    <div className="consorcio-form-card" style={{ marginBottom: '16px' }} data-testid="panel-importador-agc">
      <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <h3 className="section-title" style={{ margin: 0 }}>
            Importar listado Excel de la AGC (.xlsx)
          </h3>
          <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
            Columnas obligatorias: <strong>Dirección</strong>, <strong>Matrícula AGC</strong>, <strong>Tipo de equipo</strong> y <strong>Estado</strong>. Máximo 5 MB.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleDescargarPlantilla}
            disabled={descargandoPlantilla}
            data-testid="btn-descargar-plantilla-agc"
          >
            {descargandoPlantilla ? 'Descargando...' : 'Descargar plantilla .xlsx'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCerrar}
            data-testid="btn-cerrar-importador-agc"
          >
            Cerrar
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} data-testid="form-importar-agc">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleSeleccionarArchivo}
            aria-label="Archivo Excel AGC (.xlsx)"
            data-testid="input-archivo-agc"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={importando || !archivo}
            data-testid="btn-ejecutar-importacion-agc"
          >
            {importando ? 'Importando...' : 'Importar listado AGC'}
          </button>
        </div>
      </form>

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginTop: '12px' }} data-testid="error-importador-agc">
          {error}
        </div>
      )}

      {resultado && (
        <div style={{ marginTop: '16px' }} data-testid="resumen-importacion-agc">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div className="admin-info-box" style={{ flex: '1 1 140px', borderLeft: '4px solid #16a34a' }} data-testid="resumen-agc-creadas">
              <small className="text-muted">Máquinas creadas</small>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{resultado.creadas}</div>
            </div>
            <div className="admin-info-box" style={{ flex: '1 1 140px', borderLeft: '4px solid #2563eb' }} data-testid="resumen-agc-actualizadas">
              <small className="text-muted">Máquinas actualizadas</small>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{resultado.actualizadas}</div>
            </div>
            <div className="admin-info-box" style={{ flex: '1 1 140px', borderLeft: '4px solid #dc2626' }} data-testid="resumen-agc-rechazadas">
              <small className="text-muted">Filas rechazadas</small>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{resultado.rechazadas}</div>
            </div>
            <div className="admin-info-box" style={{ flex: '1 1 140px', borderLeft: '4px solid #0f766e' }} data-testid="resumen-agc-edificios">
              <small className="text-muted">Edificios creados</small>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{resultado.consorciosCreados}</div>
            </div>
          </div>

          {resultado.errores.length > 0 && (
            <div style={{ marginBottom: '12px' }} data-testid="tabla-errores-importacion-agc">
              <h4 className="section-title" style={{ color: '#b91c1c' }}>
                Filas rechazadas ({resultado.errores.length})
              </h4>
              <div className="table-responsive">
                <table className="ficha-table">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Matrícula AGC</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.errores.map((err, idx) => (
                      <tr key={`err-${err.fila}-${idx}`}>
                        <td><strong>#{err.fila}</strong></td>
                        <td>{err.matriculaAgc || '—'}</td>
                        <td>{err.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {resultado.detalle.length > 0 && (
            <div data-testid="tabla-detalle-importacion-agc">
              <h4 className="section-title">
                Máquinas procesadas ({resultado.detalle.length})
              </h4>
              <div className="table-responsive">
                <table className="ficha-table">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Acción</th>
                      <th>Matrícula AGC</th>
                      <th>Dirección</th>
                      <th>Tipo</th>
                      <th>Estado AGC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.detalle.map((d) => (
                      <tr key={`det-${d.fila}-${d.matriculaAgc}`}>
                        <td>#{d.fila}</td>
                        <td>
                          <span className={`badge ${d.accion === 'creada' ? 'badge-recorrida' : 'badge-autorizada'}`}>
                            {d.accion === 'creada' ? 'Creada' : 'Actualizada'}
                          </span>
                        </td>
                        <td><span className="agc-code">{d.matriculaAgc}</span></td>
                        <td>{d.direccion}</td>
                        <td>{ETIQUETAS_TIPO_MAQUINA[d.tipo]}</td>
                        <td><strong>{d.estadoAgc}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

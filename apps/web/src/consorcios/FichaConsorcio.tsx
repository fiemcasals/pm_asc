import React, { useEffect, useState } from 'react';
import {
  Consorcio,
  fetchAdvertenciasConsorcio,
  registrarVisitaFallida,
  ResumenAdvertenciasConsorcio,
  VisitaFallidaRegistro,
} from './consorcios';

interface FichaConsorcioProps {
  consorcio: Consorcio;
  onCerrar?: () => void;
}

export function FichaConsorcio({ consorcio, onCerrar }: FichaConsorcioProps) {
  const { id: consorcioId, nombre, direccion, administracion, maquinas, createdAt } = consorcio;

  const [resumen, setResumen] = useState<ResumenAdvertenciasConsorcio | null>(null);
  const [mostrarFormularioFallida, setMostrarFormularioFallida] = useState(false);
  const [fotoFrenteUrl, setFotoFrenteUrl] = useState(
    'https://storage.maicon.com.ar/fotos/frentes/frente-edificio-oficial.jpg',
  );
  const [gpsLat, setGpsLat] = useState(-34.603722);
  const [gpsLng, setGpsLng] = useState(-58.381592);
  const [motivo, setMotivo] = useState('No se pudo realizar la inspección: encargado ausente');
  const [enviando, setEnviando] = useState(false);
  const [mensajeResultado, setMensajeResultado] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [ultimaRegistrada, setUltimaRegistrada] = useState<VisitaFallidaRegistro | null>(null);

  const cargarResumen = async () => {
    const res = await fetchAdvertenciasConsorcio(consorcioId);
    if (res.ok && res.data) {
      setResumen(res.data);
    }
  };

  useEffect(() => {
    void cargarResumen();
    setMostrarFormularioFallida(false);
    setMensajeResultado(null);
    setErrorLocal(null);
    setUltimaRegistrada(null);
  }, [consorcioId]);

  const handleRegistrarFallida = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal(null);
    setMensajeResultado(null);

    if (!fotoFrenteUrl.trim()) {
      setErrorLocal('La fotografía del frente del edificio es obligatoria para certificar la presencia.');
      return;
    }

    if (isNaN(gpsLat) || isNaN(gpsLng) || gpsLat === 0 || gpsLng === 0) {
      setErrorLocal('Las coordenadas GPS congeladas son obligatorias y deben ser números válidos.');
      return;
    }

    setEnviando(true);
    try {
      const res = await registrarVisitaFallida({
        consorcioId,
        motivo,
        fotoFrenteUrl,
        gps: { latitud: gpsLat, longitud: gpsLng, precision: 4.0 },
        inspector: 'Inspector RT Calle de Guardia',
        emailAdministracion: administracion.email || undefined,
      });

      if (res.ok && res.data) {
        setUltimaRegistrada(res.data);
        setMensajeResultado(
          `¡Visita fallida certificada con éxito! Advertencia ${res.data.numeroAdvertencia} registrada.${
            res.data.emailNotificacion
              ? ` Notificación formal despachada a ${res.data.emailNotificacion.destinatario}.`
              : ''
          }`,
        );
        setMostrarFormularioFallida(false);
        void cargarResumen();
      } else {
        setErrorLocal(res.error || 'Error al registrar visita fallida');
      }
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error de comunicación');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <article
      className="ficha-tecnica-card"
      data-testid={`ficha-consorcio-${consorcioId}`}
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

        {/* Sección HU-07: Protocolo de Visitas Fallidas y Advertencias */}
        <div className="ficha-section" data-testid="seccion-visitas-fallidas">
          <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 className="section-title">
              Protocolo de Visitas Fallidas (HU-07)
            </h4>
            <button
              type="button"
              className="btn btn-warning btn-sm"
              onClick={() => setMostrarFormularioFallida(!mostrarFormularioFallida)}
              data-testid="btn-toggle-visita-fallida"
            >
              {mostrarFormularioFallida ? '✕ Cancelar Reporte' : '⚠️ Registrar Visita Fallida'}
            </button>
          </div>

          {/* Estado de advertencias */}
          <div className="admin-info-box" style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong>Estado de Advertencias:</strong>
              {resumen && resumen.totalAdvertencias > 0 ? (
                <span
                  className="badge badge-advertencia"
                  data-testid="badge-advertencia-consorcio"
                >
                  ⚠️ Advertencia {resumen.ultimaAdvertencia} ({resumen.totalAdvertencias} acumulada{resumen.totalAdvertencias > 1 ? 's' : ''})
                </span>
              ) : (
                <span className="badge badge-recorrida" data-testid="badge-sin-advertencias">
                  ✓ Al día (Sin advertencias)
                </span>
              )}
            </div>

            {mensajeResultado && (
              <div className="alert alert-success" style={{ marginTop: '10px' }} role="status" data-testid="mensaje-exito-fallida">
                {mensajeResultado}
              </div>
            )}

            {errorLocal && (
              <div className="alert alert-error" style={{ marginTop: '10px' }} role="alert">
                {errorLocal}
              </div>
            )}

            {/* Constancia de correo despachado */}
            {ultimaRegistrada?.emailNotificacion && (
              <div
                className="acuse-recibo-legal-box"
                style={{ marginTop: '12px' }}
                data-testid="constancia-email-consorcio"
              >
                <span className="acuse-recibo-icono">📧</span>
                <div>
                  <strong>Notificación Formal Despachada por Correo:</strong>
                  <div className="acuse-meta-texto">
                    Destino: {ultimaRegistrada.emailNotificacion.destinatario} | Remitente: {ultimaRegistrada.emailNotificacion.remitente}
                    <br />
                    Asunto: {ultimaRegistrada.emailNotificacion.asunto}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Formulario de registro de visita fallida con foto y GPS congelado */}
          {mostrarFormularioFallida && (
            <form
              onSubmit={handleRegistrarFallida}
              style={{
                marginTop: '12px',
                padding: '16px',
                background: 'var(--surface-sunken, #f8fafc)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: '8px',
              }}
              data-testid="form-visita-fallida"
            >
              <h5 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 600 }}>
                Certificar Reporte de No Acceso / Ausencia
              </h5>

              <div className="form-field" style={{ marginBottom: '10px' }}>
                <label className="field-label" htmlFor="vf-motivo">
                  Motivo de la Visita Fallida *
                </label>
                <input
                  id="vf-motivo"
                  type="text"
                  className="field-input"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. No se pudo realizar la inspección: encargado ausente"
                  data-testid="input-motivo-fallida"
                  required
                />
              </div>

              <div className="form-field" style={{ marginBottom: '10px' }}>
                <label className="field-label" htmlFor="vf-foto">
                  Fotografía Obligatoria del Frente del Edificio (URL) *
                </label>
                <input
                  id="vf-foto"
                  type="url"
                  className="field-input"
                  value={fotoFrenteUrl}
                  onChange={(e) => setFotoFrenteUrl(e.target.value)}
                  placeholder="https://..."
                  data-testid="input-foto-frente"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div className="form-field">
                  <label className="field-label" htmlFor="vf-lat">
                    GPS Congelado: Latitud *
                  </label>
                  <input
                    id="vf-lat"
                    type="number"
                    step="0.000001"
                    className="field-input"
                    value={gpsLat}
                    onChange={(e) => setGpsLat(parseFloat(e.target.value))}
                    data-testid="input-gps-lat"
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="field-label" htmlFor="vf-lng">
                    GPS Congelado: Longitud *
                  </label>
                  <input
                    id="vf-lng"
                    type="number"
                    step="0.000001"
                    className="field-input"
                    value={gpsLng}
                    onChange={(e) => setGpsLng(parseFloat(e.target.value))}
                    data-testid="input-gps-lng"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setMostrarFormularioFallida(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-warning btn-sm"
                  disabled={enviando}
                  data-testid="btn-confirmar-visita-fallida"
                >
                  {enviando ? 'Validando y Despachando…' : 'Validar y Despachar Notificación'}
                </button>
              </div>
            </form>
          )}
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

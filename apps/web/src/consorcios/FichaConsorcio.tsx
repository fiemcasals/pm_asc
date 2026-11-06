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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span className="badge badge-recorrida">
              Ficha Oficial de Edificio
            </span>
            {resumen?.bloqueadoPorTerceraVisita && (
              <span
                className="badge badge-error"
                data-testid="badge-edificio-bloqueado"
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  fontWeight: 'bold',
                }}
              >
                🚫 Bloqueado — Cobro de Tercer Visita Habilitado
              </span>
            )}
          </div>
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

            {/* Cartel Bloqueo por Tercera Visita (HU-07 / RF-02 Criterio 1) */}
            {resumen?.bloqueadoPorTerceraVisita && (
              <div
                className="cartel-bloqueo-tercera-visita"
                data-testid="cartel-bloqueo-tercera-visita"
                style={{
                  marginTop: '12px',
                  padding: '16px',
                  background: '#fef2f2',
                  border: '2px solid #ef4444',
                  borderRadius: '8px',
                  color: '#991b1b',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '22px' }}>🚫</span>
                  <h5
                    style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}
                    data-testid="aviso-cobro-tercer-visita"
                  >
                    {resumen.avisoCobro || 'Cobro de Tercer Visita Habilitado'}
                  </h5>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '13px', lineHeight: '1.4' }}>
                  El edificio ha acumulado <strong>3 visitas fallidas consecutivas</strong>. Queda automáticamente{' '}
                  <strong>bloqueado en el tablero</strong> de inspecciones y se encuentra habilitado para cobro técnico extraordinario
                  con el recargo del <strong>45% extra</strong> en la liquidación mensual de cada máquina.
                </p>
                <span
                  className="badge badge-danger"
                  data-testid="badge-bloqueo-activo"
                  style={{ background: '#b91c1c', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}
                >
                  🔒 Edificio Bloqueado en Tablero
                </span>
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

        {/* Sección HU-07 / RF-02: Módulo de Facturación Mensual y Liquidación con Recargo del 45% */}
        <div className="ficha-section" data-testid="seccion-facturacion-mensual">
          <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h4 className="section-title">
              Módulo de Facturación Mensual (Liquidación de Máquinas)
            </h4>
            {resumen?.recargoAplicable ? (
              <span
                className="badge"
                data-testid="badge-recargo-45-habilitado"
                style={{
                  background: '#fee2e2',
                  color: '#991b1b',
                  border: '1px solid #ef4444',
                  fontWeight: 'bold',
                }}
              >
                ⚠️ Recargo 45% Extra Aplicado (Advertencia 3)
              </span>
            ) : (
              <span className="badge badge-recorrida" data-testid="badge-tarifa-regular">
                Tarifa Regular (Sin Recargo)
              </span>
            )}
          </div>

          <div className="table-responsive" style={{ marginTop: '10px' }}>
            <table className="ficha-table" data-testid="tabla-facturacion-maquinas">
              <thead>
                <tr>
                  <th>Máquina (AGC)</th>
                  <th>Concepto Liquidación</th>
                  <th>Abono Base</th>
                  <th>Recargo Extra (45%)</th>
                  <th>Total Liquidado</th>
                </tr>
              </thead>
              <tbody>
                {maquinas.map((m) => {
                  const abonoBase = 150000;
                  const recargo = resumen?.recargoAplicable ? Math.round(abonoBase * 0.45) : 0;
                  const total = abonoBase + recargo;

                  return (
                    <tr key={`fact-${m.id || m.referenciaAgc}`} data-testid={`fila-facturacion-${m.referenciaAgc}`}>
                      <td>
                        <span className="agc-code">{m.referenciaAgc}</span>
                      </td>
                      <td>
                        Abono mensual conservación
                        {resumen?.recargoAplicable && (
                          <div style={{ color: '#b91c1c', fontSize: '12px', fontWeight: 600 }}>
                            + Cobro de Tercer Visita Habilitado
                          </div>
                        )}
                      </td>
                      <td>${abonoBase.toLocaleString('es-AR')}</td>
                      <td>
                        {resumen?.recargoAplicable ? (
                          <span
                            style={{ color: '#dc2626', fontWeight: 'bold' }}
                            data-testid={`recargo-valor-${m.referenciaAgc}`}
                          >
                            +${recargo.toLocaleString('es-AR')} (45%)
                          </span>
                        ) : (
                          <span className="text-muted">$0 (0%)</span>
                        )}
                      </td>
                      <td>
                        <strong data-testid={`total-maquina-${m.referenciaAgc}`}>
                          ${total.toLocaleString('es-AR')}
                        </strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-sunken, #f8fafc)', fontWeight: 'bold' }}>
                  <td colSpan={2}>Total Consolidado ({maquinas.length} máquinas):</td>
                  <td>${(maquinas.length * 150000).toLocaleString('es-AR')}</td>
                  <td>
                    {resumen?.recargoAplicable ? (
                      <span style={{ color: '#dc2626' }}>
                        +${Math.round(maquinas.length * 150000 * 0.45).toLocaleString('es-AR')}
                      </span>
                    ) : (
                      '$0'
                    )}
                  </td>
                  <td
                    style={{
                      color: resumen?.recargoAplicable ? '#b91c1c' : '#1e293b',
                      fontSize: '15px',
                    }}
                    data-testid="total-liquidacion-consorcio"
                  >
                    ${(
                      maquinas.length *
                      (150000 + (resumen?.recargoAplicable ? Math.round(150000 * 0.45) : 0))
                    ).toLocaleString('es-AR')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
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

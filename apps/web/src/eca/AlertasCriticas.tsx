import React, { useState } from 'react';
import { descargarRemitoTecnico, type MaquinaEca, type RemitoTecnico } from './eca';

interface AlertasCriticasProps {
  maquinas: MaquinaEca[];
  onAcuseRegistrado?: (alertaId: string, fechaHora: string, usuario: string) => void;
}

export function AlertasCriticas({ maquinas, onAcuseRegistrado }: AlertasCriticasProps) {
  const [descargandoId, setDescargandoId] = useState<string | null>(null);
  const [acusesLocales, setAcusesLocales] = useState<
    Record<string, { fechaHora: string; usuario: string }>
  >({});
  const [mensajeDescarga, setMensajeDescarga] = useState<string | null>(null);

  // Filtrar máquinas que tengan alertas críticas o estados Fuera de Servicio / Reparación Urgente
  const maquinasConAlerta = maquinas.filter(
    (m) =>
      Boolean(m.alertaCritica) ||
      m.estadoOperativo === 'Fuera de Servicio' ||
      m.estadoOperativo === 'Reparación Urgente',
  );

  if (maquinasConAlerta.length === 0) {
    return null;
  }

  const alertasFueraDeServicio = maquinasConAlerta.filter(
    (m) =>
      m.estadoOperativo === 'Fuera de Servicio' ||
      m.alertaCritica?.tipo === 'FUERA_DE_SERVICIO',
  );

  const alertasReparacionUrgente = maquinasConAlerta.filter(
    (m) =>
      m.estadoOperativo === 'Reparación Urgente' ||
      m.alertaCritica?.tipo === 'REPARACION_URGENTE',
  );

  const handleDescargarRemito = async (m: MaquinaEca) => {
    const alertaId = m.alertaCritica?.id || `ALT-${m.id}`;
    setDescargandoId(alertaId);
    setMensajeDescarga(null);

    try {
      const usuario = m.eca.toLowerCase().includes('maicon')
        ? 'operador.legal@maicon.com.ar'
        : 'responsable.tecnico@eca.com.ar';

      const res = await descargarRemitoTecnico(alertaId, usuario);

      if (res.ok && res.data) {
        const remito = res.data;
        const fechaHora = remito.acuseLegal.fechaHora;
        const acuseUser = remito.acuseLegal.usuario;

        setAcusesLocales((prev) => ({
          ...prev,
          [alertaId]: { fechaHora, usuario: acuseUser },
        }));

        if (onAcuseRegistrado) {
          onAcuseRegistrado(alertaId, fechaHora, acuseUser);
        }

        // Crear descarga de archivo en el navegador
        const blob = new Blob([JSON.stringify(remito, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Remito-Tecnico-${m.codigoAGC}-${alertaId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setMensajeDescarga(
          `Remito de notificación descargado. Acuse legal registrado para ${m.eca} a las ${new Date(fechaHora).toLocaleTimeString('es-AR')}.`,
        );
      } else {
        setMensajeDescarga(res.error || 'No se pudo descargar el remito de notificación');
      }
    } catch (err) {
      setMensajeDescarga(
        err instanceof Error ? err.message : 'Error al procesar la descarga del remito',
      );
    } finally {
      setDescargandoId(null);
    }
  };

  return (
    <div
      className="alertas-criticas-wrapper"
      aria-label="Centro de Alertas Críticas de Seguridad"
      data-testid="alertas-criticas-wrapper"
    >
      <div className="alertas-summary-header">
        <span className="alertas-pulse-dot" />
        <h3 className="alertas-summary-title">
          Alertas Críticas de Flota ({maquinasConAlerta.length} equipos requieren intervención inmediata)
        </h3>
      </div>

      {mensajeDescarga && (
        <div className="alerta-notificacion-descarga" role="status" data-testid="mensaje-descarga-remito">
          ✓ {mensajeDescarga}
        </div>
      )}

      {/* Criterio 1: Alerta titilante roja de Fuera de Servicio con motivo y foto de cabina trabada */}
      {alertasFueraDeServicio.map((m) => {
        const alerta = m.alertaCritica;
        const alertaId = alerta?.id || `ALT-${m.id}`;
        const acuse = acusesLocales[alertaId] || alerta?.acuseRecibo;
        const motivo =
          alerta?.motivo ||
          'Cabina trabada mecánicamente en hueco con acuñamiento forzado. Equipo desenergizado.';
        const foto =
          alerta?.fotografiaCabinaTrabada ||
          'https://storage.nuestrocamino.cloud/fotos/cabina-trabada-default.jpg';

        return (
          <div
            key={m.id}
            className="alerta-card alerta-fuera-de-servicio alerta-titilante-roja"
            data-testid="alerta-fuera-de-servicio"
            role="alert"
          >
            <div className="alerta-card-badge badge-rojo-titilante">
              <span className="alerta-siren">🚨</span> ALERTA CRÍTICA: FUERA DE SERVICIO
            </div>

            <div className="alerta-card-body">
              <div className="alerta-card-info">
                <h4 className="alerta-equipo-titulo" data-testid="titulo-fuera-de-servicio">
                  {m.codigoAGC} - {m.nombre}
                </h4>
                <div className="alerta-ubicacion">
                  <strong>Edificio:</strong> {m.edificio.direccion} ({m.edificio.consorcio})
                </div>
                <div className="alerta-motivo-box">
                  <span className="alerta-motivo-label">Motivo de Fuera de Servicio:</span>
                  <p className="alerta-motivo-texto" data-testid="motivo-fuera-de-servicio">
                    {motivo}
                  </p>
                </div>
                {alerta?.fechaDeteccion && (
                  <div className="alerta-fecha">
                    🕒 Detección: {new Date(alerta.fechaDeteccion).toLocaleString('es-AR')}
                  </div>
                )}

                {/* Botón de descarga de remito y registro de acuse legal */}
                <div className="alerta-acciones-container">
                  <button
                    className="btn-descargar-remito btn-remito-rojo"
                    data-testid={`btn-descargar-remito-${m.id}`}
                    onClick={() => handleDescargarRemito(m)}
                    disabled={descargandoId === alertaId}
                  >
                    📥 Descargar Remito de Notificación
                  </button>

                  {acuse && (
                    <div
                      className="acuse-recibo-legal-box"
                      data-testid={`acuse-recibo-${m.id}`}
                    >
                      <span className="acuse-recibo-icono">⚖️</span>
                      <div>
                        <strong>Acuse de Recibo Legal Registrado:</strong>
                        <div className="acuse-meta-texto">
                          Fecha y Hora:{' '}
                          {new Date(acuse.fechaHora).toLocaleString('es-AR')} | Usuario:{' '}
                          {acuse.usuario} ({m.eca})
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Fotografía de la cabina trabada */}
              <div
                className="alerta-foto-container"
                data-testid="contenedor-foto-cabina-trabada"
              >
                <div className="foto-frame">
                  <img
                    src={foto}
                    alt="Fotografía de la cabina trabada"
                    className="foto-cabina-trabada"
                    data-testid="foto-cabina-trabada"
                  />
                  <span className="foto-badge">Fotografía de Cabina Trabada</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Criterio 2: Cartel naranja gigante de Reparación Urgente con detalle del checklist */}
      {alertasReparacionUrgente.map((m) => {
        const alerta = m.alertaCritica;
        const alertaId = alerta?.id || `ALT-${m.id}`;
        const acuse = acusesLocales[alertaId] || alerta?.acuseRecibo;
        const motivo =
          alerta?.motivo ||
          'Anomalías graves detectadas operando: Freno con deslizamiento crítico y riesgo operacional.';
        const checklist = alerta?.checklist || [
          {
            item: 'Freno electromagnético de máquina tractora',
            estado: 'Critico' as const,
            observaciones: 'Deslizamiento severo de 18 cm en prueba con carga nominal',
          },
          {
            item: 'Cables de tracción y amarres',
            estado: 'Falla' as const,
            observaciones: 'Deshilachado visible en 2 torones del cable central',
          },
          {
            item: 'Cerraduras electromecánicas de palier',
            estado: 'Critico' as const,
            observaciones: 'Patín retráctil con falso contacto y falla en piso 3',
          },
          {
            item: 'Limitador de velocidad',
            estado: 'Critico' as const,
            observaciones: 'Traba centrífuga sin precinto oficial y con juego axial',
          },
        ];

        return (
          <div
            key={m.id}
            className="cartel-reparacion-urgente-gigante"
            data-testid="cartel-reparacion-urgente"
            role="alert"
          >
            <div className="cartel-header">
              <span className="cartel-icon">⚠️</span>
              <div className="cartel-title-group">
                <span className="cartel-super-badge">ANOMALÍAS GRAVES DETECTADAS OPERANDO</span>
                <h3 className="cartel-main-title" data-testid="titulo-reparacion-urgente">
                  CARTEL GIGANTE: REPARACIÓN URGENTE — {m.codigoAGC} ({m.nombre})
                </h3>
                <div className="cartel-subtitle">
                  {m.edificio.direccion} — {m.edificio.consorcio} | Conservadora: {m.eca}
                </div>
              </div>
            </div>

            <div className="cartel-motivo-box">
              <strong>Diagnóstico Técnico Inmediato:</strong>
              <p className="cartel-motivo-texto" data-testid="motivo-reparacion-urgente">
                {motivo}
              </p>
            </div>

            {/* Detalle del checklist de anomalías graves */}
            <div
              className="checklist-urgente-wrapper"
              data-testid="checklist-anomalias-graves"
            >
              <div className="checklist-header-row">
                <h4 className="checklist-title">
                  📋 Detalle del Checklist de Anomalías Graves Inspeccionadas:
                </h4>
                <span className="checklist-count-tag">
                  {checklist.length} puntos críticos identificados
                </span>
              </div>

              <div className="checklist-table-responsive">
                <table className="checklist-table" data-testid="tabla-checklist-urgente">
                  <thead>
                    <tr>
                      <th style={{ width: '35%' }}>Componente de Seguridad</th>
                      <th style={{ width: '20%' }}>Severidad</th>
                      <th style={{ width: '45%' }}>Observación Técnica del Inspector</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklist.map((item, idx) => (
                      <tr key={idx} data-testid={`checklist-item-${idx}`}>
                        <td>
                          <strong>{item.item}</strong>
                        </td>
                        <td>
                          <span
                            className={`badge-severidad badge-severidad-${item.estado.toLowerCase()}`}
                          >
                            ⚠️ {item.estado.toUpperCase()}
                          </span>
                        </td>
                        <td className="checklist-obs-cell">{item.observaciones}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Botón de descarga de remito y registro de acuse legal para reparación urgente */}
            <div className="alerta-acciones-container">
              <button
                className="btn-descargar-remito btn-remito-naranja"
                data-testid={`btn-descargar-remito-${m.id}`}
                onClick={() => handleDescargarRemito(m)}
                disabled={descargandoId === alertaId}
              >
                📥 Descargar Remito de Notificación
              </button>

              {acuse && (
                <div
                  className="acuse-recibo-legal-box"
                  data-testid={`acuse-recibo-${m.id}`}
                >
                  <span className="acuse-recibo-icono">⚖️</span>
                  <div>
                    <strong>Acuse de Recibo Legal Registrado:</strong>
                    <div className="acuse-meta-texto">
                      Fecha y Hora: {new Date(acuse.fechaHora).toLocaleString('es-AR')} | Usuario:{' '}
                      {acuse.usuario} ({m.eca})
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

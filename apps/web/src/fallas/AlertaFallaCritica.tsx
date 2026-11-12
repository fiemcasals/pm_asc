import React, { useEffect, useState } from 'react';
import {
  ETIQUETA_FALLA,
  EventoFallaCritica,
  reproducirAvisoSonoro,
  suscribirFallasCriticas,
} from './fallas';

/**
 * Notificación emergente del panel de Secretaría: escucha las fallas críticas en tiempo real y
 * muestra cada una con aviso sonoro y enlace directo al informe. Si llegan varias, se apilan y
 * se muestran de a una, la más vieja primero, hasta que se marquen como vistas.
 */
export function AlertaFallaCritica() {
  const [pendientes, setPendientes] = useState<EventoFallaCritica[]>([]);

  useEffect(
    () =>
      suscribirFallasCriticas((evento) => {
        setPendientes((actuales) =>
          actuales.some((e) => e.informeId === evento.informeId) ? actuales : [...actuales, evento],
        );
        reproducirAvisoSonoro();
      }),
    [],
  );

  const actual = pendientes[0];
  if (!actual) return null;

  return (
    <div
      className="falla-toast"
      role="alertdialog"
      aria-live="assertive"
      aria-labelledby="falla-toast-titulo"
      data-testid="alerta-falla-critica"
    >
      <div className="falla-toast-header">
        <h3 id="falla-toast-titulo">🚨 Falla crítica reportada</h3>
        {pendientes.length > 1 && (
          <span className="falla-toast-contador" data-testid="alerta-falla-pendientes">
            1 de {pendientes.length}
          </span>
        )}
      </div>
      <p className="falla-toast-maquina">
        {actual.codigoAGC} — {actual.nombreMaquina}
        <br />
        {actual.direccion} ({actual.consorcio})
      </p>
      <ul className="falla-toast-fallas">
        {actual.fallas.map((f) => (
          <li key={f}>{ETIQUETA_FALLA[f]}</li>
        ))}
      </ul>
      <p className="falla-toast-meta">
        Informó: {actual.inspector} · ECA: {actual.eca} ·{' '}
        {new Date(actual.registradoEn).toLocaleString('es-AR')}
      </p>
      <div className="falla-toast-acciones">
        <a
          className="btn btn-danger"
          href={actual.enlaceInforme}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="alerta-falla-ver-informe"
        >
          Ver informe técnico
        </a>
        <button
          className="btn btn-secondary"
          onClick={() => setPendientes((p) => p.slice(1))}
          data-testid="alerta-falla-entendido"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

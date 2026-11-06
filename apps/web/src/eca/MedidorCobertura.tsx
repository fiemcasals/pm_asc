import React from 'react';
import { CoberturaEca, getCoberturaColor } from './eca';

interface MedidorCoberturaProps {
  cobertura: CoberturaEca;
}

export function MedidorCobertura({ cobertura }: MedidorCoberturaProps) {
  const {
    totalMaquinas,
    inspeccionadas,
    firmadas,
    pendientes,
    advertencias,
    porcentajeInspeccionadas,
    porcentajeFirmadas,
    porcentajeCobertura,
  } = cobertura;

  const color = getCoberturaColor(porcentajeCobertura);
  const circunferencia = 2 * Math.PI * 45; // radio = 45
  const strokeDashoffset = circunferencia - (porcentajeCobertura / 100) * circunferencia;

  return (
    <div className="medidor-card" data-testid="medidor-cobertura">
      <div className="medidor-header">
        <h3 className="medidor-title">Medidor de Cobertura Mensual</h3>
        <span className="badge badge-modo-consulta">Modo Consulta Oficial</span>
      </div>

      <div className="medidor-content">
        {/* Gráfico circular / Gauge de cobertura */}
        <div className="gauge-container" role="img" aria-label={`Cobertura del ${porcentajeCobertura}%`}>
          <svg className="gauge-svg" viewBox="0 0 100 100">
            {/* Círculo base de fondo */}
            <circle
              className="gauge-bg"
              cx="50"
              cy="50"
              r="45"
              fill="transparent"
              stroke="#e2e8f0"
              strokeWidth="10"
            />
            {/* Círculo indicador reactivo */}
            <circle
              className="gauge-bar"
              cx="50"
              cy="50"
              r="45"
              fill="transparent"
              stroke={color}
              strokeWidth="10"
              strokeDasharray={circunferencia}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="gauge-label">
            <span className="gauge-percent" data-testid="porcentaje-cobertura">
              {porcentajeCobertura}%
            </span>
            <span className="gauge-sub">Firmadas AGC</span>
          </div>
        </div>

        {/* Métricas detalladas del mes */}
        <div className="medidor-stats-grid">
          <div className="metric-chip">
            <span className="metric-title">Flota Total</span>
            <strong className="metric-value">{totalMaquinas}</strong>
            <small>máquinas</small>
          </div>

          <div className="metric-chip metric-chip-inspeccionadas">
            <span className="metric-title">Inspeccionadas</span>
            <strong className="metric-value">{inspeccionadas}</strong>
            <small>{porcentajeInspeccionadas}% del total</small>
          </div>

          <div className="metric-chip metric-chip-firmadas">
            <span className="metric-title">Firmadas (Legal AGC)</span>
            <strong className="metric-value" data-testid="valor-firmadas">
              {firmadas}
            </strong>
            <small>{porcentajeFirmadas}% cobertura</small>
          </div>

          <div className="metric-chip metric-chip-pendientes">
            <span className="metric-title">Pendientes de Visita</span>
            <strong className="metric-value">{pendientes}</strong>
            <small>por recorrer</small>
          </div>

          {advertencias > 0 && (
            <div className="metric-chip metric-chip-advertencias">
              <span className="metric-title">Con Advertencia</span>
              <strong className="metric-value">{advertencias}</strong>
              <small>requieren acción</small>
            </div>
          )}
        </div>
      </div>

      {/* Barra de progreso lineal complementaria */}
      <div className="progress-container">
        <div className="progress-label-row">
          <span>Avance de cobertura de flota certificada</span>
          <strong>{porcentajeCobertura}% completado</strong>
        </div>
        <div className="progress-track" role="progressbar" aria-valuenow={porcentajeCobertura} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="progress-fill"
            style={{ width: `${porcentajeCobertura}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

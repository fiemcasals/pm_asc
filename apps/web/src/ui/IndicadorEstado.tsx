import React from 'react';
import type { HealthState } from '../health';

/** Lo que dice el indicador del pie del menú lateral: si la API y la base responden, o que hay que revisar. */
export function textoDelIndicador(health: HealthState | null): string {
  if (health === null) return 'Conectando…';
  return health.kind === 'ok' ? 'API + PostGIS OK' : 'Revisar sistema';
}

/**
 * Indicador chico del estado de la API y de la base, al pie del menú lateral. Sólo informa: no es un botón ni lleva a ninguna pantalla
 * (la vista de telemetría con las tarjetas se retiró, HU-12 RF-04). Con el menú colapsado queda sólo el punto de color.
 */
export function IndicadorEstado({ health, colapsado = false }: { health: HealthState | null; colapsado?: boolean }) {
  const claseDelPunto = health === null ? 'dot-pending' : health.kind === 'ok' ? 'dot-ok' : 'dot-error';
  return (
    <div className="neo-status-pill" role="status" title="Estado de la API y de la base de datos" data-testid="indicador-estado">
      <span className={`neo-dot ${claseDelPunto}`} />
      {!colapsado && <span className="neo-status-label">{textoDelIndicador(health)}</span>}
    </div>
  );
}

import React from 'react';
import {
  type ChecklistMotorConfig,
  type ChecklistSolapaConfig,
  type EstadoEquipoUso,
  type SolapaId,
} from './checklist.config';
import {
  evaluarEstadoSolapa,
  type FotosPorEquipo,
  type ObservacionesChecklist,
  type RespuestasChecklist,
} from './checklist.logic';

export interface ChecklistSolapaViewProps {
  config: ChecklistMotorConfig;
  solapaActivaId: SolapaId;
  onCambiarSolapa: (id: SolapaId) => void;
  respuestas: RespuestasChecklist;
  observaciones: ObservacionesChecklist;
  fotos?: FotosPorEquipo;
  estadoEquipo?: EstadoEquipoUso;
  onSeleccionarOpcion: (solapaId: SolapaId, itemId: string, opcionId: string) => void;
  onCambiarObservacion: (solapaId: SolapaId, texto: string) => void;
  headerSolapa?: (solapa: ChecklistSolapaConfig) => React.ReactNode;
  extraEnSolapa?: (solapa: ChecklistSolapaConfig) => React.ReactNode;
  renderAccionItem?: (solapaId: SolapaId, itemId: string, opcionId: string) => React.ReactNode;
  footerSolapa?: (solapa: ChecklistSolapaConfig) => React.ReactNode;
}

/**
 * Pantalla genérica conducida por el motor configurable (HU-17 RF-04).
 * Dibuja las 5 solapas desde `config.solapas` sin componentes fijos por estación.
 */
export function ChecklistSolapaView({
  config,
  solapaActivaId,
  onCambiarSolapa,
  respuestas,
  observaciones,
  fotos = {},
  estadoEquipo = 'en_uso',
  onSeleccionarOpcion,
  onCambiarObservacion,
  headerSolapa,
  extraEnSolapa,
  renderAccionItem,
  footerSolapa,
}: ChecklistSolapaViewProps) {
  const solapaActiva =
    config.solapas.find((s) => s.id === solapaActivaId) ?? config.solapas[0];

  if (!solapaActiva) return null;

  const obsActual = observaciones[solapaActiva.id] ?? '';
  const respuestasSolapa = respuestas[solapaActiva.id] ?? {};
  const estadoActiva = evaluarEstadoSolapa(solapaActiva, respuestasSolapa, fotos, estadoEquipo);

  return (
    <div className="checklist-shell" data-testid="checklist-solapa-view">
      <div className="checklist-tablist" role="tablist" aria-label="Solapas de inspección">
        {config.solapas.map((solapa) => {
          const activa = solapa.id === solapaActiva.id;
          const { respondidos, total, completa } = evaluarEstadoSolapa(
            solapa,
            respuestas[solapa.id],
            fotos,
            estadoEquipo,
          );

          return (
            <button
              key={solapa.id}
              type="button"
              role="tab"
              aria-selected={activa}
              className={`checklist-tab ${activa ? 'active' : ''} ${completa ? 'completa' : ''}`}
              onClick={() => onCambiarSolapa(solapa.id)}
              data-testid={`solapa-tab-${solapa.id}`}
            >
              <span className="checklist-tab-nombre">{solapa.nombre}</span>
              {completa ? (
                <span
                  className="solapa-tilde"
                  data-testid={`solapa-tilde-${solapa.id}`}
                  aria-label="Solapa completa"
                >
                  ✓
                </span>
              ) : (
                <span
                  className="checklist-tab-conteo"
                  data-testid={`solapa-conteo-${solapa.id}`}
                >
                  {respondidos}/{total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section
        className="checklist-panel card"
        role="tabpanel"
        aria-label={solapaActiva.nombre}
        data-testid={`solapa-panel-${solapaActiva.id}`}
      >
        <div className="checklist-panel-head">
          <div>
            <h3 className="checklist-panel-title">{solapaActiva.nombre}</h3>
            <span className="checklist-version">Motor v{config.version}</span>
          </div>
          {estadoActiva.completa && (
            <span className="checklist-badge-completa">Completa</span>
          )}
          {!estadoActiva.completa && estadoActiva.faltanFotosObligatorias.length > 0 && (
            <span className="checklist-badge-falta-foto" data-testid="badge-falta-foto-critica">
              Falta foto obligatoria ({estadoActiva.faltanFotosObligatorias.length})
            </span>
          )}
        </div>

        {headerSolapa?.(solapaActiva)}

        <div className="checklist-subgrupos">
          {solapaActiva.subgrupos.map((subgrupo) => (
            <div
              key={subgrupo.id}
              className="checklist-subgrupo"
              data-testid={`subgrupo-${subgrupo.id}`}
            >
              <h4 className="checklist-subgrupo-title">
                {subgrupo.titulo}
                {subgrupo.esEntornoCompartido && (
                  <span className="checklist-shared-pill">Entorno compartido</span>
                )}
              </h4>

              <div className="checklist-items">
                {subgrupo.items.map((item) => {
                  const elegidaId = respuestasSolapa[item.id];
                  return (
                    <div
                      key={item.id}
                      className="checklist-item"
                      data-testid={`item-${item.id}`}
                    >
                      <div className="checklist-item-label">{item.etiqueta}</div>
                      <div className="checklist-opciones" role="radiogroup" aria-label={item.etiqueta}>
                        {item.opciones.map((op) => {
                          const selected = elegidaId === op.id;
                          const tono = selected
                            ? op.esFallaCritica
                              ? 'critica'
                              : op.esFalla
                                ? 'falla'
                                : 'ok'
                            : 'neutral';

                          return (
                            <button
                              key={op.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              className={`checklist-opcion tono-${tono} ${selected ? 'selected' : ''}`}
                              onClick={() =>
                                onSeleccionarOpcion(solapaActiva.id, item.id, op.id)
                              }
                              data-testid={`opcion-${item.id}-${op.id}`}
                            >
                              <span className="checklist-opcion-texto">{op.etiqueta}</span>
                              {op.esFallaCritica && (
                                <span className="checklist-opcion-flag flag-critica">
                                  Crítica
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {elegidaId && renderAccionItem?.(solapaActiva.id, item.id, elegidaId)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {extraEnSolapa?.(solapaActiva)}

        <div className="checklist-observaciones-wrap">
          <label className="checklist-obs-label" htmlFor={`obs-${solapaActiva.id}`}>
            Observaciones
          </label>
          <textarea
            id={`obs-${solapaActiva.id}`}
            className="checklist-obs-textarea"
            rows={3}
            placeholder="Escribí observaciones o usá el micrófono del teclado del celular…"
            value={obsActual}
            onChange={(e) => onCambiarObservacion(solapaActiva.id, e.target.value)}
            data-testid={`obs-${solapaActiva.id}`}
          />
        </div>

        {footerSolapa?.(solapaActiva)}
      </section>
    </div>
  );
}


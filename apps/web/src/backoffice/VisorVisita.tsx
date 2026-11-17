import React, { useEffect, useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import { type DetalleVisita, cargarDetalle, fecha, fotoSegura } from './monitoreo';

/** Visor de fotos e informe de una visita (HU-05 RF-02): las fotos, el checklist con su estado y el motivo. */
export function VisorVisita({ maquinaId, onCerrar }: { maquinaId: string; onCerrar: () => void }) {
  const [detalle, setDetalle] = useState<DetalleVisita | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let activo = true;
    setDetalle(null);
    setError(false);
    void cargarDetalle(maquinaId, fetchConSesion).then((d) => {
      if (!activo) return;
      if (d) setDetalle(d);
      else setError(true);
    });
    return () => {
      activo = false;
    };
  }, [maquinaId]);

  return (
    <section role="dialog" aria-labelledby="visor-titulo" aria-modal="false" className="visor-visita" data-testid="visor-visita" style={{ border: '1px solid var(--border, #cbd5e1)', borderRadius: 8, padding: 12, margin: '12px 0' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <h3 id="visor-titulo" style={{ margin: 0 }}>
          Fotos e informe de la visita
        </h3>
        <button type="button" className="btn btn-secondary" onClick={onCerrar} aria-label="Cerrar el visor" data-testid="visor-cerrar">
          ✕
        </button>
      </header>
      {!detalle && !error && <p className="portal-desc">Cargando…</p>}
      {error && (
        <p className="error" role="alert" data-testid="visor-error">
          No se pudo cargar la visita.
        </p>
      )}
      {detalle && (
        <>
          <dl data-testid="visor-datos">
            <dt>Edificio</dt>
            <dd>
              {detalle.direccion} ({detalle.consorcio})
            </dd>
            <dt>ECA · Inspector · Fecha</dt>
            <dd>
              {detalle.eca} · {detalle.inspector} · {fecha(detalle.fecha)}
            </dd>
            {detalle.nombreEncargado && (
              <>
                <dt>Atendió</dt>
                <dd>{detalle.nombreEncargado}</dd>
              </>
            )}
            {detalle.titulo && (
              <>
                <dt>Alerta</dt>
                <dd>
                  {detalle.titulo}
                  {detalle.motivo ? `: ${detalle.motivo}` : ''}
                </dd>
              </>
            )}
            {detalle.motivoAdvertencia && (
              <>
                <dt>Motivo de la advertencia</dt>
                <dd>{detalle.motivoAdvertencia}</dd>
              </>
            )}
          </dl>

          <h4>Fotos ({detalle.fotos.length})</h4>
          {detalle.fotos.length === 0 && <p className="portal-desc">Esta visita no tiene fotos.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} data-testid="visor-fotos">
            {detalle.fotos.map((f) => (
              <figure key={f.etiqueta} style={{ margin: 0, maxWidth: 160 }}>
                {fotoSegura(f.url) ? (
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <img src={f.url} alt={f.etiqueta} style={{ maxWidth: '100%', borderRadius: 6 }} />
                  </a>
                ) : (
                  <span>Foto no disponible</span>
                )}
                <figcaption>{f.etiqueta}</figcaption>
              </figure>
            ))}
          </div>

          <h4>Checklist ({detalle.checklist.length})</h4>
          {detalle.checklist.length === 0 ? (
            <p className="portal-desc">Esta visita no tiene ítems críticos de checklist.</p>
          ) : (
            <table data-testid="visor-checklist" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Ítem</th>
                  <th>Estado</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {detalle.checklist.map((c) => (
                  <tr key={c.item}>
                    <td>{c.item}</td>
                    <td>{c.estado}</td>
                    <td>{c.observaciones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

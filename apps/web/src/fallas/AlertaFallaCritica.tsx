import React, { useEffect, useState } from 'react';
import {
  ETIQUETA_FALLA,
  EventoFallaCritica,
  reproducirAvisoSonoro,
  suscribirFallasCriticas,
} from './fallas';

const vistasPorRol: Record<string, Set<string>> = {
  secretaria: new Set(),
  firmante: new Set(),
};

/**
 * Notificación emergente para Secretaría y Firmante: carga los informes críticos recientes y
 * escucha en tiempo real (SSE) nuevos reportes con aviso sonoro y enlace directo al informe.
 */
export function AlertaFallaCritica({ rol = 'secretaria' }: { rol?: 'secretaria' | 'firmante' }) {
  const [pendientes, setPendientes] = useState<EventoFallaCritica[]>([]);

  useEffect(() => {
    let activo = true;
    void fetch('/api/fallas-criticas/informes')
      .then((res) => (res.ok ? (res.json() as Promise<EventoFallaCritica[]>) : []))
      .then((lista) => {
        if (!activo || !Array.isArray(lista)) return;
        const yaVistas = vistasPorRol[rol] ?? new Set<string>();
        setPendientes((actuales) => {
          const ids = new Set(actuales.map((e) => e.informeId));
          const nuevos = lista.filter((ev) => !yaVistas.has(ev.informeId) && !ids.has(ev.informeId));
          return nuevos.length > 0 ? [...actuales, ...nuevos] : actuales;
        });
      })
      .catch(() => {
        // Sin conexión o endpoint no disponible aún
      });

    const unsub = suscribirFallasCriticas((evento) => {
      const yaVistas = vistasPorRol[rol] ?? new Set<string>();
      if (yaVistas.has(evento.informeId)) return;
      setPendientes((actuales) =>
        actuales.some((e) => e.informeId === evento.informeId) ? actuales : [...actuales, evento],
      );
      reproducirAvisoSonoro();
    });

    return () => {
      activo = false;
      unsub();
    };
  }, [rol]);

  const actual = pendientes[0];
  if (!actual) return null;

  const marcarVista = () => {
    (vistasPorRol[rol] ??= new Set()).add(actual.informeId);
    setPendientes((p) => p.slice(1));
  };

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
          <li key={f}>{ETIQUETA_FALLA[f] ?? f}</li>
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
          onClick={marcarVista}
          data-testid="alerta-falla-entendido"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import {
  REPETICION_ALARMA_MS,
  abrirAlerta,
  agruparFallasPorZona,
  alertasDelFirmante,
  debeSonarAlarma,
  EventoFallaCritica,
  reproducirAvisoSonoro,
  suscribirFallasCriticas,
} from './fallas';

const vistasPorRol: Record<string, Set<string>> = {
  secretaria: new Set(),
  firmante: new Set(),
};

/**
 * Notificación emergente para Secretaría y Firmante: carga los informes críticos recientes y escucha en tiempo real (SSE) nuevos
 * reportes con enlace directo al informe. El Firmante ve sólo las alertas de los edificios que tiene asignados (HU-06 RF-04).
 *
 * En la Secretaría la alarma sonora se repite hasta que un usuario abre la alerta; al abrirla (en esta pantalla o en otra) deja de
 * sonar en todas las de la Secretaría, y la API registra quién la abrió primero y cuándo.
 */
export function AlertaFallaCritica({ rol = 'secretaria', usuario }: { rol?: 'secretaria' | 'firmante'; usuario?: string }) {
  const [pendientes, setPendientes] = useState<EventoFallaCritica[]>([]);
  // Alertas que se abrieron (acá o en otra pantalla) desde que se cargó esta.
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let activo = true;
    void fetchConSesion('/api/fallas-criticas/informes')
      .then((res) => (res.ok ? (res.json() as Promise<EventoFallaCritica[]>) : []))
      .then((lista) => {
        if (!activo || !Array.isArray(lista)) return;
        const yaVistas = vistasPorRol[rol] ?? new Set<string>();
        const propias = rol === 'firmante' ? alertasDelFirmante(lista, usuario) : lista;
        setPendientes((actuales) => {
          const ids = new Set(actuales.map((e) => e.informeId));
          const nuevos = propias.filter((ev) => !yaVistas.has(ev.informeId) && !ids.has(ev.informeId));
          return nuevos.length > 0 ? [...actuales, ...nuevos] : actuales;
        });
      })
      .catch(() => {
        // Sin conexión o endpoint no disponible aún
      });

    const unsub = suscribirFallasCriticas(
      (evento) => {
        if (rol === 'firmante' && alertasDelFirmante([evento], usuario).length === 0) return;
        const yaVistas = vistasPorRol[rol] ?? new Set<string>();
        if (yaVistas.has(evento.informeId)) return;
        setPendientes((actuales) =>
          actuales.some((e) => e.informeId === evento.informeId) ? actuales : [...actuales, evento],
        );
        reproducirAvisoSonoro();
      },
      undefined,
      // Alguien abrió la alerta (en esta pantalla o en otra): la alarma deja de sonar.
      (apertura) => setAbiertas((previas) => new Set(previas).add(apertura.informeId)),
    );

    return () => {
      activo = false;
      unsub();
    };
  }, [rol, usuario]);

  // La alarma se repite mientras haya una alerta sin abrir (sólo en la Secretaría).
  const suena = rol === 'secretaria' && debeSonarAlarma(pendientes, abiertas);
  useEffect(() => {
    if (!suena) return undefined;
    const t = setInterval(() => reproducirAvisoSonoro(), REPETICION_ALARMA_MS);
    return () => clearInterval(t);
  }, [suena]);

  const actual = pendientes[0];
  if (!actual) return null;

  /** El usuario abrió la alerta: se lo informa a la API (queda registrado el primero) y la alarma se detiene. */
  const abrir = () => {
    setAbiertas((previas) => new Set(previas).add(actual.informeId));
    void abrirAlerta(actual.informeId, fetchConSesion);
  };
  const marcarVista = () => {
    abrir();
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
      {agruparFallasPorZona(actual.fallas).map((grupo) => (
        <div key={grupo.zona} className="falla-toast-zona" data-testid="alerta-falla-zona">
          <strong>{grupo.zona}</strong>
          <ul className="falla-toast-fallas">
            {grupo.fallas.map((f) => (
              <li key={f.codigo}>{f.nombre}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="falla-toast-meta">
        Informó: {actual.inspector} · ECA: {actual.eca} ·{' '}
        {new Date(actual.registradoEn).toLocaleString('es-AR')}
      </p>
      {(actual.abiertaPor || abiertas.has(actual.informeId)) && (
        <p className="falla-toast-meta" data-testid="alerta-falla-abierta-por">
          {actual.abiertaPor ? `Abierta por ${actual.abiertaPor}` : 'Alerta abierta'}
          {actual.abiertaEn ? ` el ${new Date(actual.abiertaEn).toLocaleString('es-AR')}` : ''}
        </p>
      )}
      <div className="falla-toast-acciones">
        <a
          className="btn btn-danger"
          href={actual.enlaceInforme}
          target="_blank"
          rel="noopener noreferrer"
          onClick={abrir}
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

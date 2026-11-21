import React, { useCallback, useEffect, useState } from 'react';
import { fechaHora } from '../fechas/formato';
import { fetchConSesion } from '../auth/sesion';
import {
  type AvisoFalla,
  type EstadoWhatsApp,
  type RegistroEnvioWhatsApp,
  aprobarAviso,
  cargarAvisos,
  cargarEstadoWhatsApp,
  cargarHistorialWhatsApp,
  cartelWhatsApp,
  descargarPdfLegalAviso,
  estadoRealDeEnvio,
  etiquetaCanal,
  ordenarBandeja,
  puedeAprobar,
  reintentarEmailAviso,
} from './avisos';

/**
 * Bandeja «Avisos a la ECA» de la Secretaría (HU-11 RF-05). Ninguna falla crítica manda WhatsApp ni correo sola: queda
 * «Pendiente de revisión» hasta que la Secretaría toca «Aprobar y enviar».
 */
export function BandejaAvisos() {
  const [avisos, setAvisos] = useState<AvisoFalla[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aprobando, setAprobando] = useState<string | null>(null);
  // `undefined` es que todavía se está consultando; `null`, que no se pudo.
  const [whatsapp, setWhatsapp] = useState<EstadoWhatsApp | null | undefined>(undefined);
  const [registros, setRegistros] = useState<RegistroEnvioWhatsApp[] | null>(null);

  const recargar = useCallback(async () => {
    const [lista, estadoWa, historial] = await Promise.all([
      cargarAvisos(fetchConSesion),
      cargarEstadoWhatsApp(fetchConSesion),
      cargarHistorialWhatsApp(fetchConSesion),
    ]);
    setWhatsapp(estadoWa);
    setRegistros(historial);
    if (lista === null) setError('No se pudo cargar la bandeja de avisos.');
    else {
      setError(null);
      setAvisos(ordenarBandeja(lista));
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const aprobar = async (a: AvisoFalla) => {
    setAprobando(a.id);
    setError(null);
    const r = await aprobarAviso(a.id, fetchConSesion);
    setAprobando(null);
    if (!r.ok) setError(r.error);
    await recargar();
  };

  const reintentarEmail = async (a: AvisoFalla) => {
    setAprobando(a.id);
    setError(null);
    const r = await reintentarEmailAviso(a.id, fetchConSesion);
    setAprobando(null);
    if (!r.ok) setError(r.error);
    await recargar();
  };

  const descargarPdf = async (a: AvisoFalla) => {
    setError(null);
    const r = await descargarPdfLegalAviso(a.id, fetchConSesion);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const url = URL.createObjectURL(r.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = r.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="bandeja-avisos" aria-labelledby="avisos-titulo" data-testid="bandeja-avisos">
      <h2 id="avisos-titulo" className="portal-title">
        Avisos a la ECA
      </h2>
      <p className="portal-desc">
        Los avisos de falla crítica no salen solos: revisá cada falla y aprobá el envío del WhatsApp y el correo a la ECA y al Firmante.
      </p>
      {whatsapp !== undefined && (
        <p className={`alert ${cartelWhatsApp(whatsapp).tipo === 'activo' ? 'alert-success' : 'alert-warning'}`} role="status" data-testid="cartel-whatsapp" data-tipo={cartelWhatsApp(whatsapp).tipo}>
          {cartelWhatsApp(whatsapp).texto}
        </p>
      )}
      <button type="button" className="btn btn-secondary" onClick={() => void recargar()} data-testid="avisos-actualizar">
        Actualizar estados
      </button>
      {error && (
        <p className="error" role="alert" data-testid="avisos-error">
          {error}
        </p>
      )}
      {avisos === null && !error && <p className="portal-desc">Cargando avisos…</p>}
      {avisos?.length === 0 && <p className="portal-desc">No hay avisos.</p>}
      <ul className="avisos-lista">
        {avisos?.map((a) => (
          <li key={a.id} data-testid="aviso" data-estado={a.estado}>
            <strong>{a.equipo}</strong> — {a.direccion} ({a.consorcio})
            <br />
            <span data-testid="aviso-estado">{a.estado}</span> · ECA: {a.eca} · {fechaHora(a.creadoEn)}
            <br />
            {a.detalle}{' '}
            <a href={a.enlaceInforme} target="_blank" rel="noopener noreferrer">
              Ver informe
            </a>
            {a.aprobadoPor && (
              <p data-testid="aviso-aprobacion">
                Aprobado por {a.aprobadoPor} el {fechaHora(a.aprobadoEn)}
              </p>
            )}
            {a.enlace && (
              <p data-testid="aviso-enlace">
                Enlace del informe (sin contraseña, vence el {fechaHora(a.enlaceVenceEn) || '—'}):{' '}
                <a href={a.enlace} target="_blank" rel="noopener noreferrer">
                  abrir
                </a>
              </p>
            )}
            {a.envios.length > 0 && (
              <ul data-testid="aviso-envios">
                {a.envios.map((e, i) => {
                  const real = estadoRealDeEnvio(e, a.alertaId, registros);
                  return (
                    <li key={`${e.canal}-${i}`} data-testid="aviso-envio" data-estado-real={real?.tipo}>
                      {etiquetaCanal(e.canal)} ({e.destino}): {real ? real.texto : e.ok ? 'enviado' : `no salió — ${e.motivo ?? e.estado}`}
                    </li>
                  );
                })}
              </ul>
            )}
            {a.constanciaEmailLegal && (
              <p data-testid="aviso-constancia-email">
                <strong>PDF Legal MAICON S.R.L. ({a.constanciaEmailLegal.estado}):</strong>{' '}
                {a.constanciaEmailLegal.destino} · {fechaHora(a.constanciaEmailLegal.fecha)} ·{' '}
                <code>{a.constanciaEmailLegal.archivoPdf}</code>
                {a.constanciaEmailLegal.motivo ? ` — Motivo: ${a.constanciaEmailLegal.motivo}` : ''}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => void descargarPdf(a)} data-testid="aviso-descargar-pdf">
                Descargar PDF Legal
              </button>
              {a.constanciaEmailLegal?.estado === 'Envío fallido' && (
                <button type="button" className="btn btn-secondary" disabled={aprobando === a.id} onClick={() => void reintentarEmail(a)} data-testid="aviso-reintentar-email">
                  {aprobando === a.id ? 'Reintentando…' : 'Reintentar email PDF'}
                </button>
              )}
              {puedeAprobar(a) && (
                <button type="button" className="btn btn-primary" disabled={aprobando === a.id} onClick={() => void aprobar(a)} data-testid="aviso-aprobar">
                  {aprobando === a.id ? 'Enviando…' : a.estado === 'Falló el envío' ? 'Reintentar envío' : 'Aprobar y enviar'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

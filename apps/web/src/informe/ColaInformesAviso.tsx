import React, { useCallback, useEffect, useRef, useState } from 'react';
import { sincronizarColaFallasCriticas } from '../checklist/fallasCriticasChecklist';
import { listarColaInformesCriticos } from '../checklist/offlineStore';
import {
  alCambiarCola,
  almacenIdb,
  descartarRechazado,
  enviarCola,
  fechaCorta,
  iniciarAutoSync,
  resumirCola,
  textoFallasSinEnviar,
  textoSinSubir,
  type ItemCola,
} from './cola';
import { depsDeApp } from './colaApp';

interface Props {
  /** El usuario con la sesión abierta: la cola es suya (no se mezclan los informes de otro RT que haya usado el mismo celular). */
  usuario: string;
}

const hayRed = () => (typeof navigator !== 'undefined' ? navigator.onLine : true);

/**
 * Los informes cerrados que todavía no se subieron (HU-18 RNF-02): «N inspecciones sin subir». Se envían solos al abrir la app, cuando
 * vuelve la señal y cada tanto mientras haya algo pendiente; al volver a ingresar con la sesión vencida también (se monta de nuevo).
 * Un informe que el servidor rechazó de forma definitiva no se reintenta: se muestra el motivo y el RT decide descartarlo.
 */
export function ColaInformesAviso({ usuario }: Props) {
  const [items, setItems] = useState<ItemCola[]>([]);
  const [enLinea, setEnLinea] = useState(hayRed);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef<ItemCola[]>([]);
  // Las fallas críticas del RT que esperan para mandarse (su cola es otra, la de HU-17 RF-08): con la sesión vencida quedan guardadas
  // y salen solas al volver a ingresar.
  const [fallas, setFallas] = useState(0);
  const fallasRef = useRef(0);

  const refrescar = useCallback(async () => {
    try {
      const todos = await almacenIdb().listar();
      itemsRef.current = todos;
      setItems(todos);
      const delUsuario = (await listarColaInformesCriticos()).filter((i) => !i.usuario || i.usuario === usuario).length;
      fallasRef.current = delUsuario;
      setFallas(delUsuario);
    } catch {
      // sin IndexedDB: no hay cola que mostrar
    }
  }, [usuario]);

  const sincronizar = useCallback(async () => {
    setEnviando(true);
    try {
      const r = await enviarCola(depsDeApp(usuario));
      setError(r.error ?? null);
      await sincronizarColaFallasCriticas(undefined, undefined, usuario).catch(() => undefined);
    } finally {
      setEnviando(false);
      await refrescar();
    }
  }, [usuario, refrescar]);

  useEffect(() => {
    void refrescar();
    const dejarDeOir = alCambiarCola(() => void refrescar());
    const alConectar = () => setEnLinea(true);
    const alDesconectar = () => setEnLinea(false);
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    const detener = iniciarAutoSync({
      sincronizar,
      objetivo: window,
      enLinea: hayRed,
      hayPendientes: () => resumirCola(itemsRef.current, usuario).pendientes > 0 || fallasRef.current > 0,
    });
    return () => {
      dejarDeOir();
      detener();
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, [refrescar, sincronizar, usuario]);

  const { pendientes, rechazados, sinSubir } = resumirCola(items, usuario);
  if (sinSubir === 0 && fallas === 0) return null;

  const descartar = async (id: string) => {
    if (!window.confirm('Este informe no se va a poder enviar y se pierde. ¿Descartarlo?')) return;
    await descartarRechazado(almacenIdb(), id);
    await refrescar();
  };

  return (
    <section className="sesion-aviso" role="status" aria-live="polite" data-testid="cola-informes">
      {sinSubir > 0 && <strong data-testid="cola-informes-titulo">{textoSinSubir(sinSubir)}</strong>}
      {fallas > 0 && (
        <p data-testid="cola-fallas" style={{ margin: sinSubir > 0 ? '6px 0 0' : 0 }}>
          <strong>{textoFallasSinEnviar(fallas)}</strong> · se envían solas en cuanto haya señal y sesión.
        </p>
      )}
      {pendientes > 0 && (
        <>
          {' · '}
          <span data-testid="cola-informes-estado">
            {enviando ? 'Enviando…' : enLinea ? 'Se envían solas en cuanto el servidor responda.' : 'Se envían solas cuando vuelva la señal.'}
          </span>{' '}
          <button type="button" className="btn btn-secondary btn-sm" disabled={enviando || !enLinea} onClick={() => void sincronizar()} data-testid="cola-informes-reintentar">
            Reintentar ahora
          </button>
          {error && !enviando && (
            <p className="portal-desc" data-testid="cola-informes-error">
              Último intento: {error}
            </p>
          )}
        </>
      )}
      {rechazados.length > 0 && (
        <ul className="error" role="alert" data-testid="cola-informes-rechazados">
          {rechazados.map((r) => (
            <li key={r.clientReportId}>
              El informe del {fechaCorta(r.creadoEn)} ({r.cuerpo.equipos.length} equipo{r.cuerpo.equipos.length === 1 ? '' : 's'}) no se pudo enviar: {r.ultimoError}{' '}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void descartar(r.clientReportId)} data-testid="cola-informes-descartar">
                Descartar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

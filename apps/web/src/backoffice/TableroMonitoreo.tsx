import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import { VisorVisita } from './VisorVisita';
import {
  type FilaMonitoreo,
  type Filtros,
  type PaginaMonitoreo,
  ESPERA_FILTROS_MS,
  ESTADOS,
  FILTROS_VACIOS,
  accionDe,
  cargarMonitoreo,
  enviarRemitoEca,
  fecha,
  reclamarAdmin,
  resumenChecklist,
  textoFirmante,
} from './monitoreo';

/**
 * Tablero dinámico de monitoreo general del backoffice (HU-05 RF-02): tabla interactiva con filtros en tiempo real (dirección, ECA, inspector y
 * estado de la visita), visor de fotos e informe y las acciones comerciales «Enviar Remito a ECA» y «Reclamar a Admin» según el estado de la visita.
 */
export function TableroMonitoreo() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<PaginaMonitoreo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visorDe, setVisorDe] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const ultimo = useRef(0);

  const cargar = useCallback(async (f: Filtros, p: number) => {
    const n = ++ultimo.current;
    const r = await cargarMonitoreo(f, p, fetchConSesion);
    if (n !== ultimo.current) return; // llegó tarde: ya se pidió otra cosa
    if (!r) return setError('No se pudo cargar el monitoreo.');
    setError(null);
    setDatos(r);
  }, []);

  // Los filtros consultan solos poco después de la última tecla; cambiar de página consulta de inmediato.
  useEffect(() => {
    const t = setTimeout(() => void cargar(filtros, pagina), pagina === 1 && datos === null ? 0 : ESPERA_FILTROS_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, pagina, cargar]);

  const cambiar = (campo: keyof Filtros, valor: string) => {
    setFiltros((f) => ({ ...f, [campo]: valor }) as Filtros);
    setPagina(1);
  };

  const ejecutar = async (f: FilaMonitoreo) => {
    const accion = accionDe(f);
    if (accion.tipo !== 'enviar_remito' && accion.tipo !== 'reclamar_admin') return;
    setTrabajando(f.id);
    setAviso(null);
    setError(null);
    const r = accion.tipo === 'enviar_remito' ? await enviarRemitoEca(f.maquinaId, fetchConSesion) : await reclamarAdmin(f.maquinaId, fetchConSesion);
    setTrabajando(null);
    if (!r.ok) setError(r.error);
    else setAviso(accion.tipo === 'enviar_remito' ? `Remito registrado como enviado a ${f.eca}` : `Reclamo registrado a ${f.administracion}`);
    await cargar(filtros, pagina);
  };

  return (
    <section className="tablero-monitoreo" aria-labelledby="monitoreo-titulo" data-testid="tablero-monitoreo">
      <h3 id="monitoreo-titulo">Monitoreo general de visitas</h3>
      <form className="filtros-monitoreo" onSubmit={(e) => e.preventDefault()} aria-label="Filtros del monitoreo" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
        <input type="search" placeholder="Dirección" aria-label="Filtrar por dirección" value={filtros.direccion} onChange={(e) => cambiar('direccion', e.target.value)} data-testid="filtro-direccion" />
        <input type="search" placeholder="ECA" aria-label="Filtrar por ECA" value={filtros.eca} onChange={(e) => cambiar('eca', e.target.value)} data-testid="filtro-eca" />
        <input type="search" placeholder="Inspector" aria-label="Filtrar por inspector" value={filtros.inspector} onChange={(e) => cambiar('inspector', e.target.value)} data-testid="filtro-inspector" />
        <select aria-label="Filtrar por estado de la visita" value={filtros.estado} onChange={(e) => cambiar('estado', e.target.value)} data-testid="filtro-estado">
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary" onClick={() => { setFiltros(FILTROS_VACIOS); setPagina(1); }} data-testid="filtro-limpiar">
          Limpiar filtros
        </button>
      </form>

      {aviso && (
        <p role="status" data-testid="monitoreo-aviso">
          {aviso}
        </p>
      )}
      {error && (
        <p className="error" role="alert" data-testid="monitoreo-error">
          {error}
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table data-testid="tabla-monitoreo" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Dirección</th>
              <th>Inspector</th>
              <th>Estado de visita</th>
              <th>Fecha y hora</th>
              <th>Checklist</th>
              <th>Firmante AGC</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {datos?.items.map((f) => {
              const accion = accionDe(f);
              const hecho = accion.tipo === 'remito_enviado' || accion.tipo === 'reclamo_hecho';
              return (
                <tr key={f.id} data-testid="fila-monitoreo" data-estado={f.estadoVisita}>
                  <td>
                    {f.direccion}
                    <br />
                    <small>
                      {f.codigoAGC} · {f.eca}
                    </small>
                  </td>
                  <td>{f.inspector}</td>
                  <td data-testid="celda-estado">{f.estadoVisita}</td>
                  <td>{fecha(f.fecha)}</td>
                  <td>{resumenChecklist(f)}</td>
                  <td>{textoFirmante(f)}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => setVisorDe(f.maquinaId)} data-testid="accion-ver">
                      Ver fotos e informe
                    </button>{' '}
                    {(accion.tipo === 'enviar_remito' || accion.tipo === 'reclamar_admin') && (
                      <button type="button" className="btn btn-primary" disabled={trabajando === f.id} onClick={() => void ejecutar(f)} data-testid={`accion-${accion.tipo}`}>
                        {trabajando === f.id ? 'Enviando…' : accion.etiqueta}
                      </button>
                    )}
                    {hecho && <span data-testid="accion-hecha">{accion.etiqueta}</span>}
                    {accion.tipo === 'ninguna' && <span className="portal-desc">{accion.etiqueta}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {datos && datos.total === 0 && (
        <p className="portal-desc" data-testid="monitoreo-vacio">
          No hay visitas que coincidan con los filtros.
        </p>
      )}
      {!datos && !error && <p className="portal-desc">Cargando…</p>}
      {datos && (
        <nav aria-label="Paginación" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }} data-testid="paginacion">
          <button type="button" className="btn btn-secondary" disabled={datos.pagina <= 1} onClick={() => setPagina(datos.pagina - 1)} data-testid="pagina-anterior">
            ← Anterior
          </button>
          <span data-testid="pagina-info">
            Página {datos.pagina} de {datos.totalPaginas} · {datos.total} {datos.total === 1 ? 'visita' : 'visitas'}
          </span>
          <button type="button" className="btn btn-secondary" disabled={datos.pagina >= datos.totalPaginas} onClick={() => setPagina(datos.pagina + 1)} data-testid="pagina-siguiente">
            Siguiente →
          </button>
        </nav>
      )}

      {visorDe && <VisorVisita maquinaId={visorDe} onCerrar={() => setVisorDe(null)} />}
    </section>
  );
}

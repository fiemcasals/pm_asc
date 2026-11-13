import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ConsorcioMapaItem, fetchConsorciosMapa } from '../consorcios/consorcios';
import { MapaUbicacionConsorcio } from '../consorcios/MapaUbicacionConsorcio';
import {
  COLORES_SEMAFORO,
  ORDEN_COLORES,
  RegistroReasignacion,
  SemaforoEdificio,
  SemaforoRespuesta,
  SugerenciaReasignacion,
  confirmarReasignacion,
  fechaCorta,
  fechaHora,
  fetchHistorialReasignaciones,
  fetchSemaforo,
  fetchSugerencia,
  marcadoresSemaforo,
  textoCandidato,
} from './semaforo';
import './semaforo.css';

function Leyenda() {
  return (
    <div className="semaforo-leyenda" data-testid="leyenda-semaforo" role="list" aria-label="Leyenda de colores del semáforo">
      {ORDEN_COLORES.slice()
        .reverse()
        .map((color) => (
          <div key={color} className="semaforo-leyenda-item" role="listitem" data-testid={`leyenda-${color}`}>
            <span className="semaforo-punto" style={{ background: COLORES_SEMAFORO[color].hex }} aria-hidden="true" />
            <strong>{COLORES_SEMAFORO[color].etiqueta}</strong>
            <span>{COLORES_SEMAFORO[color].significado}</span>
          </div>
        ))}
      <p className="semaforo-leyenda-nota" data-testid="nota-sin-tecnicos">
        El mapa muestra solamente edificios: no hay seguimiento de técnicos en vivo.
      </p>
    </div>
  );
}

interface PanelReasignacionProps {
  edificio: SemaforoEdificio;
  fecha: string;
  onCerrar: () => void;
  onAplicada: () => void;
}

function PanelReasignacion({ edificio, fecha, onCerrar, onAplicada }: PanelReasignacionProps) {
  const [sugerencia, setSugerencia] = useState<SugerenciaReasignacion | null>(null);
  const [elegido, setElegido] = useState('');
  const [historial, setHistorial] = useState<RegistroReasignacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargar = useCallback(async (conservarError = false) => {
    setCargando(true);
    if (!conservarError) setError(null);
    const [sug, hist] = await Promise.all([
      fetchSugerencia(edificio.id, fecha || undefined),
      fetchHistorialReasignaciones(edificio.id),
    ]);
    if (sug.ok && sug.data) {
      setSugerencia(sug.data);
      setElegido(sug.data.sugerido?.usuario ?? '');
    } else {
      setSugerencia(null);
      setError(sug.error ?? 'No se pudo obtener la sugerencia'); // si la sugerencia falla, este error reemplaza al de la confirmación
    }
    if (hist.ok && hist.data) setHistorial(hist.data);
    setCargando(false);
  }, [edificio.id, fecha]);

  useEffect(() => {
    setExito(null);
    void cargar();
  }, [cargar]);

  const confirmar = async () => {
    if (!sugerencia?.rtActual || !elegido) return;
    setAplicando(true);
    setError(null);
    const res = await confirmarReasignacion(edificio.id, {
      rtAnterior: sugerencia.rtActual.nombre,
      rtNuevo: elegido,
      fecha: fecha || undefined,
    });
    setAplicando(false);
    if (res.ok && res.data) {
      setExito(`Reasignado: ${res.data.rtAnterior} → ${res.data.rtNuevo}. Quedó registrado a nombre de ${res.data.usuario}.`);
      onAplicada();
      void cargar(); // refresca la sugerencia y el historial con el RT nuevo
    } else {
      setError(res.error ?? 'No se pudo aplicar la reasignación');
      // 409: la vista quedó vieja (el RT cambió o el edificio ya no está en rojo). Se recarga sola, sin cerrar el panel y sin borrar el aviso.
      if (res.status === 409) void cargar(true);
    }
  };

  return (
    <section className="semaforo-panel" data-testid="panel-reasignacion" aria-labelledby="titulo-reasignacion">
      <header className="semaforo-panel-cabecera">
        <h3 id="titulo-reasignacion">Reasignar RT de Calle — {edificio.nombre}</h3>
        <button type="button" className="semaforo-btn-sec" onClick={onCerrar} data-testid="btn-cerrar-reasignacion" aria-label="Cerrar el panel de reasignación">
          ✕
        </button>
      </header>

      {cargando && <p data-testid="reasignacion-cargando">Buscando a quién reasignar…</p>}
      {error && (
        <p className="semaforo-error" role="alert" data-testid="error-reasignacion">
          {error}
        </p>
      )}
      {exito && (
        <p className="semaforo-exito" role="status" data-testid="exito-reasignacion">
          {exito}
        </p>
      )}

      {sugerencia && (
        <>
          <p data-testid="rt-actual">
            <strong>RT actual:</strong> {sugerencia.rtActual ? sugerencia.rtActual.nombre : 'sin RT asignado'}
          </p>
          {sugerencia.sugerido ? (
            <p data-testid="rt-sugerido">
              <strong>Sugerido:</strong> {textoCandidato(sugerencia.sugerido)} <em>(el que menos edificios pendientes tiene este mes)</em>
            </p>
          ) : (
            <p data-testid="sin-candidatos">No hay otro RT de Calle disponible para reasignar este edificio.</p>
          )}

          {sugerencia.candidatos.length > 0 && (
            <label className="semaforo-campo">
              RT de Calle que recibe el edificio
              <select value={elegido} onChange={(e) => setElegido(e.target.value)} data-testid="select-rt-nuevo" disabled={aplicando}>
                {sugerencia.candidatos.map((c) => (
                  <option key={c.usuario} value={c.usuario}>
                    {textoCandidato(c)}
                    {c.usuario === sugerencia.sugerido?.usuario ? ' (sugerido)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <p className="semaforo-aviso">La reasignación no se aplica hasta que la confirmes.</p>
          <div className="semaforo-acciones">
            <button
              type="button"
              className="semaforo-btn-pri"
              onClick={() => void confirmar()}
              disabled={aplicando || !elegido || !sugerencia.rtActual}
              data-testid="btn-confirmar-reasignacion"
            >
              {aplicando ? 'Aplicando…' : 'Confirmar reasignación'}
            </button>
            <button type="button" className="semaforo-btn-sec" onClick={onCerrar} data-testid="btn-cancelar-reasignacion" disabled={aplicando}>
              Cancelar
            </button>
          </div>
        </>
      )}

      <div data-testid="historial-reasignaciones">
        <h4>Reasignaciones registradas</h4>
        {historial.length === 0 ? (
          <p className="semaforo-vacio" data-testid="historial-vacio">Este edificio no tiene reasignaciones registradas.</p>
        ) : (
          <table className="semaforo-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>RT anterior</th>
                <th>RT nuevo</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((r) => (
                <tr key={r.id} data-testid={`fila-historial-${r.id}`}>
                  <td>{fechaHora(r.fecha)}</td>
                  <td>{r.usuario}</td>
                  <td>{r.rtAnterior}</td>
                  <td>{r.rtNuevo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export function SemaforoView() {
  const [fecha, setFecha] = useState('');
  const [semaforo, setSemaforo] = useState<SemaforoRespuesta | null>(null);
  const [ubicaciones, setUbicaciones] = useState<ConsorcioMapaItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    const [sem, mapa] = await Promise.all([fetchSemaforo(fecha || undefined), fetchConsorciosMapa()]);
    if (sem.ok && sem.data) setSemaforo(sem.data);
    else setError(sem.error ?? 'No se pudo cargar el semáforo');
    if (mapa.ok && mapa.data) setUbicaciones(mapa.data);
    setCargando(false);
  }, [fecha]);

  useEffect(() => {
    setCargando(true);
    void cargar();
  }, [cargar]);

  const { marcadores, sinUbicacion } = useMemo(
    () => marcadoresSemaforo(semaforo?.edificios ?? [], ubicaciones),
    [semaforo, ubicaciones],
  );
  const seleccionado = semaforo?.edificios.find((e) => e.id === seleccionadoId) ?? null;

  const elegir = (id: string) => {
    setSeleccionadoId(id);
    const e = semaforo?.edificios.find((x) => x.id === id);
    setPanelAbierto(e?.color === 'rojo');
  };

  return (
    <section className="secretaria-view semaforo-view" aria-labelledby="semaforo-titulo" data-testid="semaforo-view">
      <header className="semaforo-cabecera">
        <div>
          <h2 id="semaforo-titulo">Semáforo mensual de edificios</h2>
          <p className="semaforo-sub">
            Estado de las inspecciones del mes. Un edificio inspeccionado está en verde; uno pendiente cambia de color con los días.
          </p>
        </div>
        <label className="semaforo-campo semaforo-fecha">
          Ver el semáforo al día
          <span className="semaforo-fecha-fila">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} data-testid="input-fecha-semaforo" />
            {fecha && (
              <button type="button" className="semaforo-btn-sec" onClick={() => setFecha('')} data-testid="btn-hoy-semaforo">
                Hoy
              </button>
            )}
          </span>
        </label>
      </header>

      {error && (
        <p className="semaforo-error" role="alert" data-testid="error-semaforo">
          {error}
        </p>
      )}
      {cargando && <p data-testid="semaforo-cargando">Cargando el semáforo…</p>}

      {semaforo && (
        <>
          <div className="semaforo-resumen" data-testid="resumen-semaforo">
            <span data-testid="semaforo-fecha-activa">
              Al {fechaCorta(semaforo.fecha)} · un pendiente está en <strong>{COLORES_SEMAFORO[semaforo.tramoDelDia].etiqueta.toLowerCase()}</strong>
            </span>
            {ORDEN_COLORES.map((c) => (
              <span key={c} className="semaforo-total" data-testid={`total-${c}`}>
                <span className="semaforo-punto" style={{ background: COLORES_SEMAFORO[c].hex }} aria-hidden="true" />
                {COLORES_SEMAFORO[c].etiqueta}: <strong>{semaforo.totales[c]}</strong>
              </span>
            ))}
          </div>

          <Leyenda />

          <div className="semaforo-mapa" data-testid="contenedor-mapa-semaforo">
            <MapaUbicacionConsorcio
              ubicacion={null}
              marcadores={marcadores}
              testId="mapa-semaforo"
              onSeleccionarMarcador={elegir}
              marcadorSeleccionadoId={seleccionadoId}
            />
            {sinUbicacion.length > 0 && (
              <p className="semaforo-aviso" data-testid="aviso-sin-ubicacion">
                {sinUbicacion.length === 1
                  ? '1 edificio no tiene ubicación cargada y no aparece en el mapa, pero sí en la lista.'
                  : `${sinUbicacion.length} edificios no tienen ubicación cargada y no aparecen en el mapa, pero sí en la lista.`}
              </p>
            )}
          </div>

          {semaforo.edificios.length === 0 ? (
            <p className="semaforo-vacio" data-testid="semaforo-vacio">No hay edificios cargados todavía.</p>
          ) : (
            <div className="semaforo-tabla-wrap">
            <table className="semaforo-tabla" data-testid="lista-semaforo">
              <thead>
                <tr>
                  <th>Edificio</th>
                  <th>Color</th>
                  <th>Inspección</th>
                  <th>Última</th>
                  <th>RT de Calle</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {semaforo.edificios.map((e) => (
                  <tr
                    key={e.id}
                    data-testid={`fila-semaforo-${e.id}`}
                    data-color={e.color}
                    className={e.id === seleccionadoId ? 'semaforo-fila-activa' : undefined}
                  >
                    <td>
                      <button type="button" className="semaforo-link" onClick={() => elegir(e.id)} data-testid={`btn-elegir-${e.id}`}>
                        {e.nombre}
                      </button>
                      <br />
                      <small>{e.direccion}</small>
                    </td>
                    <td>
                      <span className="semaforo-chip" style={{ borderColor: COLORES_SEMAFORO[e.color].hex }}>
                        <span className="semaforo-punto" style={{ background: COLORES_SEMAFORO[e.color].hex }} aria-hidden="true" />
                        {COLORES_SEMAFORO[e.color].etiqueta}
                      </span>
                    </td>
                    <td>
                      {e.estado === 'inspeccionado' ? 'Inspeccionado' : 'Pendiente'} ({e.maquinasInspeccionadas}/{e.maquinas} máquinas)
                    </td>
                    <td>{e.diaUltimaInspeccion === null ? '—' : `día ${e.diaUltimaInspeccion}`}</td>
                    <td>{e.rtCalle ? e.rtCalle.nombre : 'Sin RT asignado'}</td>
                    <td>
                      {e.color === 'rojo' && (
                        <button type="button" className="semaforo-btn-pri" onClick={() => elegir(e.id)} data-testid={`btn-reasignar-${e.id}`}>
                          Reasignar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {seleccionado && panelAbierto && seleccionado.color === 'rojo' && (
            <PanelReasignacion
              key={seleccionado.id}
              edificio={seleccionado}
              fecha={fecha}
              onCerrar={() => setPanelAbierto(false)}
              onAplicada={() => void cargar()}
            />
          )}
          {seleccionado && seleccionado.color !== 'rojo' && (
            <p className="semaforo-aviso" data-testid="aviso-no-rojo">
              {seleccionado.nombre} está en {seleccionado.color}: sólo se reasigna un edificio en rojo.
            </p>
          )}
        </>
      )}
    </section>
  );
}

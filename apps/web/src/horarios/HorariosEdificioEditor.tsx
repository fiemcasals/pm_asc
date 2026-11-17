import React, { useEffect, useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import {
  type Borrador,
  type HorariosEdificio,
  DIAS,
  ETIQUETA_DIA,
  borradorDesde,
  cargarHorarios,
  guardarHorarios,
  resumenDia,
  validarBorrador,
} from './horarios';

/** Horarios de atención del edificio, editables por la Secretaría (HU-01 RF-04): hasta 2 franjas por día o «A coordinar». */
export function HorariosEdificioEditor({ consorcioId }: { consorcioId: string }) {
  const [horarios, setHorarios] = useState<HorariosEdificio | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [editando, setEditando] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setHorarios(null);
    setEditando(false);
    void cargarHorarios(consorcioId, fetchConSesion).then((h) => {
      if (!activo) return;
      setHorarios(h);
      if (h) setBorrador(borradorDesde(h));
    });
    return () => {
      activo = false;
    };
  }, [consorcioId]);

  if (!horarios || !borrador) return <p className="portal-desc">Cargando horarios…</p>;

  const cambiarHora = (dia: (typeof DIAS)[number], fila: 0 | 1, campo: 'desde' | 'hasta', valor: string) =>
    setBorrador((b) => {
      if (!b) return b;
      const filas: Borrador['dias'][typeof dia] = [{ ...b.dias[dia][0] }, { ...b.dias[dia][1] }];
      filas[fila][campo] = valor;
      return { ...b, dias: { ...b.dias, [dia]: filas } };
    });

  const guardar = async () => {
    const mal = validarBorrador(borrador);
    setErrores(mal);
    if (mal.length > 0) return;
    setGuardando(true);
    const r = await guardarHorarios(consorcioId, borrador, fetchConSesion);
    setGuardando(false);
    if (!r.ok) return setErrores(r.errores);
    setHorarios(r.horarios);
    setBorrador(borradorDesde(r.horarios));
    setEditando(false);
    setAviso('Horarios guardados.');
  };

  return (
    <div className="horarios-edificio" data-testid="horarios-edificio">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 className="section-title">Horarios de atención</h4>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setEditando((e) => !e);
            setErrores([]);
            setAviso(null);
            setBorrador(borradorDesde(horarios));
          }}
          data-testid="horarios-editar"
        >
          {editando ? '✕ Cancelar' : '✏️ Editar horarios'}
        </button>
      </div>
      {aviso && (
        <p role="status" data-testid="horarios-aviso">
          {aviso}
        </p>
      )}
      {!editando && (
        <div data-testid="horarios-lectura">
          {horarios.aCoordinar ? (
            <p>
              <strong>A coordinar</strong> (pin amarillo): este edificio no tiene horario fijo, hay que coordinar la visita.
            </p>
          ) : (
            <ul>
              {DIAS.map((d) => (
                <li key={d}>
                  <strong>{ETIQUETA_DIA[d]}:</strong> {resumenDia(horarios.franjas[d])}
                </li>
              ))}
            </ul>
          )}
          {horarios.porDefecto && <p className="portal-desc">Horario por defecto: nadie lo modificó todavía. Los feriados cuentan como cerrado.</p>}
        </div>
      )}
      {editando && (
        <div data-testid="horarios-formulario">
          <label>
            <input
              type="checkbox"
              checked={borrador.aCoordinar}
              onChange={(e) => setBorrador({ ...borrador, aCoordinar: e.target.checked })}
              data-testid="horarios-a-coordinar"
            />{' '}
            A coordinar (reemplaza las franjas)
          </label>
          {!borrador.aCoordinar &&
            DIAS.map((d) => (
              <div key={d} data-testid={`horarios-dia-${d}`} style={{ margin: '6px 0' }}>
                <strong style={{ display: 'inline-block', width: 90 }}>{ETIQUETA_DIA[d]}</strong>
                {([0, 1] as const).map((i) => (
                  <span key={i} style={{ marginRight: 12 }}>
                    <input type="time" aria-label={`${ETIQUETA_DIA[d]} franja ${i + 1} desde`} value={borrador.dias[d][i].desde} onChange={(e) => cambiarHora(d, i, 'desde', e.target.value)} data-testid={`horarios-${d}-${i}-desde`} />
                    {' – '}
                    <input type="time" aria-label={`${ETIQUETA_DIA[d]} franja ${i + 1} hasta`} value={borrador.dias[d][i].hasta} onChange={(e) => cambiarHora(d, i, 'hasta', e.target.value)} data-testid={`horarios-${d}-${i}-hasta`} />
                  </span>
                ))}
              </div>
            ))}
          <p className="portal-desc">Hasta 2 franjas por día; dejá una fila vacía si no la necesitás y todo el día vacío para marcarlo cerrado.</p>
          {errores.length > 0 && (
            <ul role="alert" className="error" data-testid="horarios-errores">
              {errores.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void guardar()} data-testid="horarios-guardar">
            {guardando ? 'Guardando…' : 'Guardar horarios'}
          </button>
        </div>
      )}
    </div>
  );
}

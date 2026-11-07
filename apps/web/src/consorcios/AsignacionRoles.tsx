import React, { useEffect, useMemo, useState } from 'react';
import { ConsorcioResumen, fetchConsorcios } from './consorcios';
import {
  ClaveRol,
  DatosResponsable,
  DirectorioRoles,
  FormularioRoles,
  ROLES_DE_TRABAJO,
  RolesEdificio,
  directorioPorRol,
  fetchRoles,
  formularioDesdeRoles,
  guardarRoles,
  ternaAsignada,
} from './roles';

interface FormularioTernaProps {
  consorcio: ConsorcioResumen;
  roles: RolesEdificio;
  directorio: DirectorioRoles;
  onGuardado: (roles: RolesEdificio) => void;
}

function FormularioTerna({ consorcio, roles, directorio, onGuardado }: FormularioTernaProps) {
  const [formulario, setFormulario] = useState<FormularioRoles>(() => formularioDesdeRoles(roles));
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  const actualizar = (clave: ClaveRol, cambios: Partial<DatosResponsable>) => {
    setConfirmacion(null);
    setFormulario((prev) => ({ ...prev, [clave]: { ...prev[clave], ...cambios } }));
  };

  const seleccionar = (clave: ClaveRol, nombre: string) => {
    const elegido = directorio[clave].find((p) => p.nombre === nombre);
    actualizar(clave, elegido ?? { nombre: '', telefono: '', email: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores([]);
    setConfirmacion(null);
    setGuardando(true);
    const res = await guardarRoles(consorcio.id, formulario);
    setGuardando(false);

    if (res.ok && res.data) {
      setFormulario(formularioDesdeRoles(res.data));
      setConfirmacion(`✓ Responsables guardados para ${consorcio.nombre}.`);
      onGuardado(res.data);
    } else {
      setErrores(res.errores ?? [res.error ?? 'Error al guardar los roles']);
    }
  };

  return (
    <form className="consorcio-form-card" onSubmit={handleSubmit} data-testid="formulario-roles">
      <div className="form-header">
        <h3 className="form-title">{consorcio.nombre}</h3>
        <p className="form-subtitle">{consorcio.direccion}</p>
      </div>

      {errores.length > 0 && (
        <div className="alert alert-error" role="alert" data-testid="roles-errores">
          <div>
            <strong>Por favor corrija los siguientes errores:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
              {errores.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {confirmacion && (
        <div className="alert alert-success" role="status" data-testid="roles-confirmacion">
          {confirmacion}
        </div>
      )}

      {ROLES_DE_TRABAJO.map(({ clave, etiqueta }) => {
        const datos = formulario[clave];
        const opciones = directorio[clave];
        const enDirectorio = opciones.some((p) => p.nombre === datos.nombre);
        return (
          <fieldset key={clave} className="fieldset-section">
            <legend className="fieldset-legend">{etiqueta}</legend>

            <div className="form-field">
              <label htmlFor={`selector-${clave}`} className="field-label">
                Responsable
              </label>
              <select
                id={`selector-${clave}`}
                className="field-input"
                value={enDirectorio ? datos.nombre : ''}
                onChange={(e) => seleccionar(clave, e.target.value)}
                data-testid={`selector-${clave}`}
              >
                <option value="">+ Persona nueva</option>
                {opciones.map((p) => (
                  <option key={p.nombre} value={p.nombre}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-grid-3">
              <div className="form-field">
                <label htmlFor={`nombre-${clave}`} className="field-label">
                  Nombre *
                </label>
                <input
                  id={`nombre-${clave}`}
                  type="text"
                  className="field-input"
                  value={datos.nombre}
                  onChange={(e) => actualizar(clave, { nombre: e.target.value })}
                  data-testid={`nombre-${clave}`}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`telefono-${clave}`} className="field-label">
                  Teléfono
                </label>
                <input
                  id={`telefono-${clave}`}
                  type="tel"
                  className="field-input"
                  value={datos.telefono}
                  onChange={(e) => actualizar(clave, { telefono: e.target.value })}
                  data-testid={`telefono-${clave}`}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`email-${clave}`} className="field-label">
                  Email
                </label>
                <input
                  id={`email-${clave}`}
                  type="email"
                  className="field-input"
                  value={datos.email}
                  onChange={(e) => actualizar(clave, { email: e.target.value })}
                  data-testid={`email-${clave}`}
                />
              </div>
            </div>
          </fieldset>
        );
      })}

      <p className="field-help">Cada responsable necesita al menos un teléfono o un email.</p>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={guardando} data-testid="btn-guardar-roles">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

export function AsignacionRoles() {
  const [consorcios, setConsorcios] = useState<ConsorcioResumen[]>([]);
  const [roles, setRoles] = useState<Record<string, RolesEdificio>>({});
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  const cargar = async () => {
    setCargando(true);
    setError(null);
    const lista = await fetchConsorcios();
    if (!lista.ok || !lista.data) {
      setError(lista.error || 'Error al obtener consorcios');
      setCargando(false);
      return;
    }

    const respuestas = await Promise.all(lista.data.map((c) => fetchRoles(c.id)));
    const porConsorcio: Record<string, RolesEdificio> = {};
    lista.data.forEach((c, i) => {
      const data = respuestas[i]?.data;
      if (data) porConsorcio[c.id] = data;
    });

    setConsorcios(lista.data);
    setRoles(porConsorcio);
    setSeleccionadoId((actual) => actual ?? lista.data?.[0]?.id ?? null);
    setCargando(false);
  };

  useEffect(() => {
    void cargar();
  }, []);

  const directorio = useMemo(() => directorioPorRol(Object.values(roles)), [roles]);
  const seleccionado = consorcios.find((c) => c.id === seleccionadoId) ?? null;
  const rolesSeleccionado = seleccionadoId ? roles[seleccionadoId] : undefined;

  const texto = filtro.toLowerCase();
  const filtrados = consorcios.filter(
    (c) => c.nombre.toLowerCase().includes(texto) || c.direccion.toLowerCase().includes(texto),
  );

  return (
    <section className="secretaria-view" aria-labelledby="roles-titulo" data-testid="asignacion-roles">
      <div className="portal-header">
        <div>
          <h2 id="roles-titulo" className="portal-title">
            Secretaría: Asignación de Roles de Trabajo
          </h2>
          <p className="portal-desc">Terna responsable de cada edificio.</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          <button className="btn-link" onClick={() => cargar()} style={{ marginLeft: '12px' }}>
            Reintentar
          </button>
        </div>
      )}

      <div className="secretaria-layout roles-layout">
        <div className="consorcios-list-card">
          <div className="list-header">
            <h3 className="section-title">Edificios Empadronados ({consorcios.length})</h3>
            <input
              type="text"
              className="field-input field-input-sm"
              placeholder="Buscar por nombre o calle…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              data-testid="input-buscar-roles"
            />
          </div>

          {cargando ? (
            <div className="loading-box">Cargando edificios y responsables…</div>
          ) : filtrados.length === 0 ? (
            <div className="empty-box">
              {consorcios.length === 0
                ? 'No hay consorcios registrados aún.'
                : 'No se encontraron consorcios que coincidan con la búsqueda.'}
            </div>
          ) : (
            <div className="consorcios-scroll-list" data-testid="lista-roles">
              {filtrados.map((c) => {
                const rolesEdificio = roles[c.id];
                const asignado = ternaAsignada(rolesEdificio);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`consorcio-item-row roles-item-row ${seleccionadoId === c.id ? 'selected' : ''}`}
                    onClick={() => setSeleccionadoId(c.id)}
                    data-testid={`item-roles-${c.id}`}
                  >
                    <span className="consorcio-item-info">
                      <strong className="consorcio-item-nombre">{c.nombre}</strong>
                      <span className="consorcio-item-dir">
                        {asignado
                          ? `${rolesEdificio?.rtCalle?.nombre} · ${rolesEdificio?.firmante?.nombre} · ${rolesEdificio?.eca?.nombre}`
                          : c.direccion}
                      </span>
                    </span>
                    <span className="consorcio-item-meta">
                      <span className={`badge ${asignado ? 'badge-autorizada' : 'badge-pendiente-de-visita'}`}>
                        {asignado ? 'Asignado' : 'Sin asignar'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="roles-detalle">
          {cargando ? (
            <div className="loading-box">Cargando responsables…</div>
          ) : seleccionado && rolesSeleccionado ? (
            <FormularioTerna
              key={seleccionado.id}
              consorcio={seleccionado}
              roles={rolesSeleccionado}
              directorio={directorio}
              onGuardado={(nuevos) => setRoles((prev) => ({ ...prev, [nuevos.consorcioId]: nuevos }))}
            />
          ) : seleccionado ? (
            // Sin la terna actual no se muestra el formulario: guardarlo vacío pisaría la asignación.
            <div className="alert alert-error" role="alert">
              No se pudieron leer los responsables de este edificio.
              <button className="btn-link" onClick={() => cargar()} style={{ marginLeft: '12px' }}>
                Reintentar
              </button>
            </div>
          ) : (
            <div className="empty-box">Seleccione un edificio para asignar su terna de trabajo.</div>
          )}
        </div>
      </div>
    </section>
  );
}

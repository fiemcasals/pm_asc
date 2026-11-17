import React, { useCallback, useEffect, useState } from 'react';
import type { Rol } from '../auth/sesion';
import {
  crearUsuario,
  erroresDelFormulario,
  ETIQUETA_ROL,
  listarUsuarios,
  revocarSesiones,
  ROLES_DISPONIBLES,
  type FormularioUsuario,
  type UsuarioAdmin,
} from './usuarios';

const FORMULARIO_VACIO: FormularioUsuario = {
  usuario: '',
  nombre: '',
  email: '',
  rol: 'rt_calle',
  eca: '',
  password: '',
};

/** Alta de usuarios y permisos. Sólo la ve el Administrador (la API además lo exige). */
export function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [form, setForm] = useState<FormularioUsuario>(FORMULARIO_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const recargar = useCallback(async () => {
    const r = await listarUsuarios();
    if (r.kind === 'ok') setUsuarios(r.dato);
    else setError(r.message);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const campo = (clave: keyof FormularioUsuario) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [clave]: e.target.value }));

  const problemas = erroresDelFormulario(form);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    setExito(null);
    if (problemas.length > 0) {
      setError(problemas.join(' '));
      return;
    }
    setEnviando(true);
    const conPasswordPropia = form.password.length > 0;
    const r = await crearUsuario(form);
    setEnviando(false);
    if (r.kind === 'error') {
      setError(r.message);
      return;
    }
    setExito(
      conPasswordPropia
        ? `Listo: ${r.dato.usuario} ya puede ingresar con la contraseña que le entregues.`
        : `Listo: ${r.dato.usuario} tiene que entrar con "Olvidé mi contraseña" y el enlace le llega a ${r.dato.email}.`,
    );
    setForm(FORMULARIO_VACIO);
    await recargar();
  }

  async function cortarSesiones(u: UsuarioAdmin) {
    setError(null);
    setExito(null);
    const r = await revocarSesiones(u.id);
    if (r.kind === 'ok') setExito(`Se cerraron todas las sesiones de ${u.usuario}.`);
    else setError(r.message);
  }

  return (
    <section aria-labelledby="admin-titulo" data-testid="vista-usuarios">
      <div className="portal-header">
        <div>
          <h2 id="admin-titulo" className="portal-title">
            Usuarios y permisos
          </h2>
          <p className="portal-desc">
            Alta de cuentas del sistema. El permiso de cada persona es su <strong>rol</strong>: cada
            cuenta tiene uno y eso define qué pantallas ve.
          </p>
        </div>
      </div>

      {error && (
        <p className="alert alert-error" role="alert" data-testid="admin-error">
          {error}
        </p>
      )}
      {exito && (
        <p className="alert alert-success" role="status" data-testid="admin-exito">
          {exito}
        </p>
      )}

      <form className="card consorcio-form-card" onSubmit={guardar} noValidate>
        <div className="form-header">
          <h3 className="form-title">Nueva cuenta</h3>
          <p className="form-subtitle">
            Si dejás la contraseña vacía, se genera una al azar que nadie ve: la persona elige la suya
            con "Olvidé mi contraseña" y el enlace le llega por mail.
          </p>
        </div>

        <div className="form-grid-2">
          <div className="form-field">
            <label className="field-label" htmlFor="admin-usuario">
              Usuario
            </label>
            <input
              id="admin-usuario"
              className="field-input"
              value={form.usuario}
              onChange={campo('usuario')}
              autoCapitalize="none"
              spellCheck={false}
              placeholder="jperez"
              data-testid="admin-usuario"
            />
          </div>

          <div className="form-field">
            <label className="field-label" htmlFor="admin-nombre">
              Nombre y apellido
            </label>
            <input
              id="admin-nombre"
              className="field-input"
              value={form.nombre}
              onChange={campo('nombre')}
              placeholder="Juan Pérez"
              data-testid="admin-nombre"
            />
          </div>

          <div className="form-field">
            <label className="field-label" htmlFor="admin-email">
              Email
            </label>
            <input
              id="admin-email"
              className="field-input"
              type="email"
              value={form.email}
              onChange={campo('email')}
              autoCapitalize="none"
              spellCheck={false}
              placeholder="jperez@empresa.com"
              data-testid="admin-email"
            />
            <span className="field-help">Ahí llega el enlace para elegir la contraseña.</span>
          </div>

          <div className="form-field">
            <label className="field-label" htmlFor="admin-rol">
              Rol (permisos)
            </label>
            <select
              id="admin-rol"
              className="field-input"
              value={form.rol}
              onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as Rol }))}
              data-testid="admin-rol"
            >
              {ROLES_DISPONIBLES.map((r) => (
                <option key={r.rol} value={r.rol}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
            <span className="field-help">
              {ROLES_DISPONIBLES.find((r) => r.rol === form.rol)?.descripcion}
            </span>
          </div>

          {form.rol === 'eca' && (
            <div className="form-field">
              <label className="field-label" htmlFor="admin-eca">
                Empresa Conservadora (ECA)
              </label>
              <input
                id="admin-eca"
                className="field-input"
                value={form.eca}
                onChange={campo('eca')}
                placeholder="MAICON S.R.L."
                data-testid="admin-eca"
              />
              <span className="field-help">Sólo va a ver los edificios de esta empresa.</span>
            </div>
          )}

          <div className="form-field">
            <label className="field-label" htmlFor="admin-password">
              Contraseña (opcional)
            </label>
            <input
              id="admin-password"
              className="field-input"
              type="text"
              value={form.password}
              onChange={campo('password')}
              placeholder="se genera al azar"
              autoComplete="off"
              data-testid="admin-password"
            />
            <span className="field-help">Mínimo 10 caracteres si la escribís a mano.</span>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={enviando || problemas.length > 0}
            data-testid="admin-crear"
          >
            {enviando ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>

      <div className="card">
        <h3 className="form-title">Cuentas del sistema</h3>
        {usuarios === null && <p className="loading-box">Cargando…</p>}
        {usuarios?.length === 0 && <p className="empty-box">Todavía no hay usuarios.</p>}
        {usuarios && usuarios.length > 0 && (
          <div className="table-responsive">
            <table className="flota-table" data-testid="admin-lista">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Email</th>
                  <th>Sesiones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>{u.usuario}</td>
                    <td>{u.nombre}</td>
                    <td>
                      {ETIQUETA_ROL[u.rol]}
                      {u.eca && <span className="text-muted"> · {u.eca}</span>}
                    </td>
                    <td className={u.email ? undefined : 'text-muted'}>
                      {u.email ?? 'sin email (no puede recuperar la contraseña)'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void cortarSesiones(u)}
                      >
                        Cerrar sesiones
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

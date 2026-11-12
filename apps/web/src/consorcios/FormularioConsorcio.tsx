import React, { useState } from 'react';
import {
  Consorcio,
  ConsorcioInput,
  crearConsorcio,
  MaquinaInput,
} from './consorcios';

interface FormularioConsorcioProps {
  onConsorcioCreado: (nuevo: Consorcio) => void;
  onCancelar?: () => void;
}

export function FormularioConsorcio({ onConsorcioCreado, onCancelar }: FormularioConsorcioProps) {
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [adminNombre, setAdminNombre] = useState('');
  const [adminTelefono, setAdminTelefono] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  // Grilla dinámica de máquinas AGC iniciada con M1 y M2 por defecto
  const [maquinas, setMaquinas] = useState<MaquinaInput[]>([
    { referenciaAgc: 'M1', descripcion: 'Ascensor Principal' },
    { referenciaAgc: 'M2', descripcion: 'Ascensor Secundario / Servicio' },
  ]);

  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [exito, setExito] = useState(false);

  const agregarMaquina = () => {
    const siguienteNumero = maquinas.length + 1;
    setMaquinas((prev) => [
      ...prev,
      { referenciaAgc: `M${siguienteNumero}`, descripcion: '' },
    ]);
  };

  const quitarMaquina = (index: number) => {
    if (maquinas.length <= 1) {
      setErrores(['Debe registrar al menos una máquina en el edificio.']);
      return;
    }
    setMaquinas((prev) => prev.filter((_, i) => i !== index));
  };

  const actualizarMaquina = (index: number, campo: keyof MaquinaInput, valor: string) => {
    setMaquinas((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [campo]: valor } : m)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores([]);
    setExito(false);

    // Validaciones locales rápidas
    const erroresLocales: string[] = [];
    if (!nombre.trim()) erroresLocales.push('El nombre del consorcio es obligatorio.');
    if (!direccion.trim()) erroresLocales.push('La dirección del edificio es obligatoria.');
    if (maquinas.length === 0) erroresLocales.push('Debe incluir al menos una máquina.');

    // Verificar referencias AGC no vacías y no duplicadas
    const refs = maquinas.map((m) => m.referenciaAgc.trim().toUpperCase());
    if (refs.some((r) => !r)) {
      erroresLocales.push('Cada máquina debe tener una referencia AGC (ej. M1, M2).');
    }
    const unicos = new Set(refs);
    if (unicos.size !== refs.length) {
      erroresLocales.push('Las referencias AGC no pueden repetirse en el mismo edificio.');
    }

    if (erroresLocales.length > 0) {
      setErrores(erroresLocales);
      return;
    }

    setEnviando(true);

    const payload: ConsorcioInput = {
      nombre: nombre.trim(),
      direccion: direccion.trim(),
      administracion: {
        nombre: adminNombre.trim() || null,
        telefono: adminTelefono.trim() || null,
        email: adminEmail.trim() || null,
      },
      maquinas: maquinas.map((m) => ({
        referenciaAgc: m.referenciaAgc.trim().toUpperCase(),
        descripcion: m.descripcion?.trim() || null,
      })),
    };

    const res = await crearConsorcio(payload);
    setEnviando(false);

    if (res.ok && res.data) {
      setExito(true);
      onConsorcioCreado(res.data);
    } else {
      if (res.errores && res.errores.length > 0) {
        setErrores(res.errores);
      } else {
        setErrores([res.error || 'Error al guardar el consorcio']);
      }
    }
  };

  return (
    <form
      className="consorcio-form-card"
      onSubmit={handleSubmit}
      data-testid="formulario-alta-consorcio"
      aria-labelledby="form-alta-titulo"
    >
      <div className="form-header">
        <h3 id="form-alta-titulo" className="form-title">
          Alta de Consorcio y Empadronamiento de Máquinas AGC
        </h3>
        <p className="form-subtitle">
          Carga inicial del edificio y sus ascensores para asignación de rutas y control oficial de la AGC.
        </p>
      </div>

      {errores.length > 0 && (
        <div className="alert alert-error" role="alert">
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

      {exito && (
        <div className="alert alert-success" role="status">
          ✓ Consorcio y máquinas registrados con éxito.
        </div>
      )}

      {/* Datos del Inmueble */}
      <fieldset className="fieldset-section">
        <legend className="fieldset-legend">1. Datos del Inmueble y Consorcio</legend>

        <div className="form-grid-2">
          <div className="form-field">
            <label htmlFor="nombre-consorcio" className="field-label">
              Nombre del Consorcio *
            </label>
            <input
              id="nombre-consorcio"
              type="text"
              className="field-input"
              placeholder="Ej. Consorcio Av. Cabildo 1540"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              data-testid="input-nombre"
            />
          </div>

          <div className="form-field">
            <label htmlFor="direccion-consorcio" className="field-label">
              Dirección (CABA) *
            </label>
            <input
              id="direccion-consorcio"
              type="text"
              className="field-input"
              placeholder="Ej. Av. Cabildo 1540, Belgrano, CABA"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              required
              data-testid="input-direccion"
            />
          </div>
        </div>
      </fieldset>

      {/* Datos de Administración */}
      <fieldset className="fieldset-section">
        <legend className="fieldset-legend">2. Datos de la Administración</legend>

        <div className="form-grid-3">
          <div className="form-field">
            <label htmlFor="admin-nombre" className="field-label">
              Razón Social / Administrador
            </label>
            <input
              id="admin-nombre"
              type="text"
              className="field-input"
              placeholder="Ej. Administración Belgrano SRL"
              value={adminNombre}
              onChange={(e) => setAdminNombre(e.target.value)}
              data-testid="input-admin-nombre"
            />
          </div>

          <div className="form-field">
            <label htmlFor="admin-telefono" className="field-label">
              Teléfono de Contacto
            </label>
            <input
              id="admin-telefono"
              type="tel"
              className="field-input"
              placeholder="Ej. 11-4567-8900"
              value={adminTelefono}
              onChange={(e) => setAdminTelefono(e.target.value)}
              data-testid="input-admin-telefono"
            />
          </div>

          <div className="form-field">
            <label htmlFor="admin-email" className="field-label">
              Email Oficial
            </label>
            <input
              id="admin-email"
              type="email"
              className="field-input"
              placeholder="admin@consorcios.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              data-testid="input-admin-email"
            />
          </div>
        </div>
      </fieldset>

      {/* Grilla Dinámica de Máquinas AGC */}
      <fieldset className="fieldset-section" data-testid="grilla-dinamica-maquinas">
        <div className="section-header-row">
          <legend className="fieldset-legend" style={{ margin: 0 }}>
            3. Máquinas AGC del Edificio ({maquinas.length})
          </legend>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={agregarMaquina}
            data-testid="btn-agregar-maquina"
          >
            + Agregar Otra Máquina
          </button>
        </div>

        <p className="field-help">
          Indique cada ascensor o montacargas con su identificador oficial ante AGC (ej. <code>M1</code>, <code>M2</code>).
        </p>

        <div className="maquinas-grid-list">
          {maquinas.map((m, index) => (
            <div key={index} className="maquina-grid-row" data-testid={`maquina-row-${index}`}>
              <div className="field-compact">
                <label className="field-label-sm">Ref. AGC *</label>
                <input
                  type="text"
                  className="field-input field-input-agc"
                  value={m.referenciaAgc}
                  placeholder={`M${index + 1}`}
                  onChange={(e) => actualizarMaquina(index, 'referenciaAgc', e.target.value)}
                  required
                  data-testid={`input-agc-${index}`}
                />
              </div>

              <div className="field-wide">
                <label className="field-label-sm">Descripción / Ubicación</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="Ej. Batería Derecha, Cabina Principal, etc."
                  value={m.descripcion || ''}
                  onChange={(e) => actualizarMaquina(index, 'descripcion', e.target.value)}
                  data-testid={`input-desc-${index}`}
                />
              </div>

              <div className="action-col">
                <button
                  type="button"
                  className="btn-remove-row"
                  onClick={() => quitarMaquina(index)}
                  title="Eliminar máquina"
                  aria-label={`Eliminar máquina ${m.referenciaAgc || index + 1}`}
                  data-testid={`btn-quitar-maquina-${index}`}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Botones de acción */}
      <div className="form-actions">
        {onCancelar && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancelar}
            disabled={enviando}
          >
            Cancelar
          </button>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={enviando}
          data-testid="btn-submit-consorcio"
        >
          {enviando ? 'Registrando en PostgreSQL…' : 'Registrar Consorcio y Máquinas'}
        </button>
      </div>
    </form>
  );
}

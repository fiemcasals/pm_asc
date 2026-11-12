import React, { useEffect, useState } from 'react';
import { AlertaFallaCritica } from '../fallas/AlertaFallaCritica';
import { AsignacionRoles } from './AsignacionRoles';
import {
  Consorcio,
  ConsorcioMapaItem,
  ConsorcioResumen,
  fetchConsorcioById,
  fetchConsorcios,
  fetchConsorciosMapa,
} from './consorcios';
import { FichaConsorcio } from './FichaConsorcio';
import { FormularioConsorcio } from './FormularioConsorcio';
import { MapaUbicacionConsorcio } from './MapaUbicacionConsorcio';
import { puedeSalir } from './roles';

interface EdificiosPanelProps {
  consorcioInicialId?: string | null;
}

function EdificiosPanel({ consorcioInicialId }: EdificiosPanelProps) {
  const [consorcios, setConsorcios] = useState<ConsorcioResumen[]>([]);
  const [consorciosMapa, setConsorciosMapa] = useState<ConsorcioMapaItem[]>([]);
  const [mostrarMapaGlobal, setMostrarMapaGlobal] = useState(false);
  const [consorcioSeleccionado, setConsorcioSeleccionado] = useState<Consorcio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoFicha, setCargandoFicha] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [filtro, setFiltro] = useState('');

  const cargarConsorcios = async (seleccionarId?: string) => {
    setCargando(true);
    setError(null);
    const [res, resMapa] = await Promise.all([fetchConsorcios(), fetchConsorciosMapa()]);
    if (res.ok && res.data) {
      setConsorcios(res.data);
      if (resMapa.ok && resMapa.data) {
        setConsorciosMapa(resMapa.data);
      }

      // Si se especifica un id para seleccionar (ej. recién creado), o si hay al menos uno
      const idParaSeleccionar = seleccionarId || (consorcioSeleccionado ? consorcioSeleccionado.id : res.data[0]?.id);
      if (idParaSeleccionar) {
        void seleccionarConsorcio(idParaSeleccionar);
      }
    } else {
      setError(res.error || 'Error al obtener consorcios');
    }
    setCargando(false);
  };

  const seleccionarConsorcio = async (id: string) => {
    setCargandoFicha(true);
    const res = await fetchConsorcioById(id);
    if (res.ok && res.data) {
      setConsorcioSeleccionado(res.data);
    }
    setCargandoFicha(false);
  };

  useEffect(() => {
    void cargarConsorcios(consorcioInicialId ?? undefined);
  }, [consorcioInicialId]);

  const handleConsorcioCreado = (nuevo: Consorcio) => {
    setMostrarFormulario(false);
    setConsorcioSeleccionado(nuevo);
    void cargarConsorcios(nuevo.id);
  };

  const handleConsorcioActualizado = (actualizado: Consorcio) => {
    setConsorcioSeleccionado(actualizado);
    void cargarConsorcios(actualizado.id);
  };

  const filtrados = consorcios.filter(
    (c) =>
      c.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
      c.direccion.toLowerCase().includes(filtro.toLowerCase()),
  );

  return (
    <section className="secretaria-view" aria-labelledby="secretaria-titulo" data-testid="secretaria-view">
      {/* Header de Secretaría */}
      <div className="portal-header">
        <div>
          <h2 id="secretaria-titulo" className="portal-title">
            Secretaría: Carga y Ficha de Edificios y Máquinas
          </h2>
          <p className="portal-desc">
            Administración centralizada de consorcios, empadronamiento de máquinas AGC y ficha técnica oficial.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setMostrarMapaGlobal((prev) => !prev)}
            data-testid="btn-toggle-mapa-edificios"
          >
            {mostrarMapaGlobal ? '✕ Ocultar Mapa' : `🗺️ Vista Mapa (${consorciosMapa.length}/${consorcios.length})`}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setMostrarFormulario(!mostrarFormulario)}
            data-testid="btn-toggle-formulario"
          >
            {mostrarFormulario ? '✕ Cerrar Formulario' : '+ Alta de Nuevo Consorcio'}
          </button>
        </div>
      </div>

      {mostrarMapaGlobal && (
        <div className="consorcio-form-card" style={{ marginBottom: '16px' }} data-testid="panel-vista-mapa">
          <div className="section-header-row" style={{ marginBottom: '8px' }}>
            <h3 className="section-title" style={{ margin: 0 }}>
              Vista Geográfica de Edificios Empadronados ({consorciosMapa.length})
            </h3>
            <span className="text-muted" style={{ fontSize: '13px' }}>
              Excluidos sin ubicación: {Math.max(0, consorcios.length - consorciosMapa.length)}
            </span>
          </div>
          <MapaUbicacionConsorcio
            ubicacion={null}
            marcadores={consorciosMapa.map((c) => ({
              id: c.id,
              etiqueta: c.nombre,
              subtitulo: c.direccion,
              ubicacion: c.ubicacion,
            }))}
            testId="mapa-global-consorcios"
          />
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          <button className="btn-link" onClick={() => cargarConsorcios()} style={{ marginLeft: '12px' }}>
            Reintentar
          </button>
        </div>
      )}

      {/* Criterio 1: Formulario de alta de consorcios con grilla dinámica */}
      {mostrarFormulario && (
        <div className="formulario-wrapper" data-testid="contenedor-formulario-alta">
          <FormularioConsorcio
            onConsorcioCreado={handleConsorcioCreado}
            onCancelar={() => setMostrarFormulario(false)}
          />
        </div>
      )}

      {/* Layout Master-Detail: Listado (Izquierda) + Ficha Técnica (Derecha) */}
      <div className="secretaria-layout">
        {/* Columna Izquierda: Listado de Consorcios */}
        <div className="consorcios-list-card">
          <div className="list-header">
            <h3 className="section-title">
              Edificios Empadronados ({consorcios.length})
            </h3>
            <input
              type="text"
              className="field-input field-input-sm"
              placeholder="Buscar por nombre o calle…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              data-testid="input-buscar-consorcio"
            />
          </div>

          {cargando ? (
            <div className="loading-box">Cargando consorcios…</div>
          ) : filtrados.length === 0 ? (
            <div className="empty-box">
              {consorcios.length === 0
                ? 'No hay consorcios registrados aún. Cree uno nuevo con el botón superior.'
                : 'No se encontraron consorcios que coincidan con la búsqueda.'}
            </div>
          ) : (
            <div className="consorcios-scroll-list" data-testid="lista-consorcios">
              {filtrados.map((c) => {
                const seleccionado = consorcioSeleccionado?.id === c.id;
                return (
                  <div
                    key={c.id}
                    className={`consorcio-item-row ${seleccionado ? 'selected' : ''}`}
                    onClick={() => seleccionarConsorcio(c.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        void seleccionarConsorcio(c.id);
                      }
                    }}
                    data-testid={`item-consorcio-${c.id}`}
                  >
                    <div className="consorcio-item-info">
                      <strong className="consorcio-item-nombre">{c.nombre}</strong>
                      <span className="consorcio-item-dir">📍 {c.direccion}</span>
                    </div>

                    <div className="consorcio-item-meta">
                      <span className="badge badge-autorizada">
                        {c.cantidadMaquinas} {c.cantidadMaquinas === 1 ? 'máquina' : 'máquinas'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Columna Derecha: Criterio 2: Visualización de Ficha Técnica Completa */}
        <div className="ficha-tecnica-wrapper" data-testid="contenedor-ficha-tecnica">
          {cargandoFicha ? (
            <div className="loading-box">Cargando ficha técnica y máquinas…</div>
          ) : consorcioSeleccionado ? (
            <FichaConsorcio consorcio={consorcioSeleccionado} onConsorcioActualizado={handleConsorcioActualizado} />
          ) : (
            <div className="empty-box" style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Seleccione un consorcio de la lista para visualizar su ficha técnica completa y máquinas asociadas.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface SecretariaViewProps {
  consorcioInicialId?: string | null;
}

export function SecretariaView({ consorcioInicialId }: SecretariaViewProps) {
  const [pestana, setPestana] = useState<'edificios' | 'roles'>('edificios');

  useEffect(() => {
    if (consorcioInicialId) {
      setPestana('edificios');
    }
  }, [consorcioInicialId]);

  return (
    <>
      <nav className="nav-tabs" aria-label="Pestañas de Secretaría">
        <button
          className={`tab-btn ${pestana === 'edificios' ? 'active' : ''}`}
          onClick={() => puedeSalir() && setPestana('edificios')}
          data-testid="pestana-edificios"
        >
          Edificios y Máquinas
        </button>
        <button
          className={`tab-btn ${pestana === 'roles' ? 'active' : ''}`}
          onClick={() => setPestana('roles')}
          data-testid="pestana-roles"
        >
          Asignación de Roles de Trabajo
        </button>
      </nav>

      {pestana === 'edificios' ? (
        <EdificiosPanel consorcioInicialId={consorcioInicialId} />
      ) : (
        <AsignacionRoles />
      )}

      <AlertaFallaCritica />
    </>
  );
}

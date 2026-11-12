import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  obtenerChecklistParaTipo,
  requiereFotoChecklist,
  type ChecklistSolapaConfig,
  type EstadoEquipoUso,
  type SolapaId,
  type TipoMaquinaChecklist,
} from './checklist.config';
import {
  claveFotoAnomalia,
  fetchChecklistConfig,
  type FotosPorEquipo,
  type ObservacionesChecklist,
  type RespuestasChecklist,
} from './checklist.logic';
import { ChecklistSolapaView } from './ChecklistSolapaView';
import {
  COMPONENTES_ACCESOS_POR_PISO,
  GRUPOS_COMPONENTES_ACCESOS,
  PISOS_EDIFICIO_DEFAULT,
  agregarFallaPiso,
  claveFotoFallaPiso,
  crearFallaPiso,
  eliminarFallaPiso,
  type FallaPisoRegistro,
} from './fallasPiso';
import { comprimirFotoAnomalia, type FotoAnomalia } from './fotos';
import {
  EQUIPOS_EDIFICIO_DEMO,
  aplicarRespuestaConSalaCompartida,
  obtenerSiguienteSolapa,
  obtenerSolapaAnterior,
} from './navegacion';
import {
  cargarVisitaEnCurso,
  guardarVisitaEnCurso,
  limpiarVisitaEnCurso,
  tieneProgresoVisita,
} from './offlineStore';

const EQUIPOS_DEMO = EQUIPOS_EDIFICIO_DEMO;

export function InspeccionCampoView() {
  const [equipoId, setEquipoId] = useState<string>(EQUIPOS_DEMO[0].maquinaId);
  const [tipoOverride, setTipoOverride] = useState<Record<string, TipoMaquinaChecklist>>({});
  const [estadoPorEquipo, setEstadoPorEquipo] = useState<Record<string, EstadoEquipoUso>>({});
  const [solapaActiva, setSolapaActiva] = useState<SolapaId>('sala_maquinas');
  const [respuestasPorEquipo, setRespuestasPorEquipo] = useState<Record<string, RespuestasChecklist>>({});
  const [obsPorEquipo, setObsPorEquipo] = useState<Record<string, ObservacionesChecklist>>({});
  const [fotosPorEquipo, setFotosPorEquipo] = useState<Record<string, FotosPorEquipo>>({});
  const [fallasPisoPorEquipo, setFallasPisoPorEquipo] = useState<Record<string, FallaPisoRegistro[]>>({});
  const [formPisoAbierto, setFormPisoAbierto] = useState<boolean>(false);
  const [pisoSeleccionado, setPisoSeleccionado] = useState<string>('PB');
  const [componentePisoId, setComponentePisoId] = useState<string>(COMPONENTES_ACCESOS_POR_PISO[0].id);
  const [detallePiso, setDetallePiso] = useState<string>('');
  const [avisoSala, setAvisoSala] = useState<string | null>(null);
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, ReturnType<typeof obtenerChecklistParaTipo>>>({});
  const [enLinea, setEnLinea] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [ultimaSyncIdb, setUltimaSyncIdb] = useState<string | null>(null);
  const [restauradaDesdeIdb, setRestauradaDesdeIdb] = useState<boolean>(false);
  const hidratadoRef = useRef<boolean>(false);

  useEffect(() => {
    const onOnline = () => setEnLinea(true);
    const onOffline = () => setEnLinea(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    let activo = true;
    void cargarVisitaEnCurso()
      .then((snap) => {
        if (!activo || !snap) return;
        setEquipoId(snap.equipoId);
        setSolapaActiva(snap.solapaActiva);
        setTipoOverride(snap.tipoOverride ?? {});
        setEstadoPorEquipo(snap.estadoPorEquipo ?? {});
        setRespuestasPorEquipo(snap.respuestasPorEquipo ?? {});
        setObsPorEquipo(snap.obsPorEquipo ?? {});
        setFotosPorEquipo(snap.fotosPorEquipo ?? {});
        setFallasPisoPorEquipo(snap.fallasPisoPorEquipo ?? {});
        setUltimaSyncIdb(snap.actualizadaEn);
        if (tieneProgresoVisita(snap)) {
          setRestauradaDesdeIdb(true);
        }
      })
      .catch(() => {
        // Entorno sin IndexedDB
      })
      .finally(() => {
        if (activo) hidratadoRef.current = true;
      });
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (!hidratadoRef.current) return;
    void guardarVisitaEnCurso({
      equipoId,
      solapaActiva,
      tipoOverride,
      estadoPorEquipo,
      respuestasPorEquipo,
      obsPorEquipo,
      fotosPorEquipo,
      fallasPisoPorEquipo,
    })
      .then((saved) => {
        setUltimaSyncIdb(saved.actualizadaEn);
      })
      .catch(() => {
        // Ignorar en entornos de prueba sin IDB
      });
  }, [
    equipoId,
    solapaActiva,
    tipoOverride,
    estadoPorEquipo,
    respuestasPorEquipo,
    obsPorEquipo,
    fotosPorEquipo,
    fallasPisoPorEquipo,
  ]);

  const handleReiniciarBorrador = () => {
    setEquipoId(EQUIPOS_DEMO[0].maquinaId);
    setSolapaActiva('sala_maquinas');
    setTipoOverride({});
    setEstadoPorEquipo({});
    setRespuestasPorEquipo({});
    setObsPorEquipo({});
    setFotosPorEquipo({});
    setFallasPisoPorEquipo({});
    setAvisoSala(null);
    setRestauradaDesdeIdb(false);
    setUltimaSyncIdb(null);
    void limpiarVisitaEnCurso().catch(() => {});
  };

  const pisosEdificio = PISOS_EDIFICIO_DEFAULT;
  const fallasPisoActuales = fallasPisoPorEquipo[equipoId] ?? [];

  const equipo = useMemo(
    () => EQUIPOS_DEMO.find((e) => e.maquinaId === equipoId) ?? EQUIPOS_DEMO[0],
    [equipoId],
  );
  const tipoActual = tipoOverride[equipo.maquinaId] ?? equipo.tipo;
  const estadoActual = estadoPorEquipo[equipo.maquinaId] ?? 'en_uso';

  useEffect(() => {
    let cancelado = false;
    void fetchChecklistConfig(tipoActual).then((cfg) => {
      if (!cancelado) {
        setConfigs((prev) => ({ ...prev, [tipoActual]: cfg }));
      }
    });
    return () => {
      cancelado = true;
    };
  }, [tipoActual]);

  const config = configs[tipoActual] ?? obtenerChecklistParaTipo(tipoActual);

  const itemsPorId = useMemo(() => {
    const mapa = new Map<string, { itemEtiqueta: string; opciones: readonly { id: string; esFalla: boolean; esFallaCritica: boolean; fotoObligatoria: boolean }[] }>();
    for (const s of config.solapas) {
      for (const sub of s.subgrupos) {
        for (const it of sub.items) {
          mapa.set(it.id, { itemEtiqueta: it.etiqueta, opciones: it.opciones });
        }
      }
    }
    return mapa;
  }, [config]);

  const handleSeleccionarOpcion = (solapaId: SolapaId, itemId: string, opcionId: string) => {
    setRespuestasPorEquipo((prev) => {
      const { respuestasPorEquipo: siguiente, propagadoAEquipos } =
        aplicarRespuestaConSalaCompartida({
          prevRespuestasPorEquipo: prev,
          equipos: EQUIPOS_DEMO,
          equipoActivoId: equipo.maquinaId,
          config,
          solapaId,
          itemId,
          opcionId,
        });
      if (propagadoAEquipos.length > 0 && equipo.salaCompartidaNombre) {
        const refs = EQUIPOS_DEMO.filter((e) => propagadoAEquipos.includes(e.maquinaId))
          .map((e) => e.referenciaAgc)
          .join(', ');
        setAvisoSala(
          `Entorno sincronizado automáticamente en ${equipo.salaCompartidaNombre} (${refs}).`,
        );
      }
      return siguiente;
    });
  };

  const handleCambiarObs = (solapaId: SolapaId, texto: string) => {
    setObsPorEquipo((prev) => {
      const equipoPrev = prev[equipo.maquinaId] ?? {};
      return {
        ...prev,
        [equipo.maquinaId]: {
          ...equipoPrev,
          [solapaId]: texto,
        },
      };
    });
  };

  const handleAdjuntarFoto = async (
    solapaId: SolapaId,
    itemId: string,
    itemEtiqueta: string,
    file: File | null,
  ) => {
    if (!file) return;
    setFotoError(null);
    try {
      const { dataUrl, sizeBytes } = await comprimirFotoAnomalia(file);
      const nuevaFoto: FotoAnomalia = {
        id: `foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        maquinaId: equipo.maquinaId,
        referenciaAgc: equipo.referenciaAgc,
        solapaId,
        itemId,
        itemEtiqueta,
        dataUrl,
        sizeBytes,
        tomadaEn: new Date().toISOString(),
      };
      setFotosPorEquipo((prev) => ({
        ...prev,
        [equipo.maquinaId]: {
          ...(prev[equipo.maquinaId] ?? {}),
          [claveFotoAnomalia(solapaId, itemId)]: nuevaFoto,
        },
      }));
    } catch (err) {
      setFotoError(err instanceof Error ? err.message : 'Error al procesar fotografía');
    }
  };

  const handleQuitarFoto = (solapaId: SolapaId, itemId: string) => {
    const clave = claveFotoAnomalia(solapaId, itemId);
    setFotosPorEquipo((prev) => {
      const actual = { ...(prev[equipo.maquinaId] ?? {}) };
      delete actual[clave];
      return { ...prev, [equipo.maquinaId]: actual };
    });
  };

  const handleConfirmarFallaPiso = () => {
    const nueva = crearFallaPiso(pisoSeleccionado, componentePisoId, detallePiso);
    setFallasPisoPorEquipo((prev) => ({
      ...prev,
      [equipo.maquinaId]: agregarFallaPiso(prev[equipo.maquinaId] ?? [], nueva),
    }));
    setDetallePiso('');
    setFormPisoAbierto(false);
  };

  const handleEliminarFallaPiso = (fallaId: string) => {
    setFallasPisoPorEquipo((prev) => ({
      ...prev,
      [equipo.maquinaId]: eliminarFallaPiso(prev[equipo.maquinaId] ?? [], fallaId),
    }));
    const clave = claveFotoFallaPiso(fallaId);
    setFotosPorEquipo((prev) => {
      const actual = { ...(prev[equipo.maquinaId] ?? {}) };
      delete actual[clave];
      return { ...prev, [equipo.maquinaId]: actual };
    });
  };

  const handleAdjuntarFotoFallaPiso = async (falla: FallaPisoRegistro, file: File | null) => {
    if (!file) return;
    setFotoError(null);
    try {
      const { dataUrl, sizeBytes } = await comprimirFotoAnomalia(file);
      const nuevaFoto: FotoAnomalia = {
        id: `foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        maquinaId: equipo.maquinaId,
        referenciaAgc: equipo.referenciaAgc,
        solapaId: 'accesos',
        itemId: `piso:${falla.id}`,
        itemEtiqueta: `Piso ${falla.piso} — ${falla.componenteEtiqueta}`,
        dataUrl,
        sizeBytes,
        tomadaEn: new Date().toISOString(),
      };
      setFotosPorEquipo((prev) => ({
        ...prev,
        [equipo.maquinaId]: {
          ...(prev[equipo.maquinaId] ?? {}),
          [claveFotoFallaPiso(falla.id)]: nuevaFoto,
        },
      }));
    } catch (err) {
      setFotoError(err instanceof Error ? err.message : 'Error al procesar fotografía');
    }
  };

  const renderExtraEnSolapa = (solapa: ChecklistSolapaConfig) => {
    if (solapa.id !== 'accesos') return null;
    const fotosEquipo = fotosPorEquipo[equipo.maquinaId] ?? {};

    return (
      <div className="checklist-fallas-piso-box" data-testid="fallas-piso-section">
        <div className="checklist-fallas-piso-head">
          <div>
            <h4 className="checklist-fallas-piso-title">Fallas por Piso en Accesos</h4>
            <p className="checklist-fallas-piso-sub">
              Pisos del edificio: {pisosEdificio.join(', ')} ({fallasPisoActuales.length} registradas)
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setFormPisoAbierto((prev) => !prev)}
            data-testid="btn-agregar-falla-piso"
          >
            {formPisoAbierto ? 'Cerrar formulario' : '+ Agregar Falla en un Piso'}
          </button>
        </div>

        {formPisoAbierto && (
          <div className="checklist-fallas-piso-form" data-testid="form-falla-piso">
            <div className="checklist-fallas-piso-grid">
              <label className="inspeccion-field">
                <span>Piso del edificio</span>
                <select
                  value={pisoSeleccionado}
                  onChange={(e) => setPisoSeleccionado(e.target.value)}
                  data-testid="select-piso-falla"
                >
                  {pisosEdificio.map((piso) => (
                    <option key={piso} value={piso}>
                      Piso {piso}
                    </option>
                  ))}
                </select>
              </label>

              <label className="inspeccion-field">
                <span>Componente</span>
                <select
                  value={componentePisoId}
                  onChange={(e) => setComponentePisoId(e.target.value)}
                  data-testid="select-componente-falla"
                >
                  {GRUPOS_COMPONENTES_ACCESOS.map((grupo) => (
                    <optgroup key={grupo.id} label={grupo.titulo}>
                      {COMPONENTES_ACCESOS_POR_PISO.filter((c) => c.grupo === grupo.id).map((comp) => (
                        <option key={comp.id} value={comp.id}>
                          {comp.etiqueta}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>

            <label className="inspeccion-field">
              <span>Detalle opcional (hoja, lado, observación puntual)</span>
              <input
                type="text"
                value={detallePiso}
                onChange={(e) => setDetallePiso(e.target.value)}
                placeholder="Ej: puerta izquierda con luz de 14 cm"
                data-testid="input-detalle-falla-piso"
              />
            </label>

            <div className="checklist-fallas-piso-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConfirmarFallaPiso}
                data-testid="btn-confirmar-falla-piso"
              >
                Registrar falla en piso {pisoSeleccionado}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setFormPisoAbierto(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {fallasPisoActuales.length > 0 && (
          <ul className="checklist-fallas-piso-lista" data-testid="lista-fallas-piso">
            {fallasPisoActuales.map((falla) => {
              const foto = fotosEquipo[claveFotoFallaPiso(falla.id)];
              return (
                <li
                  key={falla.id}
                  className={`checklist-falla-piso-item ${falla.esFallaCritica ? 'es-critica' : ''}`}
                  data-testid={`falla-piso-item-${falla.id}`}
                >
                  <div className="checklist-falla-piso-info">
                    <div className="checklist-falla-piso-tags">
                      <span className="falla-piso-badge">Piso {falla.piso}</span>
                      <span className="falla-grupo-badge">{falla.grupoTitulo}</span>
                      {falla.esFallaCritica && (
                        <span className="checklist-opcion-flag flag-critica">Crítica</span>
                      )}
                    </div>
                    <strong className="checklist-falla-piso-comp">{falla.componenteEtiqueta}</strong>
                    {falla.detalle && (
                      <span className="checklist-falla-piso-det">{falla.detalle}</span>
                    )}
                    {foto && (
                      <span className="checklist-foto-opcional">
                        Foto adjunta ({Math.max(1, Math.round(foto.sizeBytes / 1024))} KB)
                      </span>
                    )}
                  </div>

                  <div className="checklist-falla-piso-btns">
                    <label className="btn btn-secondary btn-sm">
                      <span>{foto ? 'Cambiar foto' : 'Adjuntar foto'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only-input"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          void handleAdjuntarFotoFallaPiso(falla, f);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleEliminarFallaPiso(falla.id)}
                      data-testid={`btn-eliminar-falla-piso-${falla.id}`}
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  const renderAccionFoto = (solapaId: SolapaId, itemId: string, opcionId: string) => {
    const meta = itemsPorId.get(itemId);
    const opcion = meta?.opciones.find((o) => o.id === opcionId);
    if (!meta || !opcion || !opcion.esFalla) return null;

    const obligatoria =
      requiereFotoChecklist(opcion, 'en_uso') ||
      (opcion.esFalla && estadoActual === 'fuera_de_servicio');
    const foto = (fotosPorEquipo[equipo.maquinaId] ?? {})[claveFotoAnomalia(solapaId, itemId)];

    return (
      <div className="checklist-foto-box" data-testid={`foto-box-${itemId}`}>
        <label className="checklist-foto-btn" data-testid={`btn-adjuntar-foto-${itemId}`}>
          <span>Adjuntar Foto de Anomalía — {meta.itemEtiqueta}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only-input"
            data-testid={`input-foto-${itemId}`}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void handleAdjuntarFoto(solapaId, itemId, meta.itemEtiqueta, f);
            }}
          />
        </label>

        {obligatoria && !foto && (
          <p className="checklist-foto-aviso" data-testid={`foto-obligatoria-${itemId}`}>
            Foto obligatoria para completar esta solapa ({opcion.esFallaCritica ? 'Falla Crítica' : 'Fuera de Servicio'}).
          </p>
        )}

        {!obligatoria && !foto && (
          <p className="checklist-foto-opcional">Foto opcional para falla común.</p>
        )}

        {foto && (
          <div className="checklist-foto-preview" data-testid={`foto-preview-${itemId}`}>
            <img src={foto.dataUrl} alt={`Anomalía en ${meta.itemEtiqueta}`} />
            <div className="checklist-foto-meta">
              <strong>{foto.referenciaAgc} · {foto.solapaId}</strong>
              <span>{foto.itemEtiqueta} · {Math.max(1, Math.round(foto.sizeBytes / 1024))} KB</span>
              <time dateTime={foto.tomadaEn}>
                {new Date(foto.tomadaEn).toLocaleTimeString('es-AR')}
              </time>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleQuitarFoto(solapaId, itemId)}
              >
                Quitar foto
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="portal-inspeccion" aria-labelledby="inspeccion-titulo">
      <div className="portal-header inspeccion-header">
        <div>
          <h2 id="inspeccion-titulo" className="portal-title">
            Inspección Técnica por Solapas
          </h2>
          <p className="portal-desc">
            Edificio demo Av. Callao 450 · Selector provisorio hasta integrar inicio de visita (HU-17 RF-02).
          </p>
        </div>
        <div className="inspeccion-offline-bar">
          <span
            className={`checklist-idb-pill ${enLinea ? 'online' : 'offline'}`}
            data-testid="estado-persistencia-idb"
          >
            {enLinea ? 'En línea' : 'Sin señal (offline)'} · IndexedDB{' '}
            {ultimaSyncIdb
              ? `guardado ${new Date(ultimaSyncIdb).toLocaleTimeString('es-AR')}`
              : 'listo'}
          </span>
          {restauradaDesdeIdb && (
            <span className="checklist-restored-pill" data-testid="badge-visita-restaurada">
              Visita recuperada en {equipo.referenciaAgc} · {solapaActiva}
            </span>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleReiniciarBorrador}
            data-testid="btn-limpiar-borrador"
          >
            Limpiar borrador
          </button>
        </div>
      </div>

      {fotoError && (
        <div className="card error-banner" role="alert">
          {fotoError}
        </div>
      )}

      <div className="card inspeccion-context-bar" data-testid="inspeccion-context-bar">
        <div className="inspeccion-context-row">
          <label className="inspeccion-field">
            <span>Equipo</span>
            <select
              value={equipo.maquinaId}
              onChange={(e) => setEquipoId(e.target.value)}
              data-testid="select-equipo-inspeccion"
            >
              {EQUIPOS_DEMO.map((eq) => (
                <option key={eq.maquinaId} value={eq.maquinaId}>
                  {eq.referenciaAgc} · {eq.descripcion}
                </option>
              ))}
            </select>
          </label>

          <label className="inspeccion-field">
            <span>Tipo de equipo</span>
            <select
              value={tipoActual}
              onChange={(e) =>
                setTipoOverride((prev) => ({
                  ...prev,
                  [equipo.maquinaId]: e.target.value as TipoMaquinaChecklist,
                }))
              }
              data-testid="select-tipo-inspeccion"
            >
              <option value="traccion">Tracción</option>
              <option value="hidraulico">Hidráulico</option>
              <option value="montavehiculos">Montavehículos</option>
            </select>
          </label>

          <label className="inspeccion-field">
            <span>Estado operativo</span>
            <select
              value={estadoActual}
              onChange={(e) =>
                setEstadoPorEquipo((prev) => ({
                  ...prev,
                  [equipo.maquinaId]: e.target.value as EstadoEquipoUso,
                }))
              }
              data-testid="select-estado-inspeccion"
            >
              <option value="en_uso">En uso</option>
              <option value="fuera_de_servicio">Fuera de servicio</option>
            </select>
          </label>
        </div>
      </div>

      <ChecklistSolapaView
        config={config}
        solapaActivaId={solapaActiva}
        onCambiarSolapa={setSolapaActiva}
        respuestas={respuestasPorEquipo[equipo.maquinaId] ?? {}}
        observaciones={obsPorEquipo[equipo.maquinaId] ?? {}}
        fotos={fotosPorEquipo[equipo.maquinaId] ?? {}}
        estadoEquipo={estadoActual}
        onSeleccionarOpcion={handleSeleccionarOpcion}
        onCambiarObservacion={handleCambiarObs}
        headerSolapa={(solapa) => (
          <div className="checklist-equipos-estacion" data-testid="selector-equipos-estacion">
            <div className="checklist-equipos-bar" role="group" aria-label={`Equipos en ${solapa.nombre}`}>
              {EQUIPOS_DEMO.map((eq) => {
                const activo = eq.maquinaId === equipo.maquinaId;
                return (
                  <button
                    key={eq.maquinaId}
                    type="button"
                    className={`checklist-equipo-pill ${activo ? 'active' : ''}`}
                    onClick={() => setEquipoId(eq.maquinaId)}
                    data-testid={`btn-equipo-${eq.referenciaAgc}`}
                  >
                    <strong>{eq.referenciaAgc}</strong>
                    <span>{eq.descripcion}</span>
                    {eq.salaCompartidaNombre && (
                      <em className="checklist-sala-tag">{eq.salaCompartidaNombre}</em>
                    )}
                  </button>
                );
              })}
            </div>
            {solapa.id === 'sala_maquinas' && avisoSala && (
              <p className="checklist-sala-aviso" role="status" data-testid="aviso-sala-compartida">
                {avisoSala}
              </p>
            )}
          </div>
        )}
        extraEnSolapa={renderExtraEnSolapa}
        renderAccionItem={renderAccionFoto}
        footerSolapa={(solapa) => {
          const anterior = obtenerSolapaAnterior(config.solapas, solapa.id);
          const siguiente = obtenerSiguienteSolapa(config.solapas, solapa.id);
          return (
            <div className="checklist-estacion-nav" data-testid="estacion-nav-footer">
              {anterior && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSolapaActiva(anterior.id)}
                  data-testid="btn-estacion-anterior"
                >
                  ← Volver a {anterior.nombre}
                </button>
              )}
              {siguiente && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setSolapaActiva(siguiente.id)}
                  data-testid="btn-ir-estacion-siguiente"
                >
                  {solapa.id === 'sala_maquinas'
                    ? 'Ir a Accesos/Cabinas →'
                    : `Ir a ${siguiente.nombre} →`}
                </button>
              )}
            </div>
          );
        }}
      />
    </section>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import {
  obtenerChecklistParaTipo,
  requiereFotoChecklist,
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
import { comprimirFotoAnomalia, type FotoAnomalia } from './fotos';

interface EquipoDemo {
  maquinaId: string;
  referenciaAgc: string;
  descripcion: string;
  tipo: TipoMaquinaChecklist;
}

const EQUIPOS_DEMO: EquipoDemo[] = [
  { maquinaId: 'demo-m1', referenciaAgc: 'M1', descripcion: 'Principal Tracción', tipo: 'traccion' },
  { maquinaId: 'demo-m2', referenciaAgc: 'M2', descripcion: 'Servicio Hidráulico', tipo: 'hidraulico' },
  { maquinaId: 'demo-m3', referenciaAgc: 'M3', descripcion: 'Montavehículos', tipo: 'montavehiculos' },
];

export function InspeccionCampoView() {
  const [equipoId, setEquipoId] = useState<string>(EQUIPOS_DEMO[0].maquinaId);
  const [tipoOverride, setTipoOverride] = useState<Record<string, TipoMaquinaChecklist>>({});
  const [estadoPorEquipo, setEstadoPorEquipo] = useState<Record<string, EstadoEquipoUso>>({});
  const [solapaActiva, setSolapaActiva] = useState<SolapaId>('sala_maquinas');
  const [respuestasPorEquipo, setRespuestasPorEquipo] = useState<Record<string, RespuestasChecklist>>({});
  const [obsPorEquipo, setObsPorEquipo] = useState<Record<string, ObservacionesChecklist>>({});
  const [fotosPorEquipo, setFotosPorEquipo] = useState<Record<string, FotosPorEquipo>>({});
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, ReturnType<typeof obtenerChecklistParaTipo>>>({});

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
      const equipoPrev = prev[equipo.maquinaId] ?? {};
      const solapaPrev = equipoPrev[solapaId] ?? {};
      return {
        ...prev,
        [equipo.maquinaId]: {
          ...equipoPrev,
          [solapaId]: {
            ...solapaPrev,
            [itemId]: opcionId,
          },
        },
      };
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
        renderAccionItem={renderAccionFoto}
      />
    </section>
  );
}

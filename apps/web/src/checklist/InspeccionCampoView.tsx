import React, { useEffect, useMemo, useState } from 'react';
import {
  obtenerChecklistParaTipo,
  type EstadoEquipoUso,
  type SolapaId,
  type TipoMaquinaChecklist,
} from './checklist.config';
import {
  fetchChecklistConfig,
  type ObservacionesChecklist,
  type RespuestasChecklist,
} from './checklist.logic';
import { ChecklistSolapaView } from './ChecklistSolapaView';

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
        onSeleccionarOpcion={handleSeleccionarOpcion}
        onCambiarObservacion={handleCambiarObs}
      />
    </section>
  );
}


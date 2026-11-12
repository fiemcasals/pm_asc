import { type ChecklistSolapaConfig } from './checklist.config';
import {
  claveFotoAnomalia,
  type FotosPorEquipo,
  type RespuestasSolapa,
} from './checklist.logic';
import { claveFotoFallaPiso, type FallaPisoRegistro } from './fallasPiso';
import { type EquipoInspeccion } from './navegacion';
import {
  eliminarInformeDeCola,
  encolarInformeCritico,
  listarColaInformesCriticos,
} from './offlineStore';

export interface PayloadInformeCriticoChecklist {
  clientReportId: string;
  maquinaId: string;
  inspector: string;
  cablesDesgastados: boolean;
  limitadorAnulado: boolean;
  fallasCriticas: string[];
  observaciones: string;
  fotografias: string[];
}

export interface ResultadoDespachoCritico {
  tieneFallasCriticas: boolean;
  estado: 'sin_criticas' | 'enviado' | 'encolado';
  informeId?: string;
  eventoEmitido?: boolean;
  pendientesEnCola: number;
}

export function recolectarFallasCriticasSolapa(params: {
  solapa: ChecklistSolapaConfig;
  respuestasSolapa?: RespuestasSolapa;
  fallasPiso?: readonly FallaPisoRegistro[];
  fotos?: FotosPorEquipo;
}): {
  codigosCriticos: string[];
  descripciones: string[];
  fotografias: string[];
} {
  const { solapa, respuestasSolapa = {}, fallasPiso = [], fotos = {} } = params;
  const codigos = new Set<string>();
  const descripciones: string[] = [];
  const fotografias: string[] = [];

  for (const sub of solapa.subgrupos) {
    for (const item of sub.items) {
      const elegidaId = respuestasSolapa[item.id];
      if (!elegidaId) continue;
      const opcion = item.opciones.find((o) => o.id === elegidaId);
      if (opcion?.esFallaCritica) {
        const codigo = opcion.codigoFallaCritica ?? opcion.id.toUpperCase();
        codigos.add(codigo);
        descripciones.push(`${item.etiqueta}: ${opcion.etiqueta}`);
        const foto = fotos[claveFotoAnomalia(solapa.id, item.id)];
        if (foto?.dataUrl && fotografias.length < 10) {
          fotografias.push(foto.dataUrl);
        }
      }
    }
  }

  if (solapa.id === 'accesos') {
    for (const fp of fallasPiso) {
      if (!fp.esFallaCritica) continue;
      const codigo = fp.codigoFallaCritica ?? fp.componenteId.toUpperCase();
      codigos.add(codigo);
      descripciones.push(`Piso ${fp.piso}: ${fp.componenteEtiqueta}${fp.detalle ? ` (${fp.detalle})` : ''}`);
      const foto = fotos[claveFotoFallaPiso(fp.id)];
      if (foto?.dataUrl && fotografias.length < 10) {
        fotografias.push(foto.dataUrl);
      }
    }
  }

  return {
    codigosCriticos: [...codigos],
    descripciones,
    fotografias,
  };
}

export function construirPayloadInformeCritico(params: {
  equipo: EquipoInspeccion;
  solapa: ChecklistSolapaConfig;
  respuestasSolapa?: RespuestasSolapa;
  fallasPiso?: readonly FallaPisoRegistro[];
  fotos?: FotosPorEquipo;
  observacionSolapa?: string;
  inspector?: string;
  clientReportId?: string;
}): PayloadInformeCriticoChecklist | null {
  const rec = recolectarFallasCriticasSolapa(params);
  if (rec.codigosCriticos.length === 0) return null;

  const clientReportId =
    params.clientReportId ??
    `rep-${params.equipo.maquinaId}-${params.solapa.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const partesObs = [
    `[${params.solapa.nombre} · ${params.equipo.referenciaAgc}] ${rec.descripciones.join(' | ')}`,
    params.observacionSolapa?.trim() ? `Notas RT: ${params.observacionSolapa.trim()}` : '',
  ].filter(Boolean);

  return {
    clientReportId,
    maquinaId: params.equipo.firmanteMaquinaId ?? params.equipo.maquinaId,
    inspector: params.inspector ?? 'RT de Calle',
    cablesDesgastados: rec.codigosCriticos.includes('CABLES_DESGASTADOS'),
    limitadorAnulado: rec.codigosCriticos.includes('LIMITADOR_ANULADO'),
    fallasCriticas: rec.codigosCriticos,
    observaciones: partesObs.join(' — ').slice(0, 2000),
    fotografias: rec.fotografias,
  };
}

let syncEnCurso: Promise<{ enviados: number; pendientes: number }> | null = null;

export async function sincronizarColaFallasCriticas(
  customFactory?: IDBFactory,
  fetchFn: typeof fetch = fetch,
): Promise<{ enviados: number; pendientes: number }> {
  if (syncEnCurso) return syncEnCurso;

  syncEnCurso = (async () => {
    const pendientes = await listarColaInformesCriticos(customFactory);
    let enviados = 0;

    for (const item of pendientes) {
      try {
        const res = await fetchFn('/api/fallas-criticas/informes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          // 201 OK o error definitivo 4xx: sacar de cola para no ciclar infinitamente
          if (res.ok) enviados += 1;
          await eliminarInformeDeCola(item.clientReportId, customFactory);
        }
      } catch {
        // Sigue sin conexión: queda en IndexedDB para el próximo evento online
      }
    }

    const restantes = await listarColaInformesCriticos(customFactory);
    return { enviados, pendientes: restantes.length };
  })().finally(() => {
    syncEnCurso = null;
  });

  return syncEnCurso;
}

export async function despacharOEncolarInformeCritico(params: {
  payload: PayloadInformeCriticoChecklist;
  enLinea?: boolean;
  idbFactory?: IDBFactory;
  fetchFn?: typeof fetch;
}): Promise<ResultadoDespachoCritico> {
  const {
    payload,
    enLinea = typeof navigator !== 'undefined' ? navigator.onLine : true,
    idbFactory,
    fetchFn = fetch,
  } = params;

  if (enLinea) {
    try {
      const res = await fetchFn('/api/fallas-criticas/informes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          informe?: { id?: string };
          eventoEmitido?: boolean;
        };
        const pendientes = await listarColaInformesCriticos(idbFactory);
        return {
          tieneFallasCriticas: true,
          estado: 'enviado',
          informeId: data.informe?.id,
          eventoEmitido: Boolean(data.eventoEmitido),
          pendientesEnCola: pendientes.length,
        };
      }
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('HTTP 4')) {
        throw err;
      }
      // Error de red/5xx -> encolar en IndexedDB
    }
  }

  await encolarInformeCritico(
    {
      clientReportId: payload.clientReportId,
      payload,
      creadoEn: new Date().toISOString(),
      intentos: 0,
    },
    idbFactory,
  );
  const pendientes = await listarColaInformesCriticos(idbFactory);
  return {
    tieneFallasCriticas: true,
    estado: 'encolado',
    pendientesEnCola: pendientes.length,
  };
}

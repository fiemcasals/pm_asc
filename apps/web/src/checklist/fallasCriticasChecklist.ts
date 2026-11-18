import { fetchConSesion, leerPerfil } from '../auth/sesion';
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
  /** Por qué quedó en la cola: sin señal o servidor caído, o la sesión venció / no alcanza para registrar (HU-06 RF-06). */
  motivoEncolado?: 'sin-senal' | 'sesion';
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

type Enviar = (url: string, init?: RequestInit) => Promise<Response>;

/** El usuario con la sesión abierta en este celular (su perfil guardado), o null si no hay. */
export function usuarioDeLaSesion(): string | null {
  return leerPerfil()?.usuario ?? null;
}

/**
 * 401 (la sesión venció) y 403 (esta sesión no puede registrarlas): la falla crítica NO se descarta, queda guardada y se manda cuando
 * haya una sesión que pueda (HU-06 RF-06). Antes cualquier 4xx la sacaba de la cola.
 */
export function esErrorDeSesion(status: number): boolean {
  return status === 401 || status === 403;
}

/** Errores pasajeros (servidor caído o saturado): se reintentan. */
export function esErrorPasajero(status: number): boolean {
  return status >= 500 || status === 408 || status === 425 || status === 429;
}

let syncEnCurso: Promise<{ enviados: number; pendientes: number }> | null = null;

/**
 * Manda las fallas críticas pendientes con la sesión del usuario. Sólo manda las de quien tiene la sesión abierta (el inspector sale de la
 * sesión: si otro RT ingresara en el mismo celular, no se mandarían a su nombre). Sin sesión válida (401/403) corta y deja todo guardado.
 */
export async function sincronizarColaFallasCriticas(
  customFactory?: IDBFactory,
  fetchFn: Enviar = fetchConSesion,
  usuario: string | null = usuarioDeLaSesion(),
  usuarioVigente: () => string | null = usuarioDeLaSesion,
): Promise<{ enviados: number; pendientes: number }> {
  if (syncEnCurso) return syncEnCurso;

  syncEnCurso = (async () => {
    const todas = await listarColaInformesCriticos(customFactory);
    const pendientes = todas.filter((i) => !i.usuario || i.usuario === usuario);
    let enviados = 0;

    for (const item of pendientes) {
      if (usuarioVigente() !== usuario) break;
      try {
        const res = await fetchFn('/api/fallas-criticas/informes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          enviados += 1;
          await eliminarInformeDeCola(item.clientReportId, customFactory);
        } else if (esErrorDeSesion(res.status)) {
          break; // sin sesión que pueda registrarlas: no tiene sentido seguir, y no se pierde nada
        } else if (!esErrorPasajero(res.status)) {
          // Error definitivo (por ejemplo 400 o 404): sacar de la cola para no ciclar infinitamente
          await eliminarInformeDeCola(item.clientReportId, customFactory);
        }
      } catch {
        // Sigue sin conexión (o la sesión se revocó): queda en IndexedDB para el próximo intento
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
  fetchFn?: Enviar;
  /** Quien la carga (la sesión): queda en la cola para que sólo esa persona la mande. */
  usuario?: string | null;
}): Promise<ResultadoDespachoCritico> {
  const {
    payload,
    enLinea = typeof navigator !== 'undefined' ? navigator.onLine : true,
    idbFactory,
    fetchFn = fetchConSesion,
    usuario = usuarioDeLaSesion(),
  } = params;
  let motivoEncolado: 'sin-senal' | 'sesion' = 'sin-senal';

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
      if (esErrorDeSesion(res.status)) {
        motivoEncolado = 'sesion'; // se guarda y se manda al volver a ingresar: no se pierde
      } else if (res.status >= 400 && res.status < 500 && !esErrorPasajero(res.status)) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'SesionRevocadaError') motivoEncolado = 'sesion';
      if (err instanceof Error && err.message.startsWith('HTTP 4')) {
        throw err;
      }
      // Error de red/5xx -> encolar en IndexedDB
    }
  }

  await encolarInformeCritico(
    {
      clientReportId: payload.clientReportId,
      ...(usuario ? { usuario } : {}),
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
    motivoEncolado,
    pendientesEnCola: pendientes.length,
  };
}

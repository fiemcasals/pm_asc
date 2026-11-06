export type EstadoVisita = 'Recorrida' | 'Pendiente de Visita' | 'Advertencia';

export interface FotosObligatorias {
  cables: string;
  frente: string;
}

export interface VisitaInspeccion {
  id: string;
  fecha: string;
  inspector: string;
  estado: EstadoVisita;
  motivoAdvertencia?: string;
  fotosObligatorias?: FotosObligatorias | null;
  firmaEncargado?: string | null;
  nombreEncargado?: string | null;
  autorizada: boolean;
  fechaAutorizacion?: string | null;
  autorizadoPor?: string | null;
  protocoloAGC?: string | null;
}

export interface EdificioConsorcio {
  id: string;
  direccion: string;
  administracion: string;
  consorcio: string;
}

export interface MaquinaAsignada {
  id: string;
  codigoAGC: string;
  nombre: string;
  edificio: EdificioConsorcio;
  eca: string;
  rtCalle: string;
  firmanteId: string;
  firmanteUsername: string;
  mes: string;
  estado: EstadoVisita;
  visita: VisitaInspeccion | null;
}

export interface AutorizarFirmaResponse {
  ok: boolean;
  mensaje: string;
  maquinaId: string;
  visitaId: string;
  autorizacion: {
    autorizada: boolean;
    fechaAutorizacion: string;
    autorizadoPor: string;
    protocoloAGC: string;
  };
}

/**
 * Valida si una máquina está en condiciones técnicas y legales para ser autorizada ante AGC.
 * Criterio HU-08: Solo en estado Recorrida, con fotos obligatorias (cables, frente) y firma del encargado.
 */
export function puedeAutorizar(maquina: MaquinaAsignada): boolean {
  if (maquina.estado !== 'Recorrida' || !maquina.visita) {
    return false;
  }
  const visita = maquina.visita;
  const tieneFotos =
    Boolean(visita.fotosObligatorias?.cables?.trim()) &&
    Boolean(visita.fotosObligatorias?.frente?.trim());
  const tieneFirma = Boolean(visita.firmaEncargado?.trim());

  return tieneFotos && tieneFirma && !visita.autorizada;
}

/**
 * Devuelve el motivo exacto por el cual el botón de autorizar permanece bloqueado.
 */
export function obtenerMotivoBloqueo(maquina: MaquinaAsignada): string | null {
  if (maquina.visita?.autorizada) {
    return 'Firma digital ya autorizada ante AGC';
  }
  if (maquina.estado === 'Pendiente de Visita') {
    return 'Pendiente de Visita: el ascensor aún no ha sido recorrido por el técnico';
  }
  if (maquina.estado === 'Advertencia') {
    return `Advertencia: visita fallida o anomalía (${maquina.visita?.motivoAdvertencia || 'sin acceso'})`;
  }
  if (maquina.estado === 'Recorrida' && maquina.visita) {
    const visita = maquina.visita;
    const faltaCables = !visita.fotosObligatorias?.cables?.trim();
    const faltaFrente = !visita.fotosObligatorias?.frente?.trim();
    if (faltaCables && faltaFrente) {
      return 'Faltan fotos obligatorias de cables y frente de cabina';
    }
    if (faltaCables) {
      return 'Falta foto obligatoria de cables';
    }
    if (faltaFrente) {
      return 'Falta foto obligatoria de frente de cabina';
    }
    if (!visita.firmaEncargado?.trim()) {
      return 'Falta firma del encargado en el informe técnico';
    }
  }
  return null;
}

/**
 * Obtiene la lista de máquinas del mes asignadas al usuario firmante.
 */
export async function fetchMaquinasFirmante(
  fetchFn: typeof fetch = fetch,
  username: string = 'gonza',
  mes?: string,
): Promise<{ ok: boolean; data: MaquinaAsignada[]; error?: string }> {
  try {
    const url = mes ? `/api/firmante/maquinas?mes=${encodeURIComponent(mes)}` : '/api/firmante/maquinas';
    const res = await fetchFn(url, {
      headers: {
        'x-user-name': username,
      },
    });

    if (!res.ok) {
      return { ok: false, data: [], error: `Error ${res.status}: no se pudo cargar las máquinas` };
    }

    const data = (await res.json()) as MaquinaAsignada[];
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      data: [],
      error: err instanceof Error ? err.message : 'Error al conectar con la API',
    };
  }
}

/**
 * Ejecuta la autorización de firma AGC para una máquina auditada.
 */
export async function autorizarFirmaMaquina(
  maquinaId: string,
  fetchFn: typeof fetch = fetch,
  username: string = 'gonza',
): Promise<{ ok: boolean; data?: AutorizarFirmaResponse; error?: string }> {
  try {
    const res = await fetchFn('/api/firmante/autorizar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-name': username,
      },
      body: JSON.stringify({ maquinaId }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json.message || json.error || 'No se pudo autorizar la firma' };
    }

    return { ok: true, data: json as AutorizarFirmaResponse };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al conectar con la API',
    };
  }
}

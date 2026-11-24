import { fetchConSesion } from '../auth/sesion';
export type EstadoVisita = 'Recorrida' | 'Pendiente de Visita' | 'Advertencia';

export interface FotosObligatorias {
  /** Sólo los equipos con cables de tracción la llevan: un hidráulico no (HU-08 RF-08). */
  cables?: string | null;
  frente: string;
}

export type TipoMaquina = 'traccion' | 'hidraulico' | 'montavehiculos';

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
  /** Sin dato, se toma como de tracción. */
  tipo?: TipoMaquina;
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
 * ¿Esta máquina necesita la foto de los cables para autorizarse? Un hidráulico no tiene cables de tracción (HU-08 RF-08): sólo lleva la
 * del frente. Tracción y montavehículos, o una máquina sin tipo cargado (se toma como de tracción), llevan las dos.
 */
export function requiereFotoDeCables(maquina: Pick<MaquinaAsignada, 'tipo'>): boolean {
  return maquina.tipo !== 'hidraulico';
}

/**
 * Valida si una máquina está en condiciones técnicas y legales para ser autorizada ante AGC.
 * Criterio HU-08: Solo en estado Recorrida, con fotos obligatorias (frente, y cables si el equipo los tiene) y firma del encargado.
 */
export function puedeAutorizar(maquina: MaquinaAsignada): boolean {
  if (maquina.estado !== 'Recorrida' || !maquina.visita) {
    return false;
  }
  const visita = maquina.visita;
  const tieneFotos =
    (!requiereFotoDeCables(maquina) || Boolean(visita.fotosObligatorias?.cables?.trim())) &&
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
    const faltaCables = requiereFotoDeCables(maquina) && !visita.fotosObligatorias?.cables?.trim();
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

/** Cómo se manda un pedido a la API: con la sesión del usuario (`fetchConSesion`). Las pruebas inyectan uno propio. */
type Enviar = (url: string, init?: RequestInit) => Promise<Response>;

/** El Firmante es quien autoriza (y rechaza) la firma AGC: la Secretaría y el Administrador ven el panel en modo lectura (HU-08 RF-04). */
export function puedeFirmarComo(usuario: { rol: string }): boolean {
  return usuario.rol === 'firmante';
}

/**
 * El mensaje de una respuesta que no fue exitosa. 401 y 403 se explican (HU-08 RF-04: el panel pide sesión y cada rol hace lo suyo).
 * `soloFirmante`: la acción es del Firmante (autorizar o rechazar), así que un 403 significa que quien pide no lo es.
 */
export function mensajeDeErrorFirmante(status: number, accion: string, soloFirmante = false): string {
  if (status === 401) return 'La sesión venció: ingresá de nuevo.';
  if (status === 403) return soloFirmante ? 'Sólo el Firmante autoriza o rechaza la firma AGC.' : 'Tu usuario no tiene acceso al panel del Firmante.';
  return `Error ${status}: ${accion}`;
}

/**
 * Obtiene las máquinas del mes del Firmante de la sesión (la Secretaría y el Administrador reciben las de todos).
 */
export async function fetchMaquinasFirmante(
  fetchFn: Enviar = fetchConSesion,
  mes?: string,
): Promise<{ ok: boolean; data: MaquinaAsignada[]; error?: string }> {
  try {
    const url = mes ? `/api/firmante/maquinas?mes=${encodeURIComponent(mes)}` : '/api/firmante/maquinas';
    const res = await fetchFn(url);

    if (!res.ok) {
      return { ok: false, data: [], error: mensajeDeErrorFirmante(res.status, 'no se pudo cargar las máquinas') };
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
  fetchFn: Enviar = fetchConSesion,
): Promise<{ ok: boolean; data?: AutorizarFirmaResponse; error?: string }> {
  try {
    // La autorización queda a nombre del usuario de la sesión: el servidor lo toma de ahí.
    const res = await fetchFn('/api/firmante/autorizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinaId }),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: mensajeDeErrorFirmante(res.status, 'no se pudo autorizar la firma', true) };
    }
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

/**
 * Rechaza el informe de una máquina con el motivo obligatorio (vuelve a la Secretaría). Queda a nombre del usuario de la sesión.
 * Todavía no hay pantalla que lo use (HU-08 RF-03 sólo hizo la API); el cliente queda listo y con la sesión.
 */
export async function rechazarInformeMaquina(
  maquinaId: string,
  motivo: string,
  fetchFn: Enviar = fetchConSesion,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchFn('/api/firmante/rechazar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinaId, motivo }),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: mensajeDeErrorFirmante(res.status, 'no se pudo rechazar el informe', true) };
    }
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: json.message || 'No se pudo rechazar el informe' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al conectar con la API' };
  }
}

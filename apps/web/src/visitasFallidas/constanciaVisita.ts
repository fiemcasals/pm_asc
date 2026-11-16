import { type Ubicacion } from '../auth/ubicacion';

/** Constancia de visita fallida del RT de Calle (HU-07 RF-06): lógica de la pantalla, sin React. */

export const CAUSA_POR_DEFECTO = 'Encargado o responsable ausente';

export interface EdificioRecorrido {
  id: string;
  nombre: string;
  direccion: string;
  bloqueado: boolean;
  visitaFallidaHoy: boolean;
}

export interface CausasVisita {
  causas: string[];
  porDefecto: string;
}

export interface BorradorConstancia {
  /** Causa elegida de la lista (nunca texto libre). */
  causa: string;
  /** Foto del ingreso (data URL); sin foto no se guarda. */
  foto: string | null;
  /** GPS tomado por el celular: la persona no lo escribe ni lo edita. */
  ubicacion: Ubicacion | null;
}

type Enviar = (url: string, init?: RequestInit) => Promise<Response>;

/** La causa que arranca elegida: la de por defecto de la configuración, o la primera de la lista. */
export function causaInicial(c: CausasVisita | null): string {
  if (!c || c.causas.length === 0) return CAUSA_POR_DEFECTO;
  return c.causas.includes(c.porDefecto) ? c.porDefecto : c.causas[0];
}

/** «Guardar Advertencia de Visita» se habilita sólo con una causa de la lista, la foto del ingreso y la ubicación tomada (criterio 2). */
export function puedeGuardarAdvertencia(b: BorradorConstancia, causas: CausasVisita | null): boolean {
  const lista = causas?.causas ?? [CAUSA_POR_DEFECTO];
  return b.causa.trim() !== '' && lista.includes(b.causa) && !!b.foto && b.foto.length > 0 && b.ubicacion !== null;
}

/** El cuerpo que se manda a la API: GPS y precisión del celular, la hora del dispositivo y la causa. La hora del servidor la pone la API. */
export function cuerpoConstancia(edificioId: string, b: BorradorConstancia, ahora: Date = new Date()) {
  if (!b.ubicacion || !b.foto) throw new Error('Faltan la foto del ingreso o la ubicación');
  return {
    consorcioId: edificioId,
    causa: b.causa,
    fotoFrenteUrl: b.foto,
    gps: { latitud: b.ubicacion.latitud, longitud: b.ubicacion.longitud, precision: b.ubicacion.precision, timestamp: b.ubicacion.tomadaEn },
    horaDispositivo: ahora.toISOString(),
  };
}

export async function cargarCausas(enviar: Enviar): Promise<CausasVisita | null> {
  try {
    const res = await enviar('/api/visitas-fallidas/causas');
    if (!res.ok) return null;
    const json = (await res.json()) as CausasVisita;
    return Array.isArray(json.causas) && json.causas.length > 0 ? json : null;
  } catch {
    return null;
  }
}

/** Los edificios que el RT todavía tiene para visitar hoy (la API ya saca los bloqueados y los que tienen una visita fallida de hoy). */
export async function cargarRecorrido(enviar: Enviar): Promise<EdificioRecorrido[] | null> {
  try {
    const res = await enviar('/api/recorrido');
    if (!res.ok) return null;
    return (await res.json()) as EdificioRecorrido[];
  } catch {
    return null;
  }
}

export interface ConstanciaGuardada {
  id: string;
  numeroAdvertencia: 1 | 2 | 3;
}

/** Guarda la constancia. Si la API la rechaza (por ejemplo, ya hay una de hoy) devuelve el motivo tal cual. */
export async function enviarConstancia(
  edificioId: string,
  borrador: BorradorConstancia,
  enviar: Enviar,
  ahora: Date = new Date(),
): Promise<{ ok: true; constancia: ConstanciaGuardada } | { ok: false; error: string; yaRegistradaHoy: boolean }> {
  try {
    const res = await enviar('/api/visitas-fallidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoConstancia(edificioId, borrador, ahora)),
    });
    const json = (await res.json()) as { message?: string | string[]; errores?: string[] } & ConstanciaGuardada;
    if (!res.ok) {
      const motivo = Array.isArray(json.message) ? json.message.join(' · ') : json.message;
      return { ok: false, error: json.errores?.join(' · ') || motivo || `No se pudo guardar la constancia (error ${res.status})`, yaRegistradaHoy: res.status === 409 };
    }
    return { ok: true, constancia: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión', yaRegistradaHoy: false };
  }
}

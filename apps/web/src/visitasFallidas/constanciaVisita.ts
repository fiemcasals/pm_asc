import { CLAVE_RECORRIDO_RT, SesionRevocadaError } from '../auth/sesion';
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

// ---- La lista sin conexión (HU-07 RF-07).

/** La lista tal como se guardó en el celular la última vez que se pudo descargar, con el usuario dueño. */
export interface RecorridoGuardado {
  usuario: string;
  edificios: EdificioRecorrido[];
  /** Cuándo se descargó (ISO). */
  descargadoEn: string;
}

/**
 * Qué mostrar en «Edificios pendientes de hoy»:
 * - `servidor`: la lista recién descargada;
 * - `guardado`: sin conexión, la última lista descargada por este mismo usuario, con su hora;
 * - `sin_conexion`: sin conexión y sin una lista guardada;
 * - `error`: el servidor respondió con error (o la sesión se cortó): no se tapa con datos viejos.
 */
export type ResultadoRecorrido =
  | { tipo: 'servidor'; edificios: EdificioRecorrido[] }
  | { tipo: 'guardado'; edificios: EdificioRecorrido[]; descargadoEn: string }
  | { tipo: 'sin_conexion' }
  | { tipo: 'error' };

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const almacenDelNavegador = (): Almacen | undefined => globalThis.localStorage;

/** Guarda la lista para verla sin conexión. Si el almacenamiento está lleno o bloqueado, se sigue sin guardar. */
export function guardarRecorrido(g: RecorridoGuardado, almacen: Almacen | undefined = almacenDelNavegador()): void {
  try {
    almacen?.setItem(CLAVE_RECORRIDO_RT, JSON.stringify(g));
  } catch {
    // sin lugar para guardar: la lista sigue funcionando con conexión
  }
}

/** La última lista guardada por `usuario`, o `null` si no hay, está dañada o es de otra persona. */
export function leerRecorridoGuardado(usuario: string | null, almacen: Almacen | undefined = almacenDelNavegador()): RecorridoGuardado | null {
  if (!usuario) return null;
  try {
    const crudo = almacen?.getItem(CLAVE_RECORRIDO_RT);
    const g = (crudo ? JSON.parse(crudo) : null) as Partial<RecorridoGuardado> | null;
    const valido = g && g.usuario === usuario && Array.isArray(g.edificios) && typeof g.descargadoEn === 'string' && !Number.isNaN(Date.parse(g.descargadoEn));
    return valido ? (g as RecorridoGuardado) : null;
  } catch {
    return null;
  }
}

/**
 * Descarga la lista del RT y la guarda. Si el pedido ni siquiera llega al servidor (sin conexión), devuelve la última lista guardada por
 * ese usuario y cuándo se bajó, o `sin_conexion` si no hay. Un error del servidor o de la sesión devuelve `error`, como el Mapa del RT.
 */
export async function cargarRecorridoConRespaldo(
  enviar: Enviar,
  usuario: string | null,
  almacen: Almacen | undefined = almacenDelNavegador(),
  ahora: () => Date = () => new Date(),
): Promise<ResultadoRecorrido> {
  let res: Response;
  try {
    res = await enviar('/api/recorrido');
  } catch (err) {
    if (err instanceof SesionRevocadaError) return { tipo: 'error' };
    const g = leerRecorridoGuardado(usuario, almacen);
    return g ? { tipo: 'guardado', edificios: g.edificios, descargadoEn: g.descargadoEn } : { tipo: 'sin_conexion' };
  }
  if (!res.ok) return { tipo: 'error' };
  try {
    const edificios = (await res.json()) as EdificioRecorrido[];
    if (!Array.isArray(edificios)) return { tipo: 'error' };
    if (usuario) guardarRecorrido({ usuario, edificios, descargadoEn: ahora().toISOString() }, almacen);
    return { tipo: 'servidor', edificios };
  } catch {
    return { tipo: 'error' };
  }
}

/** Saca un edificio de la lista guardada (cuando el RT guarda su constancia), sin cambiar la hora de la descarga. */
export function sacarDelRecorridoGuardado(usuario: string | null, id: string, almacen: Almacen | undefined = almacenDelNavegador()): void {
  const g = leerRecorridoGuardado(usuario, almacen);
  if (g) guardarRecorrido({ ...g, edificios: g.edificios.filter((e) => e.id !== id) }, almacen);
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

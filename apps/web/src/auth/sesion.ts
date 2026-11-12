import type { Vista } from '../ui/command';

export type Rol = 'rt_calle' | 'secretaria' | 'firmante' | 'eca' | 'administrador';

export interface Usuario {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  /** true si es RT de Calle y todavía no aceptó el aviso vigente de uso de ubicación. */
  consentimientoUbicacionPendiente?: boolean;
}

export type ResultadoLogin =
  | { kind: 'ok'; usuario: Usuario }
  | { kind: 'error'; message: string };

export const MENSAJE_SIN_CONEXION =
  'No hay conexión con el servidor. Para el primer ingreso hace falta señal.';
export const MENSAJE_REVOCADA = 'Tu sesión fue cerrada por un Administrador. Volvé a ingresar.';

/** Clave del perfil guardado en el dispositivo. Nunca se guarda el token. */
export const CLAVE_PERFIL = 'mant_asc_sesion';

/**
 * El token de acceso vive sólo en memoria: si alguien copia el almacenamiento del celular,
 * no se lleva una credencial. Al reabrir la app se pide uno nuevo con la cookie httpOnly.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

// ---- Aviso de revocación: la app se suscribe para cerrar la sesión y mostrar el motivo.
type OyenteRevocacion = () => void;
const oyentesRevocacion = new Set<OyenteRevocacion>();

/** Se llama cuando el servidor informa que un Administrador revocó la sesión. Devuelve cómo desuscribirse. */
export function alRevocarse(oyente: OyenteRevocacion): () => void {
  oyentesRevocacion.add(oyente);
  return () => oyentesRevocacion.delete(oyente);
}

/**
 * Cierra la sesión en el dispositivo por revocación. Sólo borra el perfil y el token:
 * lo que el RT tenga pendiente de enviar queda guardado y no sale hasta un nuevo ingreso válido.
 */
function sesionRevocada(): void {
  accessToken = null;
  borrarPerfil();
  oyentesRevocacion.forEach((o) => o());
}

/** Pantalla inicial de cada rol. */
export function pantallaInicial(rol: Rol): Vista {
  switch (rol) {
    case 'rt_calle':
      return 'rt';
    case 'firmante':
      return 'firmante';
    case 'eca':
      return 'eca';
    case 'secretaria':
    case 'administrador':
      return 'secretaria';
  }
}

function esUsuario(valor: unknown): valor is Usuario {
  const v = valor as Partial<Usuario> | null;
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.usuario === 'string' &&
    typeof v.nombre === 'string' &&
    ['rt_calle', 'secretaria', 'firmante', 'eca', 'administrador'].includes(v.rol as string)
  );
}

interface CuerpoError {
  message: string;
  motivo?: string;
}

async function leerError(res: Response, porDefecto: string): Promise<CuerpoError> {
  try {
    const body = (await res.json()) as { message?: unknown; motivo?: unknown };
    const motivo = typeof body.motivo === 'string' ? body.motivo : undefined;
    if (typeof body.message === 'string') return { message: body.message, motivo };
    if (Array.isArray(body.message)) return { message: body.message.join('. '), motivo };
  } catch {
    // cuerpo vacío o no JSON
  }
  return { message: porDefecto };
}

type RespuestaSesion =
  | { kind: 'ok'; usuario: Usuario }
  | { kind: 'rechazo'; status: number; message: string; motivo?: string }
  | { kind: 'sin-red' };

async function pedirSesion(url: string, init: RequestInit): Promise<RespuestaSesion> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: 'same-origin' });
  } catch {
    return { kind: 'sin-red' };
  }
  if (!res.ok) {
    return { kind: 'rechazo', status: res.status, ...(await leerError(res, `Error ${res.status}`)) };
  }
  const body = (await res.json()) as { accessToken?: unknown; usuario?: unknown };
  if (typeof body.accessToken !== 'string' || !esUsuario(body.usuario)) {
    return { kind: 'rechazo', status: res.status, message: 'Respuesta inesperada del servidor.' };
  }
  accessToken = body.accessToken;
  return { kind: 'ok', usuario: body.usuario };
}

export async function login(usuario: string, password: string): Promise<ResultadoLogin> {
  const r = await pedirSesion('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  });
  if (r.kind === 'ok') {
    guardarPerfil(r.usuario);
    return r;
  }
  if (r.kind === 'sin-red') return { kind: 'error', message: MENSAJE_SIN_CONEXION };
  return { kind: 'error', message: r.message };
}

// ---- Renovación del token con la cookie. Cada cookie sirve una sola vez: los llamados
// simultáneos (React monta dos veces en desarrollo, o dos pedidos que vencen juntos)
// comparten el mismo pedido, si no el segundo recibiría 401 y cerraría la sesión.
let renovando: Promise<RespuestaSesion> | null = null;

function renovar(): Promise<RespuestaSesion> {
  renovando ??= pedirSesion('/api/auth/refresh', { method: 'POST' }).finally(() => {
    renovando = null;
  });
  return renovando;
}

export type SesionInicial =
  | { kind: 'conectada'; usuario: Usuario }
  | { kind: 'sin-senal'; usuario: Usuario }
  | { kind: 'revocada' }
  | { kind: 'sin-sesion' };

/**
 * Al abrir la app: si hay un perfil guardado, renueva el token con la cookie.
 * - El servidor responde: sesión conectada.
 * - No hay red (o el servidor está caído): se sigue con el perfil guardado.
 * - Un Administrador revocó la sesión: se cierra y se informa.
 * - El servidor la rechaza por otro motivo (venció): se borra el perfil y se pide ingresar.
 */
export async function restaurarSesion(): Promise<SesionInicial> {
  const perfil = leerPerfil();
  if (!perfil) return { kind: 'sin-sesion' };

  const r = await renovar();
  if (r.kind === 'ok') {
    guardarPerfil(r.usuario);
    return { kind: 'conectada', usuario: r.usuario };
  }
  if (r.kind === 'sin-red' || r.status >= 500) return { kind: 'sin-senal', usuario: perfil };

  accessToken = null;
  borrarPerfil();
  return r.motivo === 'revocada' ? { kind: 'revocada' } : { kind: 'sin-sesion' };
}

export class SesionRevocadaError extends Error {
  constructor() {
    super(MENSAJE_REVOCADA);
    this.name = 'SesionRevocadaError';
  }
}

/**
 * fetch con la sesión del usuario: agrega el token y, si venció, lo renueva una vez y reintenta.
 * Si el servidor informa que la sesión fue revocada, cierra la sesión, avisa a la app y lanza
 * SesionRevocadaError: el pedido NO se reenvía, y lo pendiente queda para después de volver a ingresar.
 */
export async function fetchConSesion(url: string, init: RequestInit = {}): Promise<Response> {
  const enviar = () => {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(url, { ...init, headers, credentials: 'same-origin' });
  };

  let res = await enviar();
  if (res.status !== 401) return res;

  const error = await leerError(res.clone(), 'Error 401');
  if (error.motivo === 'revocada') {
    sesionRevocada();
    throw new SesionRevocadaError();
  }

  const r = await renovar();
  if (r.kind === 'rechazo' && r.motivo === 'revocada') {
    sesionRevocada();
    throw new SesionRevocadaError();
  }
  if (r.kind !== 'ok') return res;
  guardarPerfil(r.usuario);

  res = await enviar();
  if (res.status === 401 && (await leerError(res.clone(), '')).motivo === 'revocada') {
    sesionRevocada();
    throw new SesionRevocadaError();
  }
  return res;
}

/** Cierra la sesión en el servidor si hay señal, y siempre en el dispositivo. */
export async function cerrarSesion(): Promise<void> {
  accessToken = null;
  borrarPerfil();
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // sin señal: la cookie vence sola; en el dispositivo ya no queda sesión
  }
}

export function leerPerfil(): Usuario | null {
  try {
    const crudo = globalThis.localStorage?.getItem(CLAVE_PERFIL);
    const perfil: unknown = crudo ? JSON.parse(crudo) : null;
    return esUsuario(perfil) ? perfil : null;
  } catch {
    return null;
  }
}

export function guardarPerfil(usuario: Usuario): void {
  try {
    globalThis.localStorage?.setItem(CLAVE_PERFIL, JSON.stringify(usuario));
  } catch {
    // almacenamiento lleno o bloqueado: la sesión sigue en memoria
  }
}

function borrarPerfil(): void {
  try {
    globalThis.localStorage?.removeItem(CLAVE_PERFIL);
  } catch {
    // nada que borrar
  }
}

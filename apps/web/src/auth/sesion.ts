import type { Vista } from '../ui/command';

export type Rol = 'rt_calle' | 'secretaria' | 'firmante' | 'eca' | 'administrador';

export interface Usuario {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
}

export type ResultadoLogin =
  | { kind: 'ok'; usuario: Usuario }
  | { kind: 'error'; message: string };

export const MENSAJE_SIN_CONEXION =
  'No hay conexión con el servidor. Para el primer ingreso hace falta señal.';

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

async function leerMensaje(res: Response, porDefecto: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message)) return body.message.join('. ');
  } catch {
    // cuerpo vacío o no JSON
  }
  return porDefecto;
}

async function pedirSesion(
  url: string,
  init: RequestInit,
): Promise<{ kind: 'ok'; usuario: Usuario } | { kind: 'rechazo'; status: number; message: string } | { kind: 'sin-red' }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: 'same-origin' });
  } catch {
    return { kind: 'sin-red' };
  }
  if (!res.ok) {
    return { kind: 'rechazo', status: res.status, message: await leerMensaje(res, `Error ${res.status}`) };
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

export type SesionInicial =
  | { kind: 'conectada'; usuario: Usuario }
  | { kind: 'sin-senal'; usuario: Usuario }
  | { kind: 'sin-sesion' };

/**
 * Al abrir la app: si hay un perfil guardado, renueva el token con la cookie.
 * - El servidor responde: sesión conectada.
 * - No hay red: se sigue con el perfil guardado (el RT puede trabajar sin señal).
 * - El servidor rechaza la sesión (venció o la revocaron): se borra el perfil y se pide ingresar.
 */
export function restaurarSesion(): Promise<SesionInicial> {
  // Cada cookie de refresco sirve una sola vez: dos pedidos simultáneos (React monta dos veces
  // en desarrollo, o dos partes de la app al mismo tiempo) harían que el segundo reciba 401 y
  // cierre la sesión. Los llamados concurrentes comparten el mismo pedido.
  restaurando ??= restaurar().finally(() => {
    restaurando = null;
  });
  return restaurando;
}

let restaurando: Promise<SesionInicial> | null = null;

async function restaurar(): Promise<SesionInicial> {
  const perfil = leerPerfil();
  if (!perfil) return { kind: 'sin-sesion' };

  const r = await pedirSesion('/api/auth/refresh', { method: 'POST' });
  if (r.kind === 'ok') {
    guardarPerfil(r.usuario);
    return { kind: 'conectada', usuario: r.usuario };
  }
  if (r.kind === 'sin-red' || r.status >= 500) return { kind: 'sin-senal', usuario: perfil };

  borrarPerfil();
  return { kind: 'sin-sesion' };
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

function guardarPerfil(usuario: Usuario): void {
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

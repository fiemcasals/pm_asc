import { fetchConSesion, type Rol } from '../auth/sesion';

/** Un usuario tal como lo devuelve la API al Administrador (nunca viaja el hash). */
export interface UsuarioAdmin {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  eca: string | null;
  email: string | null;
}

export interface FormularioUsuario {
  usuario: string;
  nombre: string;
  email: string;
  rol: Rol;
  /** Sólo para el rol "eca": la Empresa Conservadora del usuario. */
  eca: string;
  /** Vacío = se genera una al azar y la persona entra con "Olvidé mi contraseña". */
  password: string;
}

export type Resultado<T> = { kind: 'ok'; dato: T } | { kind: 'error'; message: string };

/** Nombre de cada rol en la pantalla, y lo que puede hacer. */
export const ROLES_DISPONIBLES: { rol: Rol; etiqueta: string; descripcion: string }[] = [
  { rol: 'rt_calle', etiqueta: 'RT de Calle', descripcion: 'Inspecciona en el edificio desde el celular.' },
  { rol: 'secretaria', etiqueta: 'Secretaría', descripcion: 'Carga edificios y máquinas, asigna la terna y ve el semáforo.' },
  { rol: 'firmante', etiqueta: 'Firmante AGC', descripcion: 'Audita lo que cargó el RT y firma.' },
  { rol: 'eca', etiqueta: 'ECA', descripcion: 'Mira la cobertura y las alertas de su propia empresa (sólo lectura).' },
  { rol: 'administrador', etiqueta: 'Administrador', descripcion: 'Todo lo anterior y el alta de usuarios.' },
];

export const ETIQUETA_ROL: Record<Rol, string> = {
  rt_calle: 'RT de Calle',
  secretaria: 'Secretaría',
  firmante: 'Firmante AGC',
  eca: 'ECA',
  administrador: 'Administrador',
};

/** Largo mínimo que exige la API. */
export const MIN_PASSWORD = 10;

const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Contraseña al azar para un alta en la que nadie va a anotar la contraseña: la persona
 * entra con "Olvidé mi contraseña". Usa el generador criptográfico del navegador.
 */
export function passwordAlAzar(largo = 18): string {
  const bytes = new Uint8Array(largo);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

/** Qué le falta al formulario para poder enviarse. Vacío = está listo. */
export function erroresDelFormulario(form: FormularioUsuario): string[] {
  const errores: string[] = [];
  if (!/^[A-Za-z0-9._@-]{3,100}$/.test(form.usuario.trim())) {
    errores.push('El usuario va sin espacios: letras, números, punto, guion, guion bajo o arroba (3 a 100).');
  }
  if (!form.nombre.trim()) errores.push('Falta el nombre y apellido.');
  if (form.rol === 'eca' && !form.eca.trim()) errores.push('Para el rol ECA hay que indicar la empresa.');
  if (form.password && form.password.length < MIN_PASSWORD) {
    errores.push(`La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`);
  }
  // Sin email no hay forma de que la persona reciba el enlace para elegir su contraseña.
  if (!form.password.trim() && !form.email.trim()) {
    errores.push('Poné un email, o escribí una contraseña para entregarla a mano.');
  }
  if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
    errores.push('El email no parece una dirección válida.');
  }
  return errores;
}

/** Cuerpo del POST /api/usuarios: la API rechaza "eca" en los roles que no son ECA. */
export function cuerpoNuevoUsuario(form: FormularioUsuario): Record<string, string> {
  const cuerpo: Record<string, string> = {
    usuario: form.usuario.trim(),
    nombre: form.nombre.trim(),
    rol: form.rol,
    password: form.password || passwordAlAzar(),
  };
  if (form.rol === 'eca') cuerpo.eca = form.eca.trim();
  if (form.email.trim()) cuerpo.email = form.email.trim();
  return cuerpo;
}

async function mensajeDeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message)) return body.message.join('. ');
  } catch {
    // cuerpo vacío o no JSON
  }
  return `Error ${res.status}`;
}

export async function listarUsuarios(): Promise<Resultado<UsuarioAdmin[]>> {
  try {
    const res = await fetchConSesion('/api/usuarios');
    if (!res.ok) return { kind: 'error', message: await mensajeDeError(res) };
    return { kind: 'ok', dato: (await res.json()) as UsuarioAdmin[] };
  } catch {
    return { kind: 'error', message: 'No hay conexión con el servidor.' };
  }
}

export async function crearUsuario(form: FormularioUsuario): Promise<Resultado<UsuarioAdmin>> {
  try {
    const res = await fetchConSesion('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoNuevoUsuario(form)),
    });
    if (!res.ok) return { kind: 'error', message: await mensajeDeError(res) };
    return { kind: 'ok', dato: (await res.json()) as UsuarioAdmin };
  } catch {
    return { kind: 'error', message: 'No hay conexión con el servidor.' };
  }
}

/** Corta todas las sesiones de ese usuario (celular perdido, alguien que deja la empresa). */
export async function revocarSesiones(id: string): Promise<Resultado<null>> {
  try {
    const res = await fetchConSesion(`/api/usuarios/${id}/revocar-sesiones`, { method: 'POST' });
    if (!res.ok) return { kind: 'error', message: await mensajeDeError(res) };
    return { kind: 'ok', dato: null };
  } catch {
    return { kind: 'error', message: 'No hay conexión con el servidor.' };
  }
}

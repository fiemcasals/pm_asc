/** Roles del sistema. Cada usuario tiene exactamente uno. */
export const ROLES = ['rt_calle', 'secretaria', 'firmante', 'eca', 'administrador'] as const;
export type Rol = (typeof ROLES)[number];

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

/** Usuario tal como se guarda, con el hash de la contraseña. Nunca sale por la API. */
export interface UsuarioGuardado {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  passwordHash: string;
  activo: boolean;
  /** Momento en que un Administrador revocó sus sesiones: invalida los tokens emitidos antes. */
  sesionesRevocadasEn: Date | null;
  /** ECA a la que pertenece (sólo los usuarios con rol "eca"); null para el resto. */
  eca: string | null;
  /** Teléfono y email de contacto (sólo se cargan a los RT de Calle); null si no tiene. */
  telefono: string | null;
  email: string | null;
}

/** Lo que la API muestra de un usuario. */
export interface UsuarioPublico {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  /** ECA del usuario (sólo rol "eca"); null para el resto. */
  eca: string | null;
}

export function aPublico(u: UsuarioGuardado): UsuarioPublico {
  return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, eca: u.eca };
}

/** El usuario con sus datos de contacto: sólo lo ve el Administrador, no viaja en la sesión. */
export interface UsuarioConContacto extends UsuarioPublico {
  telefono: string | null;
  email: string | null;
}

export function aConContacto(u: UsuarioGuardado): UsuarioConContacto {
  return { ...aPublico(u), telefono: u.telefono, email: u.email };
}

/** Lo que la API devuelve del usuario logueado: sus datos y lo que le falta aceptar. */
export interface UsuarioSesion extends UsuarioPublico {
  /** true si es RT de Calle y todavía no aceptó la versión vigente del aviso de ubicación. */
  consentimientoUbicacionPendiente: boolean;
}

/** Sesión de refresco: en la base sólo vive el hash SHA-256 del token, nunca el token. */
export interface Sesion {
  id: string;
  usuarioId: string;
  refreshHash: string;
  expiraEn: Date;
  /** Si un Administrador la revocó. Una sesión revocada no se borra, para poder informar el motivo. */
  revocadaEn: Date | null;
}

/** Contador de intentos fallidos por nombre de usuario (exista o no el usuario). */
export interface IntentosLogin {
  fallidos: number;
  bloqueadoHasta: Date | null;
}

/** Datos del usuario autenticado que el guard deja en la petición. */
export interface UsuarioAutenticado {
  id: string;
  usuario: string;
  rol: Rol;
  /** ECA del usuario, leída de la base en cada pedido (req.usuario.eca). */
  eca: string | null;
}

/** Fuente de la hora actual: inyectable para poder probar vencimientos sin esperar. */
export const RELOJ = Symbol('RELOJ');
export interface Reloj {
  ahora(): number;
}
export const relojDelSistema: Reloj = { ahora: () => Date.now() };

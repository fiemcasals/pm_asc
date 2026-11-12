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
}

/** Lo que la API muestra de un usuario. */
export interface UsuarioPublico {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
}

export function aPublico(u: UsuarioGuardado): UsuarioPublico {
  return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
}

/** Sesión de refresco: en la base sólo vive el hash SHA-256 del token, nunca el token. */
export interface Sesion {
  id: string;
  usuarioId: string;
  refreshHash: string;
  expiraEn: Date;
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
}

/** Fuente de la hora actual: inyectable para poder probar vencimientos sin esperar. */
export const RELOJ = Symbol('RELOJ');
export interface Reloj {
  ahora(): number;
}
export const relojDelSistema: Reloj = { ahora: () => Date.now() };

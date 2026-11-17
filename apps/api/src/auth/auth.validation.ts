import { BadRequestException } from '@nestjs/common';
import { esRol, Rol, ROLES } from './auth.types';

/** bcrypt sólo usa los primeros 72 bytes: una contraseña más larga no se acepta al crearla. */
const MAX_BYTES_PASSWORD = 72;
const MIN_PASSWORD = 10;
const MAX_ECA = 120;
const MAX_EMAIL = 200;
/** Validación deliberadamente laxa: algo@algo.algo sin espacios. La verdad la dice el mail que llega. */
const FORMATO_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function erroresDePassword(password: string): string[] {
  const errores: string[] = [];
  if (password.length < MIN_PASSWORD) errores.push(`password tiene que tener al menos ${MIN_PASSWORD} caracteres`);
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES_PASSWORD) {
    errores.push(`password no puede superar los ${MAX_BYTES_PASSWORD} bytes`);
  }
  return errores;
}

/** Quién pide el recupero: su nombre de usuario o su email. */
export function validarPedidoRecupero(body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  const usuario = typeof b.usuario === 'string' ? b.usuario.trim() : '';
  if (!usuario || usuario.length > MAX_EMAIL) {
    throw new BadRequestException('usuario es obligatorio: tu nombre de usuario o tu email.');
  }
  return usuario;
}

export function validarRestablecimiento(body: unknown): { token: string; password: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const token = typeof b.token === 'string' ? b.token.trim() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const errores = token ? [] : ['token es obligatorio'];
  errores.push(...erroresDePassword(password));
  if (errores.length > 0) throw new BadRequestException(errores);
  return { token, password };
}

export function validarLogin(body: unknown): { usuario: string; password: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.usuario !== 'string' || !b.usuario.trim() || typeof b.password !== 'string' || !b.password) {
    throw new BadRequestException('usuario y password son obligatorios.');
  }
  if (b.usuario.length > 100 || b.password.length > 200) {
    throw new BadRequestException('usuario o password demasiado largos.');
  }
  return { usuario: b.usuario.trim(), password: b.password };
}

export function validarNuevoUsuario(body: unknown): {
  usuario: string;
  nombre: string;
  rol: Rol;
  password: string;
  eca: string | null;
  email: string | null;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const errores: string[] = [];

  const usuario = typeof b.usuario === 'string' ? b.usuario.trim() : '';
  if (!/^[A-Za-z0-9._@-]{3,100}$/.test(usuario)) {
    errores.push('usuario tiene que tener entre 3 y 100 caracteres: letras, números, punto, guion, guion bajo o @');
  }
  const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '';
  if (!nombre || nombre.length > 120) errores.push('nombre es obligatorio (hasta 120 caracteres)');
  if (!esRol(b.rol)) errores.push(`rol tiene que ser uno de: ${ROLES.join(', ')}`);
  const password = typeof b.password === 'string' ? b.password : '';
  errores.push(...erroresDePassword(password));

  // El email es opcional, pero sin él la cuenta no puede recuperar la contraseña por correo.
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  if (email && (!FORMATO_EMAIL.test(email) || email.length > MAX_EMAIL)) {
    errores.push(`email tiene que ser una dirección válida de hasta ${MAX_EMAIL} caracteres`);
  }

  // La ECA identifica a la Empresa Conservadora del usuario: obligatoria para el rol "eca" y
  // prohibida para los demás (el RLS la toma de la sesión, así que no puede quedar ambigua).
  let eca: string | null = null;
  if (b.rol === 'eca') {
    const e = typeof b.eca === 'string' ? b.eca.trim() : '';
    if (!e || e.length > MAX_ECA) errores.push(`eca es obligatoria para el rol eca: el nombre de la ECA (hasta ${MAX_ECA} caracteres)`);
    else eca = e;
  } else if (b.eca !== undefined && b.eca !== null && b.eca !== '') {
    errores.push('eca sólo se admite para el rol eca');
  }

  if (errores.length > 0) throw new BadRequestException(errores);
  return { usuario, nombre, rol: b.rol as Rol, password, eca, email: email || null };
}

const MAX_TELEFONO = 50;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Teléfono y email de contacto de un RT de Calle. Los dos son opcionales y vacío o null los borra, pero el cuerpo tiene
 * que traer al menos uno de los dos campos (aunque sea null): un cuerpo vacío no borra el contacto por error.
 */
export function validarContacto(body: unknown): { telefono: string | null; email: string | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  const errores: string[] = [];
  if (b.telefono === undefined && b.email === undefined) errores.push('mandá telefono, email o los dos (null los borra)');

  const texto = (valor: unknown, campo: string, max: number): string | null => {
    if (valor === undefined || valor === null) return null;
    if (typeof valor !== 'string') {
      errores.push(`${campo} tiene que ser un texto`);
      return null;
    }
    const t = valor.trim();
    if (t.length > max) errores.push(`${campo} no puede superar los ${max} caracteres`);
    return t === '' ? null : t;
  };
  const telefono = texto(b.telefono, 'telefono', MAX_TELEFONO);
  const email = texto(b.email, 'email', MAX_EMAIL);
  if (email !== null && !EMAIL.test(email)) errores.push('email no es un email válido');

  if (errores.length > 0) throw new BadRequestException(errores);
  return { telefono, email };
}


const MAX_ZONA = 40;

/** La zona de un RT de Calle: un texto de hasta 40 caracteres; vacío o null la borra. El cuerpo tiene que traer el campo. */
export function validarZona(body: unknown): string | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.zona === undefined) throw new BadRequestException(['mandá zona (null la borra)']);
  if (b.zona === null) return null;
  if (typeof b.zona !== 'string') throw new BadRequestException(['zona tiene que ser un texto']);
  const t = b.zona.trim();
  if (t.length > MAX_ZONA) throw new BadRequestException([`zona no puede superar los ${MAX_ZONA} caracteres`]);
  return t === '' ? null : t;
}

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { esRol, Rol } from './auth.types';

/**
 * Token de acceso: JWT firmado con HS256. Es corto (15 minutos) y no se guarda en ningún lado:
 * la API lo verifica con el secreto. La única cabecera aceptada es {"alg":"HS256","typ":"JWT"},
 * así un token con "alg":"none" u otro algoritmo se rechaza siempre.
 */
export interface PayloadAcceso {
  sub: string;
  usuario: string;
  rol: Rol;
  iat: number;
  exp: number;
}

const CABECERA = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function firmar(datos: string, secreto: string): Buffer {
  return createHmac('sha256', secreto).update(datos).digest();
}

export function firmarAcceso(
  datos: { sub: string; usuario: string; rol: Rol },
  secreto: string,
  ahoraMs: number,
  duracionSeg: number,
): string {
  const iat = Math.floor(ahoraMs / 1000);
  const payload: PayloadAcceso = { ...datos, iat, exp: iat + duracionSeg };
  const cuerpo = `${CABECERA}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${cuerpo}.${firmar(cuerpo, secreto).toString('base64url')}`;
}

/** Devuelve el payload si el token es auténtico y no venció; si no, null. */
export function verificarAcceso(token: string, secreto: string, ahoraMs: number): PayloadAcceso | null {
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== CABECERA) return null;

  const esperada = firmar(`${partes[0]}.${partes[1]}`, secreto);
  const recibida = Buffer.from(partes[2], 'base64url');
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;

  let payload: Partial<PayloadAcceso>;
  try {
    payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.usuario !== 'string' ||
    !esRol(payload.rol) ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number'
  ) {
    return null;
  }
  if (Math.floor(ahoraMs / 1000) >= payload.exp) return null;
  return payload as PayloadAcceso;
}

/**
 * Token para restablecer la contraseña. No se guarda en ningún lado: firma el id del usuario,
 * el vencimiento y el hash de la contraseña vigente. Como el hash cambia al restablecer, el
 * enlace sirve una sola vez y cualquier otro enlace pedido antes queda sin efecto.
 */
export function firmarRecupero(
  usuarioId: string,
  passwordHash: string,
  secreto: string,
  ahoraMs: number,
  duracionSeg: number,
): string {
  const exp = Math.floor(ahoraMs / 1000) + duracionSeg;
  const cuerpo = Buffer.from(`${usuarioId}.${exp}`).toString('base64url');
  return `${cuerpo}.${firmar(`${cuerpo}.${passwordHash}`, secreto).toString('base64url')}`;
}

/** Lee el id y el vencimiento sin verificar la firma: hace falta para buscar el hash con el que se firmó. */
export function leerRecupero(token: string): { usuarioId: string; exp: number } | null {
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [usuarioId, exp] = Buffer.from(partes[0], 'base64url').toString('utf8').split('.');
  if (!usuarioId || !/^\d+$/.test(exp ?? '')) return null;
  return { usuarioId, exp: Number(exp) };
}

/** true si el token es auténtico para ese hash de contraseña y no venció. */
export function verificarRecupero(
  token: string,
  passwordHash: string,
  secreto: string,
  ahoraMs: number,
): boolean {
  const leido = leerRecupero(token);
  if (!leido || Math.floor(ahoraMs / 1000) >= leido.exp) return false;
  const [cuerpo, firma] = token.split('.');
  const esperada = firmar(`${cuerpo}.${passwordHash}`, secreto);
  const recibida = Buffer.from(firma, 'base64url');
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/** Token de refresco: 256 bits al azar. Al cliente va el token; a la base, sólo su hash. */
export function nuevoTokenRefresco(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefresco(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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

/** Token de refresco: 256 bits al azar. Al cliente va el token; a la base, sólo su hash. */
export function nuevoTokenRefresco(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefresco(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

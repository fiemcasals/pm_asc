import { firmarAcceso, hashRefresco, nuevoTokenRefresco, verificarAcceso } from '../src/auth/tokens';

describe('Tokens de acceso (HS256) y de refresco', () => {
  const SECRETO = 'x'.repeat(48);
  const AHORA = Date.UTC(2026, 10, 12, 12, 0, 0);
  const datos = { sub: 'u-1', usuario: 'ana', rol: 'secretaria' as const };

  it('un token firmado se verifica y trae sub, usuario y rol', () => {
    const token = firmarAcceso(datos, SECRETO, AHORA, 900);
    expect(verificarAcceso(token, SECRETO, AHORA)).toMatchObject({ ...datos, exp: AHORA / 1000 + 900 });
  });

  it('vence exactamente a los 15 minutos', () => {
    const token = firmarAcceso(datos, SECRETO, AHORA, 900);
    expect(verificarAcceso(token, SECRETO, AHORA + 899_000)).not.toBeNull();
    expect(verificarAcceso(token, SECRETO, AHORA + 900_000)).toBeNull();
  });

  it('rechaza un token firmado con otro secreto', () => {
    const token = firmarAcceso(datos, SECRETO, AHORA, 900);
    expect(verificarAcceso(token, 'y'.repeat(48), AHORA)).toBeNull();
  });

  it('rechaza un token con el payload alterado (otro rol)', () => {
    const [cab, , firma] = firmarAcceso(datos, SECRETO, AHORA, 900).split('.');
    const payload = Buffer.from(
      JSON.stringify({ ...datos, rol: 'administrador', iat: AHORA / 1000, exp: AHORA / 1000 + 900 }),
    ).toString('base64url');
    expect(verificarAcceso(`${cab}.${payload}.${firma}`, SECRETO, AHORA)).toBeNull();
  });

  it('rechaza un token con "alg":"none" y sin firma', () => {
    const cab = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ ...datos, iat: 0, exp: 9_999_999_999 })).toString('base64url');
    expect(verificarAcceso(`${cab}.${payload}.`, SECRETO, AHORA)).toBeNull();
  });

  it('rechaza basura', () => {
    expect(verificarAcceso('no-es-un-token', SECRETO, AHORA)).toBeNull();
    expect(verificarAcceso('a.b.c', SECRETO, AHORA)).toBeNull();
  });

  it('el token de refresco es aleatorio (256 bits) y en la base sólo va su hash', () => {
    const a = nuevoTokenRefresco();
    const b = nuevoTokenRefresco();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(hashRefresco(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefresco(a)).not.toContain(a);
  });
});

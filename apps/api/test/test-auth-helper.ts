import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { COSTO_BCRYPT } from '../src/auth/auth.service';
import { firmarAcceso } from '../src/auth/tokens';
import { AppConfig } from '../src/config';

if (!process.env.AUTH_JWT_SECRET || process.env.AUTH_JWT_SECRET.length < 32) {
  process.env.AUTH_JWT_SECRET = 'clave-secreta-de-prueba-para-jwt-de-al-menos-32-caracteres';
}

export async function asegurarUsuarioPrueba(
  pool: Pool,
  config: AppConfig,
  opts: { usuario?: string; rol?: 'secretaria' | 'administrador' | 'eca' | 'rt_calle' | 'firmante'; eca?: string | null } = {},
): Promise<{ token: string; usuario: string; id: string }> {
  const usuario = opts.usuario ?? 'secretaria_test';
  const rol = opts.rol ?? 'secretaria';
  const eca = opts.eca ?? null;
  const hash = await bcrypt.hash('Clave-Segura-2026', COSTO_BCRYPT);

  await pool.query('DELETE FROM usuarios WHERE lower(usuario) = lower($1)', [usuario]);
  const res = await pool.query<{ id: string }>(
    `INSERT INTO usuarios (usuario, nombre, rol, eca, password_hash)
     VALUES ($1, $1, $2, $3, $4)
     RETURNING id`,
    [usuario, rol, eca, hash],
  );
  const id = res.rows[0].id;
  const token = firmarAcceso(
    { sub: id, usuario, rol },
    config.authSecret,
    Date.now(),
    3600,
  );
  return { token, usuario, id };
}

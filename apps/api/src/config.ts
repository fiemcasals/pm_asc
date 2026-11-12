import { randomBytes } from 'node:crypto';

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Largo mínimo del secreto de firma de tokens (HS256): 32 bytes. */
const MIN_AUTH_SECRET = 32;

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  /** URL opcional del usuario de aplicación sin BYPASSRLS ni propiedad de tablas. */
  databaseAppUrl?: string;
  /** Contraseña del usuario de aplicación (`ascensores_app`) tomada de `DATABASE_APP_PASSWORD`. */
  databaseAppPassword?: string;
  /** Orígenes autorizados por CORS. Siempre vacío en producción. */
  corsOrigins: string[];
  /** Secreto con que se firman los tokens de acceso. */
  authSecret: string;
  /**
   * true si AUTH_JWT_SECRET no estaba cargado y se generó uno al azar: funciona, pero
   * las sesiones no sobreviven a un reinicio de la API.
   */
  authSecretGenerado: boolean;
  /** Primer Administrador: se crea al arrancar sólo si todavía no hay ninguno. */
  adminInicial: { usuario: string; password: string } | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  // CORS existe sólo para que el navegador de quien prueba (desde Scrum Master AI)
  // pueda leer las respuestas del entorno de desarrollo. En producción no se aplica.
  const corsOrigins = isProduction
    ? []
    : (env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

  if (corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGINS no admite "*": indicá los orígenes exactos.');
  }

  const secretoCargado = env.AUTH_JWT_SECRET?.trim() ?? '';
  if (secretoCargado && secretoCargado.length < MIN_AUTH_SECRET) {
    throw new Error(`AUTH_JWT_SECRET tiene que tener al menos ${MIN_AUTH_SECRET} caracteres.`);
  }

  const adminUsuario = env.ADMIN_INICIAL_USUARIO?.trim() ?? '';
  const adminPassword = env.ADMIN_INICIAL_PASSWORD ?? '';

  return {
    nodeEnv,
    port: Number(env.API_PORT ?? 3050),
    databaseUrl: env.DATABASE_URL ?? '',
    databaseAppUrl: env.DATABASE_APP_URL || undefined,
    databaseAppPassword: env.DATABASE_APP_PASSWORD?.trim() || undefined,
    corsOrigins,
    authSecret: secretoCargado || randomBytes(48).toString('base64url'),
    authSecretGenerado: !secretoCargado,
    adminInicial: adminUsuario && adminPassword ? { usuario: adminUsuario, password: adminPassword } : null,
  };
}

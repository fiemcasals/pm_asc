import { feriadosDeEntorno } from './horarios/feriados';
import { randomBytes } from 'node:crypto';

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Largo mínimo del secreto de firma de tokens (HS256): 32 bytes. */
const MIN_AUTH_SECRET = 32;

/** Servidor de correo saliente. Sin él, el restablecimiento de contraseña no manda nada. */
export interface SmtpConfig {
  host: string;
  puerto: number;
  usuario: string;
  clave: string;
  /** Remitente del mail ("Nombre <casilla>" o sólo la casilla). */
  desde: string;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  /**
   * Dirección en la que escucha la API. Por defecto sólo loopback (en desarrollo la web
   * corre en la misma máquina); en Docker hace falta 0.0.0.0 para que la alcance nginx.
   */
  host: string;
  /** URL pública de la app, para armar el enlace del mail de recupero. */
  appUrl: string;
  /** null si no hay SMTP configurado: el recupero avisa por log y no manda mail. */
  smtp: SmtpConfig | null;
  /** Feriados (AAAA-MM-DD) que cuentan como cerrado; null = la lista provisoria de src/horarios/feriados.ts (HU-01 RF-04). */
  feriados: string[] | null;
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
  adminInicial: { usuario: string; password: string; email: string | null } | null;
  /**
   * Días de calendario (Buenos Aires) que tienen que pasar entre dos visitas fallidas del mismo edificio. El cliente definió 1
   * (HU-07 RF-05); 0 lo desactiva. Se configura con VISITAS_FALLIDAS_MIN_DIAS.
   */
  visitasFallidasMinDias: number;
  /** Causas que el RT puede elegir al registrar una visita fallida (HU-07 RF-06); la primera es la de por defecto. */
  visitasFallidasCausas: string[];
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

  const causas = (env.VISITAS_FALLIDAS_CAUSAS ?? '').split(';').map((x) => x.trim()).filter(Boolean);
  const minDiasVisitas = env.VISITAS_FALLIDAS_MIN_DIAS === undefined || env.VISITAS_FALLIDAS_MIN_DIAS.trim() === '' ? 1 : Number(env.VISITAS_FALLIDAS_MIN_DIAS);
  if (!Number.isInteger(minDiasVisitas) || minDiasVisitas < 0) {
    throw new Error('VISITAS_FALLIDAS_MIN_DIAS tiene que ser un entero de 0 en adelante.');
  }

  const adminUsuario = env.ADMIN_INICIAL_USUARIO?.trim() ?? '';
  const adminPassword = env.ADMIN_INICIAL_PASSWORD ?? '';

  const smtpHost = env.SMTP_HOST?.trim() ?? '';
  const smtpUsuario = env.SMTP_USUARIO?.trim() ?? '';
  const smtpClave = env.SMTP_CLAVE ?? '';
  const smtp: SmtpConfig | null =
    smtpHost && smtpUsuario && smtpClave
      ? {
          host: smtpHost,
          puerto: Number(env.SMTP_PUERTO ?? 587),
          usuario: smtpUsuario,
          clave: smtpClave,
          desde: env.SMTP_DESDE?.trim() || smtpUsuario,
        }
      : null;

  return {
    nodeEnv,
    port: Number(env.API_PORT ?? 3050),
    host: env.API_HOST?.trim() || '127.0.0.1',
    appUrl: (env.APP_URL?.trim() || 'http://localhost:8050').replace(/\/+$/, ''),
    smtp,
    feriados: feriadosDeEntorno(env.FERIADOS),
    databaseUrl: env.DATABASE_URL ?? '',
    databaseAppUrl: env.DATABASE_APP_URL || undefined,
    databaseAppPassword: env.DATABASE_APP_PASSWORD?.trim() || undefined,
    corsOrigins,
    authSecret: secretoCargado || randomBytes(48).toString('base64url'),
    authSecretGenerado: !secretoCargado,
    adminInicial:
      adminUsuario && adminPassword
        ? { usuario: adminUsuario, password: adminPassword, email: env.ADMIN_INICIAL_EMAIL?.trim() || null }
        : null,
    visitasFallidasMinDias: minDiasVisitas,
    visitasFallidasCausas: causas.length > 0 ? [...new Set(causas)] : ['Encargado o responsable ausente'],
  };
}

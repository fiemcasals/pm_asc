export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  /** Orígenes autorizados por CORS. Siempre vacío en producción. */
  corsOrigins: string[];
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

  return {
    nodeEnv,
    port: Number(env.API_PORT ?? 3050),
    databaseUrl: env.DATABASE_URL ?? '',
    corsOrigins,
  };
}

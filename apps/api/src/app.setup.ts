import { INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AppConfig } from './config';
import { TextoInvalidoFilter } from './database/database-error.filter';

/**
 * Configuración común de la aplicación, usada igual por main.ts y por las pruebas.
 * - Todas las rutas cuelgan de /api.
 * - CORS sólo se habilita si hay orígenes configurados (nunca en producción: ver config.ts).
 * - Los errores de PostgreSQL por texto con codificación inválida (p. ej. el carácter NUL) salen
 *   como 400 en todos los endpoints (ver database/database-error.filter.ts).
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');

  if (config.corsOrigins.length > 0) {
    app.enableCors({
      origin: config.corsOrigins,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
  }

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new TextoInvalidoFilter(httpAdapter));

  app.enableShutdownHooks();
}

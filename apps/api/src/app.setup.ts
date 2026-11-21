import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { LIMITE_CUERPO } from './informes/informes.types';
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
  // El informe de la visita lleva fotos y la firma: el límite por defecto (100 KB) no alcanza.
  // Los avisos de Meta se firman sobre el cuerpo sin modificar: se guarda tal cual llegó, sólo para esa ruta (HU-11 RF-09).
  (app as NestExpressApplication).useBodyParser?.('json', {
    limit: LIMITE_CUERPO,
    verify: (req: { url?: string; rawBody?: Buffer }, _res: unknown, buf: Buffer) => {
      if (req.url?.includes('/whatsapp/webhook/meta')) req.rawBody = buf;
    },
  });

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

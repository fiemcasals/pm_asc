import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ECA_CONTEXTO_DEV_PRE_AUTH, runWithEcaContext } from './rls-context';

/**
 * Propaga el contexto de ECA hacia PostgreSQL RLS en cada request HTTP.
 * Mientras HU-14 RF-01 (autenticación) está en desarrollo, permite especificar la ECA vía
 * header `x-eca-actual`; si viene vacío o `'__sin_contexto__'` no fija ECA (0 filas en DB).
 */
@Injectable()
export class EcaContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const rawHeader = req.headers['x-eca-actual'];
    const headerVal = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (headerVal !== undefined) {
      const limpio = headerVal.trim();
      const eca = limpio === '' || limpio === '__sin_contexto__' ? null : limpio;
      runWithEcaContext(eca, () => next(), true);
      return;
    }

    const reqConUsuario = req as Request & { user?: { eca?: string | null } };
    if (reqConUsuario.user?.eca) {
      runWithEcaContext(reqConUsuario.user.eca, () => next(), true);
      return;
    }

    const fallback = process.env.RLS_STRICT_HTTP === 'true' ? null : ECA_CONTEXTO_DEV_PRE_AUTH;
    runWithEcaContext(fallback, () => next(), false);
  }
}

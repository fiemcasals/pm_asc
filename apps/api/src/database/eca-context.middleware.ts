import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithRlsContext } from './rls-context';

/**
 * Middleware de base: establece contexto RLS neutro por defecto.
 *
 * En cumplimiento de HU-15 RNF-03:
 * - Los headers de cliente `x-eca-actual`, `x-rol-actual` y `x-usuario-actual` se ignoran por completo.
 * - Se elimina el fallback a ECA por defecto (RLS estricto permanente).
 * - El contexto verificado real se inyecta en `RlsContextInterceptor` a partir de `req.usuario`.
 */
@Injectable()
export class EcaContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    runWithRlsContext({ eca: null, rol: null, usuario: null, esExplicito: false }, () => next());
  }
}

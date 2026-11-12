import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ECA_CONTEXTO_DEV_PRE_AUTH, RolRls, runWithRlsContext } from './rls-context';

function leerHeader(req: Request, nombre: string): string | undefined {
  const raw = req.headers[nombre];
  return Array.isArray(raw) ? raw[0] : raw;
}

function normalizarRol(valor: string | undefined): RolRls | null {
  if (!valor) return null;
  const limpio = valor.trim().toLowerCase();
  if (limpio === 'eca' || limpio === 'rt_calle' || limpio === 'firmante') return limpio;
  return null;
}

/**
 * Propaga contexto RLS (`eca`, `rol`, `usuario`) en cada request HTTP.
 * Permite `x-eca-actual`, `x-rol-actual` (`eca | rt_calle | firmante`) y `x-usuario-actual`
 * o `req.user` (HU-14 RF-01).
 */
@Injectable()
export class EcaContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const reqConUsuario = req as Request & {
      user?: { eca?: string | null; rol?: RolRls | null; usuario?: string | null; email?: string | null };
    };

    const rawEca = leerHeader(req, 'x-eca-actual');
    const rawRol = leerHeader(req, 'x-rol-actual');
    const rawUsuario = leerHeader(req, 'x-usuario-actual');

    const rol = normalizarRol(rawRol) ?? reqConUsuario.user?.rol ?? null;
    const usuario = rawUsuario?.trim() || reqConUsuario.user?.usuario || reqConUsuario.user?.email || null;

    if (rawEca !== undefined) {
      const limpio = rawEca.trim();
      const eca = limpio === '' || limpio === '__sin_contexto__' ? null : limpio;
      runWithRlsContext({ eca, rol, usuario, esExplicito: true }, () => next());
      return;
    }

    if (rol === 'rt_calle' || rol === 'firmante') {
      // RT de Calle y Firmante ven por asignación en roles_edificio entre distintas ECAs, sin fallback ECA.
      runWithRlsContext({ eca: null, rol, usuario, esExplicito: true }, () => next());
      return;
    }

    if (reqConUsuario.user?.eca) {
      runWithRlsContext({ eca: reqConUsuario.user.eca, rol, usuario, esExplicito: true }, () => next());
      return;
    }

    const fallback = process.env.RLS_STRICT_HTTP === 'true' ? null : ECA_CONTEXTO_DEV_PRE_AUTH;
    runWithRlsContext({ eca: fallback, rol, usuario, esExplicito: false }, () => next());
  }
}

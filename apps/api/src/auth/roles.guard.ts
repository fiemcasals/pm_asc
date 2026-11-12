import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Rol, UsuarioAutenticado } from './auth.types';

const ROLES_KEY = 'roles-requeridos';

/**
 * Marca una ruta como protegida.
 * - `@Roles()` sin argumentos: alcanza con tener sesión, cualquier rol.
 * - `@Roles('administrador', ...)`: sólo esos roles; el resto recibe 403.
 * Una ruta sin `@Roles` es pública.
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);

type RequestConUsuario = Request & { usuario?: UsuarioAutenticado };

/** El usuario autenticado de la petición (sólo en rutas con `@Roles`). */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioAutenticado | undefined =>
    ctx.switchToHttp().getRequest<RequestConUsuario>().usuario,
);

/** Guard global: 401 sin sesión válida, 403 con un rol distinto del requerido. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (requeridos === undefined) return true;

    const req = ctx.switchToHttp().getRequest<RequestConUsuario>();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    const usuario = tipo === 'Bearer' && token ? this.auth.verificar(token) : null;
    if (!usuario) throw new UnauthorizedException('Tenés que iniciar sesión.');

    if (requeridos.length > 0 && !requeridos.includes(usuario.rol)) {
      throw new ForbiddenException('Tu rol no tiene acceso a este recurso.');
    }
    req.usuario = usuario;
    return true;
  }
}

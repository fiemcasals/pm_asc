import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, DURACION_REFRESCO_MS, LoginBloqueadoException, ResultadoSesion } from './auth.service';
import { UsuarioAutenticado, UsuarioPublico } from './auth.types';
import { validarLogin, validarNuevoUsuario } from './auth.validation';
import { Roles, UsuarioActual } from './roles.guard';

/** Cookie del token de refresco: sólo la lee el servidor y sólo viaja a /api/auth. */
export const COOKIE_REFRESCO = 'mant_refresh';
const OPCIONES_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/auth',
};

function leerCookie(req: Request, nombre: string): string | undefined {
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const [clave, ...valor] = parte.trim().split('=');
    if (clave === nombre) return decodeURIComponent(valor.join('='));
  }
  return undefined;
}

interface RespuestaSesion {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  usuario: UsuarioPublico;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<RespuestaSesion> {
    const { usuario, password } = validarLogin(body);
    try {
      return this.responder(await this.auth.login(usuario, password), res);
    } catch (err) {
      if (err instanceof LoginBloqueadoException) res.setHeader('Retry-After', String(err.segundosRestantes));
      throw err;
    }
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<RespuestaSesion> {
    try {
      return this.responder(await this.auth.refrescar(leerCookie(req, COOKIE_REFRESCO)), res);
    } catch (err) {
      res.clearCookie(COOKIE_REFRESCO, OPCIONES_COOKIE);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.cerrarSesion(leerCookie(req, COOKIE_REFRESCO));
    res.clearCookie(COOKIE_REFRESCO, OPCIONES_COOKIE);
  }

  @Get('me')
  @Roles()
  perfil(@UsuarioActual() usuario: UsuarioAutenticado): Promise<UsuarioPublico> {
    return this.auth.perfil(usuario.id);
  }

  private responder(sesion: ResultadoSesion, res: Response): RespuestaSesion {
    res.cookie(COOKIE_REFRESCO, sesion.refreshToken, { ...OPCIONES_COOKIE, maxAge: DURACION_REFRESCO_MS });
    res.setHeader('Cache-Control', 'no-store');
    return { accessToken: sesion.accessToken, tokenType: 'Bearer', expiresIn: sesion.expiresIn, usuario: sesion.usuario };
  }
}

/** Alta de usuarios: sólo el Administrador. */
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly auth: AuthService) {}

  @Post()
  @Roles('administrador')
  crear(@Body() body: unknown): Promise<UsuarioPublico> {
    return this.auth.crearUsuario(validarNuevoUsuario(body));
  }
}

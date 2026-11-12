import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { APP_CONFIG, AppConfig } from '../config';
import { aPublico, Reloj, RELOJ, Rol, UsuarioAutenticado, UsuarioPublico } from './auth.types';
import { firmarAcceso, hashRefresco, nuevoTokenRefresco, verificarAcceso } from './tokens';
import { UsuariosRepository } from './usuarios.repository';

/** Costo de bcrypt: 2^12 rondas. */
export const COSTO_BCRYPT = 12;
/** Vida del token de acceso: 15 minutos. */
export const DURACION_ACCESO_SEG = 15 * 60;
/** Vida del token de refresco: 30 días, renovados en cada uso (el RT trabaja días sin volver a ingresar). */
export const DURACION_REFRESCO_MS = 30 * 24 * 60 * 60 * 1000;
/** Intentos fallidos seguidos antes de bloquear el login de ese usuario. */
export const MAX_INTENTOS_FALLIDOS = 5;
/** Duración del bloqueo por intentos fallidos: 15 minutos. */
export const DURACION_BLOQUEO_MS = 15 * 60 * 1000;

export const MENSAJE_CREDENCIALES = 'Usuario o contraseña incorrectos.';
export const MENSAJE_BLOQUEO = 'Demasiados intentos fallidos. Probá de nuevo en 15 minutos.';

export interface ResultadoSesion {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  usuario: UsuarioPublico;
}

/** 429 con los segundos que faltan para poder reintentar. */
export class LoginBloqueadoException extends HttpException {
  constructor(readonly segundosRestantes: number) {
    super({ statusCode: 429, message: MENSAJE_BLOQUEO }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);
  /**
   * Hash de una contraseña que nadie tiene. Cuando el usuario no existe se compara contra él,
   * para que la respuesta tarde lo mismo exista o no la cuenta.
   */
  private hashSenuelo: Promise<string> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly usuarios: UsuariosRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.crearAdminInicial();
  }

  /** Crea el primer Administrador desde ADMIN_INICIAL_*, sólo si todavía no hay ninguno. */
  private async crearAdminInicial(): Promise<void> {
    const admin = this.config.adminInicial;
    if (!admin) return;
    try {
      if ((await this.usuarios.contarPorRol('administrador')) > 0) return;
      const creado = await this.usuarios.crear({
        usuario: admin.usuario,
        nombre: 'Administrador',
        rol: 'administrador',
        passwordHash: await bcrypt.hash(admin.password, COSTO_BCRYPT),
      });
      if (creado) this.logger.log(`Administrador inicial creado: ${creado.usuario}`);
    } catch (err) {
      this.logger.error(
        `No se pudo crear el Administrador inicial: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async login(usuario: string, password: string): Promise<ResultadoSesion> {
    const ahora = this.reloj.ahora();
    const intentos = await this.usuarios.leerIntentos(usuario);
    if (intentos.bloqueadoHasta && intentos.bloqueadoHasta.getTime() > ahora) {
      throw new LoginBloqueadoException(Math.ceil((intentos.bloqueadoHasta.getTime() - ahora) / 1000));
    }

    const guardado = await this.usuarios.buscarPorUsuario(usuario);
    const hash = guardado?.activo ? guardado.passwordHash : await this.senuelo();
    const coincide = await bcrypt.compare(password, hash);

    if (!guardado || !guardado.activo || !coincide) {
      const fallidos = intentos.fallidos + 1;
      await this.usuarios.guardarIntentos(
        usuario,
        fallidos >= MAX_INTENTOS_FALLIDOS
          ? { fallidos: 0, bloqueadoHasta: new Date(ahora + DURACION_BLOQUEO_MS) }
          : { fallidos, bloqueadoHasta: null },
      );
      throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    }

    await this.usuarios.limpiarIntentos(usuario);
    return this.abrirSesion(guardado.id, ahora);
  }

  /** Canjea un token de refresco por uno nuevo y un token de acceso. El usado deja de servir. */
  async refrescar(refreshToken: string | undefined): Promise<ResultadoSesion> {
    const ahora = this.reloj.ahora();
    if (!refreshToken) throw new UnauthorizedException('No hay una sesión iniciada.');

    const sesion = await this.usuarios.buscarSesion(hashRefresco(refreshToken));
    if (!sesion || !(await this.usuarios.borrarSesion(sesion.id))) {
      throw new UnauthorizedException('La sesión no es válida. Volvé a ingresar.');
    }
    if (sesion.expiraEn.getTime() <= ahora) {
      throw new UnauthorizedException('La sesión venció. Volvé a ingresar.');
    }
    const usuario = await this.usuarios.buscarPorId(sesion.usuarioId);
    if (!usuario?.activo) throw new UnauthorizedException('La sesión no es válida. Volvé a ingresar.');

    return this.abrirSesion(usuario.id, ahora);
  }

  async cerrarSesion(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const sesion = await this.usuarios.buscarSesion(hashRefresco(refreshToken));
    if (sesion) await this.usuarios.borrarSesion(sesion.id);
  }

  /** Valida un token de acceso. Devuelve null si falta, es falso o venció. */
  verificar(accessToken: string): UsuarioAutenticado | null {
    const payload = verificarAcceso(accessToken, this.config.authSecret, this.reloj.ahora());
    return payload ? { id: payload.sub, usuario: payload.usuario, rol: payload.rol } : null;
  }

  async perfil(id: string): Promise<UsuarioPublico> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (!usuario?.activo) throw new UnauthorizedException('La sesión no es válida. Volvé a ingresar.');
    return aPublico(usuario);
  }

  async crearUsuario(datos: {
    usuario: string;
    nombre: string;
    rol: Rol;
    password: string;
  }): Promise<UsuarioPublico> {
    const creado = await this.usuarios.crear({
      usuario: datos.usuario,
      nombre: datos.nombre,
      rol: datos.rol,
      passwordHash: await bcrypt.hash(datos.password, COSTO_BCRYPT),
    });
    if (!creado) throw new ConflictException(`El usuario "${datos.usuario}" ya existe.`);
    return aPublico(creado);
  }

  private async abrirSesion(usuarioId: string, ahora: number): Promise<ResultadoSesion> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (!usuario) throw new UnauthorizedException(MENSAJE_CREDENCIALES);

    const refreshToken = nuevoTokenRefresco();
    await this.usuarios.crearSesion({
      usuarioId: usuario.id,
      refreshHash: hashRefresco(refreshToken),
      expiraEn: new Date(ahora + DURACION_REFRESCO_MS),
    });
    const accessToken = firmarAcceso(
      { sub: usuario.id, usuario: usuario.usuario, rol: usuario.rol },
      this.config.authSecret,
      ahora,
      DURACION_ACCESO_SEG,
    );
    return { accessToken, expiresIn: DURACION_ACCESO_SEG, refreshToken, usuario: aPublico(usuario) };
  }

  private senuelo(): Promise<string> {
    this.hashSenuelo ??= bcrypt.hash(`senuelo-${Math.random()}`, COSTO_BCRYPT);
    return this.hashSenuelo;
  }
}

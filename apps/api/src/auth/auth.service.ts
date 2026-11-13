import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { APP_CONFIG, AppConfig } from '../config';
import {
  aConContacto,
  aPublico,
  Reloj,
  RELOJ,
  Rol,
  UsuarioAutenticado,
  UsuarioConContacto,
  UsuarioGuardado,
  UsuarioPublico,
  UsuarioSesion,
} from './auth.types';
import { TEXTO_CONSENTIMIENTO_UBICACION, VERSION_CONSENTIMIENTO_UBICACION } from './consentimiento';
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
export const MENSAJE_REVOCADA = 'Tu sesión fue cerrada por un Administrador. Volvé a ingresar.';

/** 401 por revocación: lleva `motivo` para que la app lo distinga de un vencimiento. */
export function sesionRevocada(): UnauthorizedException {
  return new UnauthorizedException({ statusCode: 401, message: MENSAJE_REVOCADA, motivo: 'revocada' });
}

export interface ResultadoSesion {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  usuario: UsuarioSesion;
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
    // Una sesión revocada se conserva (no se borra) para poder decir por qué se cortó.
    if (sesion?.revocadaEn) throw sesionRevocada();
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

  /**
   * Valida un token de acceso Y que el usuario siga habilitado: el token dura 15 minutos sin
   * consultar la base, así que sin este control una revocación tardaría hasta 15 minutos en valer.
   * Un token emitido en el mismo segundo de la revocación, o antes, se rechaza.
   * La ECA del usuario (req.usuario.eca) sale de la base en cada pedido, no del token: cambiarla
   * vale desde el pedido siguiente, sin esperar a que el token venza.
   */
  async autenticar(accessToken: string): Promise<UsuarioAutenticado> {
    const payload = verificarAcceso(accessToken, this.config.authSecret, this.reloj.ahora());
    if (!payload) throw new UnauthorizedException('Tenés que iniciar sesión.');
    const usuario = await this.usuarios.buscarPorId(payload.sub);
    if (!usuario?.activo) throw new UnauthorizedException('Tenés que iniciar sesión.');
    const revocadas = usuario.sesionesRevocadasEn?.getTime();
    if (revocadas !== undefined && payload.iat < Math.ceil(revocadas / 1000)) throw sesionRevocada();
    return { id: usuario.id, usuario: usuario.usuario, rol: usuario.rol, eca: usuario.eca };
  }

  async perfil(id: string): Promise<UsuarioSesion> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (!usuario?.activo) throw new UnauthorizedException('La sesión no es válida. Volvé a ingresar.');
    return this.aSesion(usuario);
  }

  /** El usuario con su teléfono y email de contacto (sólo lo ve el Administrador). */
  async usuarioConContacto(id: string): Promise<UsuarioConContacto> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (!usuario) throw new NotFoundException('No existe ese usuario.');
    return aConContacto(usuario);
  }

  /**
   * Carga o edita el teléfono y el email de un RT de Calle. Al reasignarle un edificio, la terna se completa con
   * estos datos. A los demás roles no se les cargan: su contacto no se usa en ninguna terna.
   */
  async guardarContacto(id: string, contacto: { telefono: string | null; email: string | null }): Promise<UsuarioConContacto> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (!usuario) throw new NotFoundException('No existe ese usuario.');
    if (usuario.rol !== 'rt_calle') {
      throw new ConflictException('El teléfono y el email sólo se cargan a usuarios con rol rt_calle.');
    }
    const guardado = await this.usuarios.guardarContacto(id, contacto.telefono, contacto.email);
    if (!guardado) throw new NotFoundException('No existe ese usuario.');
    return aConContacto(guardado);
  }

  /** Revoca todas las sesiones del usuario: el refresco y cualquier pedido con sus tokens dan 401. */
  async revocarSesiones(usuarioId: string): Promise<void> {
    const ok = await this.usuarios.revocarSesiones(usuarioId, new Date(this.reloj.ahora()));
    if (!ok) throw new NotFoundException('No existe ese usuario.');
    this.logger.log(`Sesiones revocadas del usuario ${usuarioId}`);
  }

  textoConsentimiento(): { version: string; titulo: string; parrafos: string[] } {
    return { version: VERSION_CONSENTIMIENTO_UBICACION, ...TEXTO_CONSENTIMIENTO_UBICACION };
  }

  async aceptarConsentimiento(usuarioId: string, version: unknown): Promise<{ version: string; aceptadoEn: string }> {
    if (version !== VERSION_CONSENTIMIENTO_UBICACION) {
      throw new BadRequestException(
        `El aviso cambió: la versión vigente es ${VERSION_CONSENTIMIENTO_UBICACION}. Volvé a leerlo.`,
      );
    }
    const ahora = new Date(this.reloj.ahora());
    await this.usuarios.registrarConsentimiento(usuarioId, VERSION_CONSENTIMIENTO_UBICACION, ahora);
    return { version: VERSION_CONSENTIMIENTO_UBICACION, aceptadoEn: ahora.toISOString() };
  }

  private async aSesion(usuario: UsuarioGuardado): Promise<UsuarioSesion> {
    const pendiente =
      usuario.rol === 'rt_calle' &&
      !(await this.usuarios.tieneConsentimiento(usuario.id, VERSION_CONSENTIMIENTO_UBICACION));
    return { ...aPublico(usuario), consentimientoUbicacionPendiente: pendiente };
  }

  async crearUsuario(datos: {
    usuario: string;
    nombre: string;
    rol: Rol;
    password: string;
    eca: string | null;
  }): Promise<UsuarioPublico> {
    const creado = await this.usuarios.crear({
      usuario: datos.usuario,
      nombre: datos.nombre,
      rol: datos.rol,
      passwordHash: await bcrypt.hash(datos.password, COSTO_BCRYPT),
      eca: datos.eca,
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
    return { accessToken, expiresIn: DURACION_ACCESO_SEG, refreshToken, usuario: await this.aSesion(usuario) };
  }

  private senuelo(): Promise<string> {
    this.hashSenuelo ??= bcrypt.hash(`senuelo-${Math.random()}`, COSTO_BCRYPT);
    return this.hashSenuelo;
  }
}

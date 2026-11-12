import { randomUUID } from 'node:crypto';
import { IntentosLogin, Rol, Sesion, UsuarioGuardado } from './auth.types';

export interface NuevoUsuario {
  usuario: string;
  nombre: string;
  rol: Rol;
  passwordHash: string;
}

/**
 * Persistencia de usuarios, sesiones e intentos de login.
 * PostgreSQL en producción e integración; en memoria para las pruebas aisladas.
 * Los nombres de usuario se comparan sin distinguir mayúsculas.
 */
export abstract class UsuariosRepository {
  abstract buscarPorUsuario(usuario: string): Promise<UsuarioGuardado | null>;
  abstract buscarPorId(id: string): Promise<UsuarioGuardado | null>;
  /** Devuelve null si el nombre de usuario ya existe. */
  abstract crear(datos: NuevoUsuario): Promise<UsuarioGuardado | null>;
  abstract contarPorRol(rol: Rol): Promise<number>;

  abstract crearSesion(sesion: Omit<Sesion, 'id' | 'revocadaEn'>): Promise<Sesion>;
  abstract buscarSesion(refreshHash: string): Promise<Sesion | null>;
  /** Borra la sesión y devuelve si existía: así una rotación no se puede usar dos veces. */
  abstract borrarSesion(id: string): Promise<boolean>;

  /** Marca revocadas todas las sesiones del usuario. Devuelve false si el usuario no existe. */
  abstract revocarSesiones(usuarioId: string, ahora: Date): Promise<boolean>;

  abstract registrarConsentimiento(usuarioId: string, version: string, ahora: Date): Promise<void>;
  abstract tieneConsentimiento(usuarioId: string, version: string): Promise<boolean>;

  abstract leerIntentos(usuario: string): Promise<IntentosLogin>;
  abstract guardarIntentos(usuario: string, intentos: IntentosLogin): Promise<void>;
  abstract limpiarIntentos(usuario: string): Promise<void>;
}

const clave = (usuario: string) => usuario.trim().toLowerCase();

export class InMemoryUsuariosRepository extends UsuariosRepository {
  readonly usuarios = new Map<string, UsuarioGuardado>();
  readonly sesiones = new Map<string, Sesion>();
  readonly intentos = new Map<string, IntentosLogin>();
  readonly consentimientos = new Map<string, Date>();

  async buscarPorUsuario(usuario: string): Promise<UsuarioGuardado | null> {
    const u = [...this.usuarios.values()].find((x) => clave(x.usuario) === clave(usuario));
    return u ? { ...u } : null;
  }

  async buscarPorId(id: string): Promise<UsuarioGuardado | null> {
    const u = this.usuarios.get(id);
    return u ? { ...u } : null;
  }

  async crear(datos: NuevoUsuario): Promise<UsuarioGuardado | null> {
    if (await this.buscarPorUsuario(datos.usuario)) return null;
    const u: UsuarioGuardado = { id: randomUUID(), activo: true, sesionesRevocadasEn: null, ...datos };
    this.usuarios.set(u.id, u);
    return { ...u };
  }

  async contarPorRol(rol: Rol): Promise<number> {
    return [...this.usuarios.values()].filter((u) => u.rol === rol).length;
  }

  async crearSesion(datos: Omit<Sesion, 'id' | 'revocadaEn'>): Promise<Sesion> {
    const s: Sesion = { id: randomUUID(), revocadaEn: null, ...datos };
    this.sesiones.set(s.id, s);
    return { ...s };
  }

  async buscarSesion(refreshHash: string): Promise<Sesion | null> {
    const s = [...this.sesiones.values()].find((x) => x.refreshHash === refreshHash);
    return s ? { ...s } : null;
  }

  async borrarSesion(id: string): Promise<boolean> {
    return this.sesiones.delete(id);
  }

  async revocarSesiones(usuarioId: string, ahora: Date): Promise<boolean> {
    const u = this.usuarios.get(usuarioId);
    if (!u) return false;
    u.sesionesRevocadasEn = ahora;
    for (const s of this.sesiones.values()) {
      if (s.usuarioId === usuarioId && !s.revocadaEn) s.revocadaEn = ahora;
    }
    return true;
  }

  async registrarConsentimiento(usuarioId: string, version: string, ahora: Date): Promise<void> {
    const k = `${usuarioId}|${version}`;
    if (!this.consentimientos.has(k)) this.consentimientos.set(k, ahora);
  }

  async tieneConsentimiento(usuarioId: string, version: string): Promise<boolean> {
    return this.consentimientos.has(`${usuarioId}|${version}`);
  }

  async leerIntentos(usuario: string): Promise<IntentosLogin> {
    return { ...(this.intentos.get(clave(usuario)) ?? { fallidos: 0, bloqueadoHasta: null }) };
  }

  async guardarIntentos(usuario: string, intentos: IntentosLogin): Promise<void> {
    this.intentos.set(clave(usuario), { ...intentos });
  }

  async limpiarIntentos(usuario: string): Promise<void> {
    this.intentos.delete(clave(usuario));
  }
}

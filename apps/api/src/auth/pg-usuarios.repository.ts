import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { IntentosLogin, Rol, Sesion, UsuarioGuardado } from './auth.types';
import { NuevoUsuario, UsuariosRepository } from './usuarios.repository';

interface UsuarioRow {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  password_hash: string;
  activo: boolean;
}

interface SesionRow {
  id: string;
  usuario_id: string;
  refresh_hash: string;
  expira_en: Date;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clave = (usuario: string) => usuario.trim().toLowerCase();

const aUsuario = (r: UsuarioRow): UsuarioGuardado => ({
  id: r.id,
  usuario: r.usuario,
  nombre: r.nombre,
  rol: r.rol,
  passwordHash: r.password_hash,
  activo: r.activo,
});

const aSesion = (r: SesionRow): Sesion => ({
  id: r.id,
  usuarioId: r.usuario_id,
  refreshHash: r.refresh_hash,
  expiraEn: new Date(r.expira_en),
});

@Injectable()
export class PgUsuariosRepository extends UsuariosRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async buscarPorUsuario(usuario: string): Promise<UsuarioGuardado | null> {
    const rows = await this.db.query<UsuarioRow>(
      'SELECT id, usuario, nombre, rol, password_hash, activo FROM usuarios WHERE lower(usuario) = $1',
      [clave(usuario)],
    );
    return rows[0] ? aUsuario(rows[0]) : null;
  }

  async buscarPorId(id: string): Promise<UsuarioGuardado | null> {
    if (!ES_UUID.test(id)) return null;
    const rows = await this.db.query<UsuarioRow>(
      'SELECT id, usuario, nombre, rol, password_hash, activo FROM usuarios WHERE id = $1',
      [id],
    );
    return rows[0] ? aUsuario(rows[0]) : null;
  }

  async crear(datos: NuevoUsuario): Promise<UsuarioGuardado | null> {
    const rows = await this.db.query<UsuarioRow>(
      `INSERT INTO usuarios (usuario, nombre, rol, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (lower(usuario)) DO NOTHING
       RETURNING id, usuario, nombre, rol, password_hash, activo`,
      [datos.usuario.trim(), datos.nombre, datos.rol, datos.passwordHash],
    );
    return rows[0] ? aUsuario(rows[0]) : null;
  }

  async contarPorRol(rol: Rol): Promise<number> {
    const rows = await this.db.query<{ total: string }>(
      'SELECT count(*) AS total FROM usuarios WHERE rol = $1',
      [rol],
    );
    return Number(rows[0]?.total ?? 0);
  }

  async crearSesion(datos: Omit<Sesion, 'id'>): Promise<Sesion> {
    const rows = await this.db.query<SesionRow>(
      `INSERT INTO sesiones (usuario_id, refresh_hash, expira_en) VALUES ($1, $2, $3)
       RETURNING id, usuario_id, refresh_hash, expira_en`,
      [datos.usuarioId, datos.refreshHash, datos.expiraEn],
    );
    return aSesion(rows[0]);
  }

  async buscarSesion(refreshHash: string): Promise<Sesion | null> {
    const rows = await this.db.query<SesionRow>(
      'SELECT id, usuario_id, refresh_hash, expira_en FROM sesiones WHERE refresh_hash = $1',
      [refreshHash],
    );
    return rows[0] ? aSesion(rows[0]) : null;
  }

  async borrarSesion(id: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      'DELETE FROM sesiones WHERE id = $1 RETURNING id',
      [id],
    );
    return rows.length > 0;
  }

  async leerIntentos(usuario: string): Promise<IntentosLogin> {
    const rows = await this.db.query<{ fallidos: number; bloqueado_hasta: Date | null }>(
      'SELECT fallidos, bloqueado_hasta FROM intentos_login WHERE usuario = $1',
      [clave(usuario)],
    );
    const r = rows[0];
    return r
      ? { fallidos: Number(r.fallidos), bloqueadoHasta: r.bloqueado_hasta ? new Date(r.bloqueado_hasta) : null }
      : { fallidos: 0, bloqueadoHasta: null };
  }

  async guardarIntentos(usuario: string, intentos: IntentosLogin): Promise<void> {
    await this.db.query(
      `INSERT INTO intentos_login (usuario, fallidos, bloqueado_hasta) VALUES ($1, $2, $3)
       ON CONFLICT (usuario) DO UPDATE SET fallidos = EXCLUDED.fallidos, bloqueado_hasta = EXCLUDED.bloqueado_hasta`,
      [clave(usuario), intentos.fallidos, intentos.bloqueadoHasta],
    );
  }

  async limpiarIntentos(usuario: string): Promise<void> {
    await this.db.query('DELETE FROM intentos_login WHERE usuario = $1', [clave(usuario)]);
  }
}

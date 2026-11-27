import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Rol } from '../auth/auth.types';
import { ContactoChat, CrearMensajeDto, MensajeChat, TipoSala } from './chat.types';

/**
 * Los roles que usan el chat y, por eso mismo, los que pueden figurar como contacto de un chat privado
 * (la ECA queda afuera: el chat es interno). HU-19 RF-03: la Secretaría estaba autorizada a escribir pero
 * no figuraba en la lista de nadie, así que sus privados no se podían leer ni responder.
 */
export const ROLES_DEL_CHAT: readonly Rol[] = ['rt_calle', 'firmante', 'administrador', 'secretaria'];

export abstract class ChatRepository {
  abstract guardarMensaje(emisorId: string, dto: CrearMensajeDto): Promise<MensajeChat>;
  abstract listarMensajes(sala: string, usuarioId: string): Promise<MensajeChat[]>;
  abstract listarContactos(usuarioId: string): Promise<ContactoChat[]>;
  abstract obtenerUltimoMensaje(sala: string, usuarioId: string): Promise<{ contenido: string; creadoEn: string } | null>;
}

interface FilaMensaje {
  id: string;
  emisor_id: string;
  emisor_nombre: string;
  emisor_usuario: string;
  emisor_rol: string;
  destinatario_id: string | null;
  destinatario_nombre: string | null;
  destinatario_usuario: string | null;
  tipo_sala: string;
  contenido: string;
  adjunto_url: string | null;
  consorcio_id: string | null;
  edificio_nombre: string | null;
  maquina_ref: string | null;
  creado_en: Date;
}

@Injectable()
export class PgChatRepository extends ChatRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async guardarMensaje(emisorId: string, dto: CrearMensajeDto): Promise<MensajeChat> {
    const destId = dto.tipoSala === 'directo' && dto.destinatarioId ? dto.destinatarioId : null;
    const consorcioId = dto.consorcioId || null;
    const maquinaRef = dto.maquinaRef || null;
    const adjuntoUrl = dto.adjuntoUrl || null;

    const filas = await this.db.query<{ id: string; creado_en: Date }>(
      `INSERT INTO chat_mensajes (emisor_id, destinatario_id, tipo_sala, contenido, adjunto_url, consorcio_id, maquina_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, creado_en`,
      [emisorId, destId, dto.tipoSala, dto.contenido, adjuntoUrl, consorcioId, maquinaRef],
    );

    const guardado = filas[0];
    const mensajesCompletos = await this.db.query<FilaMensaje>(
      `SELECT m.id, m.emisor_id, u.nombre AS emisor_nombre, u.usuario AS emisor_usuario, u.rol AS emisor_rol,
              m.destinatario_id, ud.nombre AS destinatario_nombre, ud.usuario AS destinatario_usuario,
              m.tipo_sala, m.contenido, m.adjunto_url, m.consorcio_id, c.nombre AS edificio_nombre,
              m.maquina_ref, m.creado_en
         FROM chat_mensajes m
         JOIN usuarios u ON u.id = m.emisor_id
         LEFT JOIN usuarios ud ON ud.id = m.destinatario_id
         LEFT JOIN consorcios c ON c.id = m.consorcio_id
        WHERE m.id = $1`,
      [guardado.id],
    );

    return this.mapearMensaje(mensajesCompletos[0]);
  }

  async listarMensajes(sala: string, usuarioId: string): Promise<MensajeChat[]> {
    let filas: FilaMensaje[];

    if (sala === 'global') {
      filas = await this.db.query<FilaMensaje>(
        `SELECT m.id, m.emisor_id, u.nombre AS emisor_nombre, u.usuario AS emisor_usuario, u.rol AS emisor_rol,
                m.destinatario_id, ud.nombre AS destinatario_nombre, ud.usuario AS destinatario_usuario,
                m.tipo_sala, m.contenido, m.adjunto_url, m.consorcio_id, c.nombre AS edificio_nombre,
                m.maquina_ref, m.creado_en
           FROM chat_mensajes m
           JOIN usuarios u ON u.id = m.emisor_id
           LEFT JOIN usuarios ud ON ud.id = m.destinatario_id
           LEFT JOIN consorcios c ON c.id = m.consorcio_id
          WHERE m.tipo_sala = 'global'
          ORDER BY m.creado_en ASC
          LIMIT 200`,
      );
    } else {
      filas = await this.db.query<FilaMensaje>(
        `SELECT m.id, m.emisor_id, u.nombre AS emisor_nombre, u.usuario AS emisor_usuario, u.rol AS emisor_rol,
                m.destinatario_id, ud.nombre AS destinatario_nombre, ud.usuario AS destinatario_usuario,
                m.tipo_sala, m.contenido, m.adjunto_url, m.consorcio_id, c.nombre AS edificio_nombre,
                m.maquina_ref, m.creado_en
           FROM chat_mensajes m
           JOIN usuarios u ON u.id = m.emisor_id
           LEFT JOIN usuarios ud ON ud.id = m.destinatario_id
           LEFT JOIN consorcios c ON c.id = m.consorcio_id
          WHERE m.tipo_sala = 'directo'
            AND ((m.emisor_id = $1 AND m.destinatario_id = $2) OR (m.emisor_id = $2 AND m.destinatario_id = $1))
          ORDER BY m.creado_en ASC
          LIMIT 200`,
        [usuarioId, sala],
      );
    }

    return filas.map((f) => this.mapearMensaje(f));
  }

  async listarContactos(usuarioId: string): Promise<ContactoChat[]> {
    const filas = await this.db.query<{ id: string; usuario: string; nombre: string; rol: string }>(
      `SELECT id, usuario, nombre, rol
         FROM usuarios
        WHERE activo = true
          AND rol IN (${ROLES_DEL_CHAT.map((r) => `'${r}'`).join(', ')})
          AND id <> $1
        ORDER BY CASE rol WHEN 'firmante' THEN 1 WHEN 'secretaria' THEN 2 WHEN 'rt_calle' THEN 3 ELSE 4 END, nombre ASC`,
      [usuarioId],
    );

    return filas.map((f) => ({
      id: f.id,
      usuario: f.usuario,
      nombre: f.nombre,
      rol: f.rol as Rol,
    }));
  }

  async obtenerUltimoMensaje(sala: string, usuarioId: string): Promise<{ contenido: string; creadoEn: string } | null> {
    let filas: Array<{ contenido: string; creado_en: Date }>;
    if (sala === 'global') {
      filas = await this.db.query<{ contenido: string; creado_en: Date }>(
        `SELECT contenido, creado_en FROM chat_mensajes WHERE tipo_sala = 'global' ORDER BY creado_en DESC LIMIT 1`,
      );
    } else {
      filas = await this.db.query<{ contenido: string; creado_en: Date }>(
        `SELECT contenido, creado_en FROM chat_mensajes
          WHERE tipo_sala = 'directo'
            AND ((emisor_id = $1 AND destinatario_id = $2) OR (emisor_id = $2 AND destinatario_id = $1))
          ORDER BY creado_en DESC LIMIT 1`,
        [usuarioId, sala],
      );
    }

    if (filas.length === 0) return null;
    return {
      contenido: filas[0].contenido,
      creadoEn: filas[0].creado_en.toISOString(),
    };
  }

  private mapearMensaje(f: FilaMensaje): MensajeChat {
    return {
      id: f.id,
      emisorId: f.emisor_id,
      emisorNombre: f.emisor_nombre,
      emisorUsuario: f.emisor_usuario,
      emisorRol: f.emisor_rol as Rol,
      destinatarioId: f.destinatario_id,
      destinatarioNombre: f.destinatario_nombre,
      destinatarioUsuario: f.destinatario_usuario,
      tipoSala: f.tipo_sala as TipoSala,
      contenido: f.contenido,
      adjuntoUrl: f.adjunto_url,
      consorcioId: f.consorcio_id,
      edificioNombre: f.edificio_nombre,
      maquinaRef: f.maquina_ref,
      creadoEn: f.creado_en instanceof Date ? f.creado_en.toISOString() : String(f.creado_en),
    };
  }
}

/** Implementación en memoria para pruebas unitarias */
export class InMemoryChatRepository extends ChatRepository {
  private mensajes: MensajeChat[] = [];
  private contactos: ContactoChat[] = [
    { id: 'usr-rt-1', usuario: 'rt1', nombre: 'Operario RT 1', rol: 'rt_calle' },
    { id: 'usr-firmante-1', usuario: 'firmante1', nombre: 'Ing. Firmante Legal', rol: 'firmante' },
    { id: 'usr-admin-1', usuario: 'admin', nombre: 'Administrador del Sistema', rol: 'administrador' },
    { id: 'usr-secretaria-1', usuario: 'secretaria', nombre: 'Secretaría', rol: 'secretaria' },
  ];

  setContactos(c: ContactoChat[]) {
    this.contactos = c;
  }

  async guardarMensaje(emisorId: string, dto: CrearMensajeDto): Promise<MensajeChat> {
    const id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const nuevo: MensajeChat = {
      id,
      emisorId,
      emisorNombre: 'Usuario Prueba',
      emisorUsuario: 'prueba',
      emisorRol: 'rt_calle',
      destinatarioId: dto.tipoSala === 'directo' ? dto.destinatarioId ?? null : null,
      destinatarioNombre: null,
      destinatarioUsuario: null,
      tipoSala: dto.tipoSala,
      contenido: dto.contenido,
      adjuntoUrl: dto.adjuntoUrl ?? null,
      consorcioId: dto.consorcioId ?? null,
      edificioNombre: null,
      maquinaRef: dto.maquinaRef ?? null,
      creadoEn: new Date().toISOString(),
    };
    this.mensajes.push(nuevo);
    return nuevo;
  }

  async listarMensajes(sala: string, usuarioId: string): Promise<MensajeChat[]> {
    if (sala === 'global') {
      return this.mensajes.filter((m) => m.tipoSala === 'global');
    }
    return this.mensajes.filter(
      (m) =>
        m.tipoSala === 'directo' &&
        ((m.emisorId === usuarioId && m.destinatarioId === sala) ||
          (m.emisorId === sala && m.destinatarioId === usuarioId)),
    );
  }

  async listarContactos(usuarioId: string): Promise<ContactoChat[]> {
    return this.contactos.filter((c) => c.id !== usuarioId);
  }

  async obtenerUltimoMensaje(sala: string, usuarioId: string): Promise<{ contenido: string; creadoEn: string } | null> {
    const lista = await this.listarMensajes(sala, usuarioId);
    if (lista.length === 0) return null;
    const ult = lista[lista.length - 1];
    return { contenido: ult.contenido, creadoEn: ult.creadoEn };
  }
}

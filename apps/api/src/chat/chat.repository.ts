import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Rol } from '../auth/auth.types';
import { randomUUID } from 'node:crypto';
import { ContactoChat, CrearMensajeDto, LIMITE_HILO, MensajeChat, NoLeidosPorSala, OpcionesHilo, PaginaMensajes, ResumenMensajeNoLeido, TipoSala } from './chat.types';

/**
 * Los roles que usan el chat y, por eso mismo, los que pueden figurar como contacto de un chat privado
 * (la ECA queda afuera: el chat es interno). HU-19 RF-03: la Secretaría estaba autorizada a escribir pero
 * no figuraba en la lista de nadie, así que sus privados no se podían leer ni responder.
 */
export const ROLES_DEL_CHAT: readonly Rol[] = ['rt_calle', 'firmante', 'administrador', 'secretaria'];

const ROLES_SQL = ROLES_DEL_CHAT.map((r) => `'${r}'`).join(', ');

export abstract class ChatRepository {
  abstract guardarMensaje(emisorId: string, dto: CrearMensajeDto): Promise<MensajeChat>;
  abstract listarMensajes(sala: string, usuarioId: string, opciones?: OpcionesHilo): Promise<PaginaMensajes>;
  abstract listarContactos(usuarioId: string): Promise<ContactoChat[]>;
  /** Los mensajes de otros que el usuario no leyó, por conversación («global» o el id del compañero). Solo cuenta el grupo y los privados dirigidos a él. */
  abstract contarNoLeidos(usuarioId: string): Promise<NoLeidosPorSala>;
  /** El último mensaje que le escribió otra persona al usuario en esa conversación (el del grupo o el del privado), sin la foto. Para avisar de lo que llega. */
  abstract ultimoDeOtros(usuarioId: string, sala: string): Promise<ResumenMensajeNoLeido | null>;
  /**
   * Marca la conversación como leída hasta ese mensaje (nunca hacia atrás). Devuelve false si el mensaje no es de esa conversación
   * (para el grupo, cualquier mensaje del grupo; para un privado, uno entre el usuario y ese compañero).
   */
  abstract marcarLeido(usuarioId: string, sala: string, mensajeId: string): Promise<boolean>;
  /** ¿El destinatario existe, está activo, es de un rol del chat y no es el propio usuario? (HU-19 RF-04) */
  abstract esContacto(usuarioId: string, destinatarioId: string): Promise<boolean>;
  /** ¿Existe el edificio, para quien lo pide? Con el RLS, un Técnico o un Firmante solo ve los que tiene asignados. (HU-19 RF-04) */
  abstract existeConsorcio(consorcioId: string): Promise<boolean>;
  /** El nombre del edificio, para quien lo pide (con el RLS: un Técnico o un Firmante, solo de los que tiene asignados); null si no lo ve. HU-19 RF-07. */
  abstract nombreDeConsorcio(consorcioId: string): Promise<string | null>;
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

    // HU-19 RF-07: el nombre del edificio se guarda con el mensaje, para que la etiqueta la vean todos los que lo leen
    const filas = await this.db.query<{ id: string; creado_en: Date }>(
      `INSERT INTO chat_mensajes (emisor_id, destinatario_id, tipo_sala, contenido, adjunto_url, consorcio_id, maquina_ref, edificio_nombre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, creado_en`,
      [emisorId, destId, dto.tipoSala, dto.contenido, adjuntoUrl, consorcioId, maquinaRef, consorcioId ? dto.edificioNombre ?? null : null],
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
         LEFT JOIN LATERAL (SELECT COALESCE(m.edificio_nombre, (SELECT cc.nombre FROM consorcios cc WHERE cc.id = m.consorcio_id)) AS nombre) c ON true
        WHERE m.id = $1`,
      [guardado.id],
    );

    return this.mapearMensaje(mensajesCompletos[0]);
  }

  /**
   * Un tramo del hilo de una conversación: los `limite` mensajes MÁS NUEVOS (o, con `antes`, los que preceden a ese mensaje), de más
   * viejo a más nuevo. Se ordena por (fecha, id) para que mensajes de la misma fecha tengan siempre el mismo lugar. HU-19 RF-02: antes
   * traía los 200 más VIEJOS, y al pasar los 200 el hilo dejaba de mostrar los mensajes nuevos.
   */
  async listarMensajes(sala: string, usuarioId: string, opciones: OpcionesHilo = {}): Promise<PaginaMensajes> {
    const limite = Math.min(Math.max(Math.trunc(opciones.limite ?? LIMITE_HILO), 1), LIMITE_HILO);
    const params: unknown[] = [];
    let donde: string;
    if (sala === 'global') {
      donde = `m.tipo_sala = 'global'`;
    } else {
      params.push(usuarioId, sala);
      donde = `m.tipo_sala = 'directo'
            AND ((m.emisor_id = $1 AND m.destinatario_id = $2) OR (m.emisor_id = $2 AND m.destinatario_id = $1))`;
    }
    if (opciones.antes) {
      params.push(opciones.antes);
      donde += `
            AND (m.creado_en, m.id) < (SELECT a.creado_en, a.id FROM chat_mensajes a WHERE a.id = $${params.length})`;
    }
    params.push(limite + 1); // uno de más: si vuelve, hay anteriores
    const filas = await this.db.query<FilaMensaje>(
      `SELECT m.id, m.emisor_id, u.nombre AS emisor_nombre, u.usuario AS emisor_usuario, u.rol AS emisor_rol,
              m.destinatario_id, ud.nombre AS destinatario_nombre, ud.usuario AS destinatario_usuario,
              m.tipo_sala, m.contenido, m.adjunto_url, m.consorcio_id, c.nombre AS edificio_nombre,
              m.maquina_ref, m.creado_en
         FROM chat_mensajes m
         JOIN usuarios u ON u.id = m.emisor_id
         LEFT JOIN usuarios ud ON ud.id = m.destinatario_id
         LEFT JOIN LATERAL (SELECT COALESCE(m.edificio_nombre, (SELECT cc.nombre FROM consorcios cc WHERE cc.id = m.consorcio_id)) AS nombre) c ON true
        WHERE ${donde}
        ORDER BY m.creado_en DESC, m.id DESC
        LIMIT $${params.length}`,
      params,
    );

    return {
      mensajes: filas.slice(0, limite).reverse().map((f) => this.mapearMensaje(f)),
      hayAnteriores: filas.length > limite,
    };
  }

  async listarContactos(usuarioId: string): Promise<ContactoChat[]> {
    const filas = await this.db.query<{ id: string; usuario: string; nombre: string; rol: string }>(
      `SELECT id, usuario, nombre, rol
         FROM usuarios
        WHERE activo = true
          AND rol IN (${ROLES_SQL})
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

  async contarNoLeidos(usuarioId: string): Promise<NoLeidosPorSala> {
    // Del grupo: los de otros posteriores a lo leído; sin lectura, los posteriores a la fecha en que se creó el usuario (no se le acumula lo anterior a que existiera).
    const grupo = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM chat_mensajes m
         JOIN usuarios u ON u.id = $1
         LEFT JOIN chat_lecturas l ON l.usuario_id = $1 AND l.sala = 'global'
        WHERE m.tipo_sala = 'global' AND m.emisor_id <> $1
          AND (m.creado_en, m.id) > (COALESCE(l.leido_en, u.created_at), COALESCE(l.leido_id, '00000000-0000-0000-0000-000000000000'::uuid))`,
      [usuarioId],
    );
    // De cada privado: solo los que le escribió el compañero a este usuario, posteriores a lo leído.
    const privados = await this.db.query<{ sala: string; n: number }>(
      `SELECT m.emisor_id::text AS sala, count(*)::int AS n
         FROM chat_mensajes m
         LEFT JOIN chat_lecturas l ON l.usuario_id = $1 AND l.sala = m.emisor_id::text
        WHERE m.tipo_sala = 'directo' AND m.destinatario_id = $1
          AND (m.creado_en, m.id) > (COALESCE(l.leido_en, '-infinity'::timestamptz), COALESCE(l.leido_id, '00000000-0000-0000-0000-000000000000'::uuid))
        GROUP BY m.emisor_id`,
      [usuarioId],
    );
    const resultado: NoLeidosPorSala = {};
    if ((grupo[0]?.n ?? 0) > 0) resultado.global = grupo[0].n;
    for (const p of privados) resultado[p.sala] = p.n;
    return resultado;
  }

  async ultimoDeOtros(usuarioId: string, sala: string): Promise<ResumenMensajeNoLeido | null> {
    const deLaSala = sala === 'global' ? `m.tipo_sala = 'global' AND m.emisor_id <> $1` : `m.tipo_sala = 'directo' AND m.emisor_id = $2::uuid AND m.destinatario_id = $1`;
    const filas = await this.db.query<{ id: string; emisor_nombre: string; contenido: string; con_foto: boolean; creado_en: Date }>(
      `SELECT m.id, u.nombre AS emisor_nombre, left(m.contenido, 200) AS contenido, (m.adjunto_url IS NOT NULL) AS con_foto, m.creado_en
         FROM chat_mensajes m
         JOIN usuarios u ON u.id = m.emisor_id
        WHERE ${deLaSala}
        ORDER BY m.creado_en DESC, m.id DESC
        LIMIT 1`,
      sala === 'global' ? [usuarioId] : [usuarioId, sala],
    );
    if (filas.length === 0) return null;
    const f = filas[0];
    return { id: f.id, emisorNombre: f.emisor_nombre, contenido: f.contenido, conFoto: f.con_foto, creadoEn: f.creado_en instanceof Date ? f.creado_en.toISOString() : String(f.creado_en) };
  }

  async marcarLeido(usuarioId: string, sala: string, mensajeId: string): Promise<boolean> {
    // El mensaje tiene que ser de esa conversación; la lectura solo avanza (si ya se había leído más adelante, no se toca).
    const donde =
      sala === 'global'
        ? `m.tipo_sala = 'global'`
        : `m.tipo_sala = 'directo' AND ((m.emisor_id = $2::uuid AND m.destinatario_id = $3::uuid) OR (m.emisor_id = $3::uuid AND m.destinatario_id = $2::uuid))`;
    const filas = await this.db.query<{ existe: number }>(
      `WITH msg AS (SELECT m.id, m.creado_en FROM chat_mensajes m WHERE m.id = $1::uuid AND ${donde}),
            avance AS (
              INSERT INTO chat_lecturas (usuario_id, sala, leido_en, leido_id)
              SELECT $2::uuid, $3::text, msg.creado_en, msg.id FROM msg
              ON CONFLICT (usuario_id, sala) DO UPDATE SET leido_en = EXCLUDED.leido_en, leido_id = EXCLUDED.leido_id
               WHERE (chat_lecturas.leido_en, chat_lecturas.leido_id) < (EXCLUDED.leido_en, EXCLUDED.leido_id)
              RETURNING 1)
       SELECT count(*)::int AS existe FROM msg`,
      [mensajeId, usuarioId, sala],
    );
    return (filas[0]?.existe ?? 0) > 0;
  }

  async esContacto(usuarioId: string, destinatarioId: string): Promise<boolean> {
    const filas = await this.db.query<{ uno: number }>(
      `SELECT 1 AS uno FROM usuarios WHERE id = $1 AND id <> $2 AND activo = true AND rol IN (${ROLES_SQL})`,
      [destinatarioId, usuarioId],
    );
    return filas.length > 0;
  }

  async existeConsorcio(consorcioId: string): Promise<boolean> {
    const filas = await this.db.query<{ uno: number }>('SELECT 1 AS uno FROM consorcios WHERE id = $1', [consorcioId]);
    return filas.length > 0;
  }

  async nombreDeConsorcio(consorcioId: string): Promise<string | null> {
    const filas = await this.db.query<{ nombre: string }>('SELECT nombre FROM consorcios WHERE id = $1', [consorcioId]);
    return filas[0]?.nombre ?? null;
  }

  async obtenerUltimoMensaje(sala: string, usuarioId: string): Promise<{ contenido: string; creadoEn: string } | null> {
    let filas: Array<{ contenido: string; creado_en: Date }>;
    if (sala === 'global') {
      filas = await this.db.query<{ contenido: string; creado_en: Date }>(
        `SELECT contenido, creado_en FROM chat_mensajes WHERE tipo_sala = 'global' ORDER BY creado_en DESC, id DESC LIMIT 1`,
      );
    } else {
      filas = await this.db.query<{ contenido: string; creado_en: Date }>(
        `SELECT contenido, creado_en FROM chat_mensajes
          WHERE tipo_sala = 'directo'
            AND ((emisor_id = $1 AND destinatario_id = $2) OR (emisor_id = $2 AND destinatario_id = $1))
          ORDER BY creado_en DESC, id DESC LIMIT 1`,
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
    { id: '00000000-0000-4000-8000-0000000000c1', usuario: 'rt1', nombre: 'Operario RT 1', rol: 'rt_calle' },
    { id: '00000000-0000-4000-8000-0000000000c2', usuario: 'firmante1', nombre: 'Ing. Firmante Legal', rol: 'firmante' },
    { id: '00000000-0000-4000-8000-0000000000c3', usuario: 'admin', nombre: 'Administrador del Sistema', rol: 'administrador' },
    { id: '00000000-0000-4000-8000-0000000000c4', usuario: 'secretaria', nombre: 'Secretaría', rol: 'secretaria' },
  ];

  /** Los edificios que existen, con su nombre (HU-19 RF-07). */
  private consorcios = new Map<string, string>();
  /** Hasta qué mensaje leyó cada usuario cada conversación: «usuario|sala» → id del mensaje. */
  private lecturas = new Map<string, string>();

  setContactos(c: ContactoChat[]) {
    this.contactos = c;
  }

  /** Los edificios que existen, para probar el etiquetado de un mensaje. */
  setConsorcios(edificios: string[] | Record<string, string>) {
    const pares = Array.isArray(edificios) ? edificios.map((id) => [id, `Edificio ${id.slice(0, 8)}`] as const) : Object.entries(edificios);
    this.consorcios = new Map(pares);
  }

  async guardarMensaje(emisorId: string, dto: CrearMensajeDto): Promise<MensajeChat> {
    const id = randomUUID();
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
      edificioNombre: dto.consorcioId ? dto.edificioNombre ?? null : null,
      maquinaRef: dto.maquinaRef ?? null,
      creadoEn: new Date().toISOString(),
    };
    this.mensajes.push(nuevo);
    return nuevo;
  }

  async listarMensajes(sala: string, usuarioId: string, opciones: OpcionesHilo = {}): Promise<PaginaMensajes> {
    const limite = Math.min(Math.max(Math.trunc(opciones.limite ?? LIMITE_HILO), 1), LIMITE_HILO);
    const deLaSala =
      sala === 'global'
        ? this.mensajes.filter((m) => m.tipoSala === 'global')
        : this.mensajes.filter(
            (m) =>
              m.tipoSala === 'directo' &&
              ((m.emisorId === usuarioId && m.destinatarioId === sala) ||
                (m.emisorId === sala && m.destinatarioId === usuarioId)),
          );
    const hasta = opciones.antes ? Math.max(deLaSala.findIndex((m) => m.id === opciones.antes), 0) : deLaSala.length;
    const desde = Math.max(hasta - limite, 0);
    return { mensajes: deLaSala.slice(desde, hasta), hayAnteriores: desde > 0 };
  }

  async listarContactos(usuarioId: string): Promise<ContactoChat[]> {
    return this.contactos.filter((c) => c.id !== usuarioId);
  }

  private deLaSalaDe(usuarioId: string, sala: string): MensajeChat[] {
    return sala === 'global'
      ? this.mensajes.filter((m) => m.tipoSala === 'global')
      : this.mensajes.filter(
          (m) =>
            m.tipoSala === 'directo' &&
            ((m.emisorId === usuarioId && m.destinatarioId === sala) || (m.emisorId === sala && m.destinatarioId === usuarioId)),
        );
  }

  async contarNoLeidos(usuarioId: string): Promise<NoLeidosPorSala> {
    const salas = new Set<string>(['global']);
    for (const m of this.mensajes) if (m.tipoSala === 'directo' && m.destinatarioId === usuarioId) salas.add(m.emisorId);
    const resultado: NoLeidosPorSala = {};
    for (const sala of salas) {
      const lista = this.deLaSalaDe(usuarioId, sala);
      const leido = this.lecturas.get(`${usuarioId}|${sala}`);
      const desde = leido ? lista.findIndex((m) => m.id === leido) + 1 : 0;
      const n = lista.slice(desde).filter((m) => m.emisorId !== usuarioId).length;
      if (n > 0) resultado[sala] = n;
    }
    return resultado;
  }

  async ultimoDeOtros(usuarioId: string, sala: string): Promise<ResumenMensajeNoLeido | null> {
    const deOtros = this.deLaSalaDe(usuarioId, sala).filter((m) => m.emisorId !== usuarioId);
    const m = deOtros[deOtros.length - 1];
    return m ? { id: m.id, emisorNombre: m.emisorNombre, contenido: m.contenido.slice(0, 200), conFoto: !!m.adjuntoUrl, creadoEn: m.creadoEn } : null;
  }

  async marcarLeido(usuarioId: string, sala: string, mensajeId: string): Promise<boolean> {
    const lista = this.deLaSalaDe(usuarioId, sala);
    const indice = lista.findIndex((m) => m.id === mensajeId);
    if (indice < 0) return false;
    const actual = this.lecturas.get(`${usuarioId}|${sala}`);
    if (!actual || lista.findIndex((m) => m.id === actual) < indice) this.lecturas.set(`${usuarioId}|${sala}`, mensajeId);
    return true;
  }

  async esContacto(usuarioId: string, destinatarioId: string): Promise<boolean> {
    return this.contactos.some((c) => c.id === destinatarioId && c.id !== usuarioId);
  }

  async existeConsorcio(consorcioId: string): Promise<boolean> {
    return this.consorcios.has(consorcioId);
  }

  async nombreDeConsorcio(consorcioId: string): Promise<string | null> {
    return this.consorcios.get(consorcioId) ?? null;
  }

  async obtenerUltimoMensaje(sala: string, usuarioId: string): Promise<{ contenido: string; creadoEn: string } | null> {
    const { mensajes: lista } = await this.listarMensajes(sala, usuarioId);
    if (lista.length === 0) return null;
    const ult = lista[lista.length - 1];
    return { contenido: ult.contenido, creadoEn: ult.creadoEn };
  }
}

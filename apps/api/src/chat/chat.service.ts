import { BadRequestException, Injectable } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { ChatRepository } from './chat.repository';
import { CanalChat, ConversacionNoLeida, CrearMensajeDto, LIMITE_HILO, MensajeChat, OpcionesHilo, PaginaMensajes, ResultadoLectura, ResumenNoLeidos } from './chat.types';
import { esUuid } from './chat.validacion';

@Injectable()
export class ChatService {
  constructor(private readonly repo: ChatRepository) {}

  /** Devuelve las salas disponibles: canal global + chats individuales con compañeros de equipo, cada una con sus mensajes sin leer (HU-19 RF-09). */
  async obtenerCanales(usuario: UsuarioAutenticado): Promise<CanalChat[]> {
    const noLeidos = await this.repo.contarNoLeidos(usuario.id);
    const ultimoGlobal = await this.repo.obtenerUltimoMensaje('global', usuario.id);
    const global: CanalChat = {
      id: 'global',
      tipo: 'global',
      nombre: '👥 Grupo General (Operarios e Ingenieros)',
      ultimoMensaje: ultimoGlobal?.contenido ?? null,
      ultimoMensajeHora: ultimoGlobal?.creadoEn ?? null,
      noLeidos: noLeidos.global ?? 0,
    };

    const contactos = await this.repo.listarContactos(usuario.id);
    const canalesDirectos: CanalChat[] = [];

    for (const c of contactos) {
      const ult = await this.repo.obtenerUltimoMensaje(c.id, usuario.id);
      canalesDirectos.push({
        id: c.id,
        tipo: 'directo',
        nombre: c.nombre,
        usuario: c.usuario,
        rol: c.rol,
        ultimoMensaje: ult?.contenido ?? null,
        ultimoMensajeHora: ult?.creadoEn ?? null,
        noLeidos: noLeidos[c.id] ?? 0,
      });
    }

    return [global, ...canalesDirectos];
  }

  /**
   * Cuántos mensajes sin leer tiene el usuario en total: los del grupo general y los privados que le escribieron. Solo cuentan las conversaciones
   * que figuran en su lista (global y sus contactos): lo de alguien que ya no es contacto no se podría abrir para leer. HU-19 RF-09.
   */
  async contarNoLeidosTotal(usuario: UsuarioAutenticado): Promise<number> {
    const [porSala, contactos] = await Promise.all([this.repo.contarNoLeidos(usuario.id), this.repo.listarContactos(usuario.id)]);
    return this.sumar(porSala, contactos.map((c) => c.id));
  }

  /**
   * El total de siempre más, de cada conversación con mensajes sin leer, el último que le escribió otra persona: quién fue y el comienzo del texto
   * (nunca la foto). Con eso la pantalla avisa en el navegador de lo que llega (HU-19 RF-10).
   */
  async resumenNoLeidos(usuario: UsuarioAutenticado): Promise<ResumenNoLeidos> {
    const [porSala, contactos] = await Promise.all([this.repo.contarNoLeidos(usuario.id), this.repo.listarContactos(usuario.id)]);
    const salas = ['global', ...contactos.map((c) => c.id)].filter((sala) => (porSala[sala] ?? 0) > 0);
    const conversaciones: ConversacionNoLeida[] = [];
    for (const sala of salas) {
      const ultimoMensaje = await this.repo.ultimoDeOtros(usuario.id, sala);
      if (ultimoMensaje) conversaciones.push({ sala, noLeidos: porSala[sala], ultimoMensaje });
    }
    return { total: this.sumar(porSala, contactos.map((c) => c.id)), conversaciones };
  }

  /** Marca la conversación como leída hasta el mensaje que la persona vio, y devuelve lo que queda sin leer en ella y en total. */
  async marcarLeido(usuario: UsuarioAutenticado, sala: string, mensajeId: string): Promise<ResultadoLectura> {
    const salaNorm = sala === 'global' ? 'global' : sala.toLowerCase();
    if (salaNorm !== 'global' && salaNorm === usuario.id.toLowerCase()) {
      throw new BadRequestException('No hay una conversación privada con uno mismo.');
    }
    if (!(await this.repo.marcarLeido(usuario.id, salaNorm, mensajeId.toLowerCase()))) {
      throw new BadRequestException('El mensaje no pertenece a esa conversación.');
    }
    const [porSala, contactos] = await Promise.all([this.repo.contarNoLeidos(usuario.id), this.repo.listarContactos(usuario.id)]);
    return { sala: salaNorm, noLeidos: porSala[salaNorm] ?? 0, total: this.sumar(porSala, contactos.map((c) => c.id)) };
  }

  private sumar(porSala: Record<string, number>, idsDeContactos: string[]): number {
    return ['global', ...idsDeContactos].reduce((suma, sala) => suma + (porSala[sala] ?? 0), 0);
  }

  /** Los mensajes más nuevos de la conversación pedida, de más viejo a más nuevo (hasta LIMITE_HILO). */
  async obtenerMensajes(sala: string, usuario: UsuarioAutenticado): Promise<MensajeChat[]> {
    return (await this.obtenerHilo(sala, usuario)).mensajes;
  }

  /**
   * Un tramo del hilo y si quedan mensajes anteriores (HU-19 RF-02). Sin `antes` trae los más nuevos; con `antes` (el id del mensaje más
   * viejo que ya se ve) trae los que lo preceden, para el botón «Ver mensajes anteriores».
   */
  async obtenerHilo(sala: string, usuario: UsuarioAutenticado, opciones: OpcionesHilo = {}): Promise<PaginaMensajes> {
    const salaNorm = sala && sala.trim() ? sala.trim() : 'global';
    const antes = opciones.antes?.trim() || null;
    if (antes && !esUuid(antes)) {
      throw new BadRequestException('El mensaje desde el cual pedir los anteriores no es válido.');
    }
    const limite = opciones.limite ?? LIMITE_HILO;
    if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_HILO) {
      throw new BadRequestException(`La cantidad de mensajes tiene que ser un número entre 1 y ${LIMITE_HILO}.`);
    }
    return this.repo.listarMensajes(salaNorm, usuario.id, { antes, limite });
  }

  /** Envío de un mensaje de texto, foto o enlace. */
  async enviarMensaje(dto: CrearMensajeDto, usuario: UsuarioAutenticado): Promise<MensajeChat> {
    const textoLimpio = dto.contenido ? dto.contenido.trim() : '';
    const tieneAdjunto = dto.adjuntoUrl && dto.adjuntoUrl.trim().length > 0;

    if (!textoLimpio && !tieneAdjunto) {
      throw new BadRequestException('El mensaje no puede estar vacío (debe contener texto o una imagen adjunta).');
    }

    if (dto.tipoSala === 'directo') {
      if (!dto.destinatarioId || !dto.destinatarioId.trim()) {
        throw new BadRequestException('Para un mensaje privado debes seleccionar un destinatario.');
      }
      if (dto.destinatarioId === usuario.id) {
        throw new BadRequestException('No puedes enviarte un mensaje privado a ti mismo.');
      }
      // HU-19 RF-04: el destinatario tiene que existir, estar activo y ser alguien con quien se puede chatear
      if (!(await this.repo.esContacto(usuario.id, dto.destinatarioId))) {
        throw new BadRequestException('El destinatario no existe o no es un contacto del chat.');
      }
    }

    // HU-19 RF-04: el edificio con el que se etiqueta tiene que existir (y poder verlo quien escribe).
    // HU-19 RF-07: su nombre, tal como lo ve quien escribe, queda guardado con el mensaje: así la etiqueta la ven todos los que lo leen.
    const edificioNombre = dto.consorcioId ? await this.repo.nombreDeConsorcio(dto.consorcioId) : null;
    if (dto.consorcioId && !edificioNombre) {
      throw new BadRequestException('El edificio elegido no existe o no está disponible para vos.');
    }

    const payload: CrearMensajeDto = {
      tipoSala: dto.tipoSala,
      destinatarioId: dto.tipoSala === 'directo' ? dto.destinatarioId : null,
      contenido: textoLimpio || '📷 Foto adjunta',
      adjuntoUrl: dto.adjuntoUrl ?? null,
      consorcioId: dto.consorcioId ?? null,
      maquinaRef: dto.consorcioId ? dto.maquinaRef ?? null : null,
      edificioNombre,
    };

    return this.repo.guardarMensaje(usuario.id, payload);
  }
}

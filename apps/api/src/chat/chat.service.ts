import { BadRequestException, Injectable } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { ChatRepository } from './chat.repository';
import { CanalChat, CrearMensajeDto, LIMITE_HILO, MensajeChat, OpcionesHilo, PaginaMensajes } from './chat.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ChatService {
  constructor(private readonly repo: ChatRepository) {}

  /** Devuelve las salas disponibles: canal global + chats individuales con compañeros de equipo. */
  async obtenerCanales(usuario: UsuarioAutenticado): Promise<CanalChat[]> {
    const ultimoGlobal = await this.repo.obtenerUltimoMensaje('global', usuario.id);
    const global: CanalChat = {
      id: 'global',
      tipo: 'global',
      nombre: '👥 Grupo General (Operarios e Ingenieros)',
      ultimoMensaje: ultimoGlobal?.contenido ?? null,
      ultimoMensajeHora: ultimoGlobal?.creadoEn ?? null,
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
      });
    }

    return [global, ...canalesDirectos];
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
    if (antes && !UUID.test(antes)) {
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
    }

    const payload: CrearMensajeDto = {
      tipoSala: dto.tipoSala,
      destinatarioId: dto.tipoSala === 'directo' ? dto.destinatarioId : null,
      contenido: textoLimpio || '📷 Foto adjunta',
      adjuntoUrl: dto.adjuntoUrl ?? null,
      consorcioId: dto.consorcioId ?? null,
      maquinaRef: dto.maquinaRef ?? null,
    };

    return this.repo.guardarMensaje(usuario.id, payload);
  }
}

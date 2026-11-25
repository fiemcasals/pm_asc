import { BadRequestException, Injectable } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { ChatRepository } from './chat.repository';
import { CanalChat, CrearMensajeDto, MensajeChat } from './chat.types';

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

  /** Historial cronológico de la conversación pedida. */
  async obtenerMensajes(sala: string, usuario: UsuarioAutenticado): Promise<MensajeChat[]> {
    const salaNorm = sala && sala.trim() ? sala.trim() : 'global';
    return this.repo.listarMensajes(salaNorm, usuario.id);
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

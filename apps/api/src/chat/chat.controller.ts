import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { UsuarioAutenticado } from '../auth/auth.types';
import { CanalChat, CrearMensajeDto, MensajeChat } from './chat.types';
import { ROLES_DEL_CHAT } from './chat.repository';

// Quien puede usar el chat es, exactamente, quien puede figurar como contacto de un privado (HU-19 RF-03).
@Controller('chat')
@Roles(...ROLES_DEL_CHAT)
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Get('canales')
  async obtenerCanales(@UsuarioActual() usuario: UsuarioAutenticado): Promise<CanalChat[]> {
    return this.service.obtenerCanales(usuario);
  }

  @Get('mensajes')
  async obtenerMensajes(
    @Query('sala') sala: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<MensajeChat[]> {
    return this.service.obtenerMensajes(sala || 'global', usuario);
  }

  @Post('mensajes')
  async enviarMensaje(
    @Body() dto: CrearMensajeDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<MensajeChat> {
    return this.service.enviarMensaje(dto, usuario);
  }
}

import { BadRequestException, Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { UsuarioAutenticado } from '../auth/auth.types';
import { CanalChat, MensajeChat } from './chat.types';
import { validarMensaje, validarSala } from './chat.validacion';
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

  /**
   * Los mensajes más nuevos de una conversación (hasta 200), de más viejo a más nuevo. Con `antes` (id del mensaje más viejo que ya se ve)
   * trae los anteriores a ese. El cuerpo sigue siendo la lista; si quedan mensajes anteriores lo dice el encabezado `X-Hay-Anteriores`.
   */
  @Get('mensajes')
  async obtenerMensajes(
    @Query('sala') sala: string,
    @Query('antes') antes: string | undefined,
    @Query('limite') limite: string | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MensajeChat[]> {
    let cuantos: number | undefined;
    if (limite !== undefined && limite !== '') {
      cuantos = /^\d+$/.test(limite) ? Number(limite) : NaN;
      if (Number.isNaN(cuantos)) throw new BadRequestException('La cantidad de mensajes tiene que ser un número entero.');
    }
    const pagina = await this.service.obtenerHilo(validarSala(sala), usuario, { antes, limite: cuantos });
    res.setHeader('X-Hay-Anteriores', pagina.hayAnteriores ? 'true' : 'false');
    res.setHeader('Access-Control-Expose-Headers', 'X-Hay-Anteriores');
    return pagina.mensajes;
  }

  @Post('mensajes')
  async enviarMensaje(
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<MensajeChat> {
    return this.service.enviarMensaje(validarMensaje(cuerpo), usuario);
  }
}

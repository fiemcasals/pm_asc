import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { UsuarioAutenticado } from '../auth/auth.types';
import { CanalChat, MensajeChat, ResultadoLectura, ResumenNoLeidos } from './chat.types';
import { validarLectura, validarMensaje, validarSala } from './chat.validacion';
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
   * Cuántos mensajes sin leer tiene en total quien pide (lo que muestra el menú y el título de la pestaña, HU-19 RF-09) y, de cada conversación con algo
   * sin leer, el último mensaje que le escribió otra persona: de ahí salen los avisos del navegador (HU-19 RF-10).
   */
  @Get('no-leidos')
  async contarNoLeidos(@UsuarioActual() usuario: UsuarioAutenticado): Promise<ResumenNoLeidos> {
    return this.service.resumenNoLeidos(usuario);
  }

  /** Marca una conversación como leída hasta el mensaje que la persona vio. Devuelve lo que queda sin leer en ella y en total. */
  @Post('lecturas')
  @HttpCode(200)
  async marcarLeido(@Body() cuerpo: unknown, @UsuarioActual() usuario: UsuarioAutenticado): Promise<ResultadoLectura> {
    const { sala, hasta } = validarLectura(cuerpo);
    return this.service.marcarLeido(usuario, sala, hasta);
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

  /**
   * La foto de un mensaje (HU-19 RF-05). El hilo lleva solo esta ruta; la pantalla la pide una vez y el navegador la guarda: la foto de un mensaje
   * no cambia nunca, así que se puede guardar por un año, y «private» hace que solo la guarde el navegador de quien la pidió, nunca un intermediario.
   */
  @Get('mensajes/:id/foto')
  async obtenerFoto(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado, @Res() res: Response): Promise<void> {
    const foto = await this.service.obtenerFoto(id, usuario);
    res.setHeader('Content-Type', foto.tipo);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(foto.datos);
  }

  @Post('mensajes')
  async enviarMensaje(
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<MensajeChat> {
    return this.service.enviarMensaje(validarMensaje(cuerpo), usuario);
  }
}

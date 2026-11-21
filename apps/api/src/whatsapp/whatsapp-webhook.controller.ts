import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { WhatsAppConnectorService } from './whatsapp-connector.service';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

export const MENSAJE_FIRMA_INVALIDA = 'Firma del proveedor inválida: no se cambió ningún registro.';

interface ResultadoWebhook {
  ok: true;
  /** Eventos recibidos, cuántos cambiaron un registro y cuántos eran de mensajes que el sistema no conoce. */
  recibidos: number;
  actualizados: number;
  desconocidos: number;
}

/**
 * Entradas públicas donde Meta y Twilio avisan cómo va cada mensaje (HU-11 RF-09). No llevan sesión: la
 * única garantía de que el aviso es del proveedor es su firma, que se valida antes de tocar nada.
 */
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  constructor(
    private readonly connector: WhatsAppConnectorService,
    private readonly webhook: WhatsAppWebhookService,
  ) {}

  /** Verificación de la suscripción en el panel de Meta. */
  @Get('meta')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  verificarMeta(
    @Query('hub.mode') modo?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') desafio?: string,
  ): string {
    const respuesta = this.webhook.verificarSuscripcionMeta(modo, token, desafio);
    if (respuesta === null) throw new ForbiddenException('Token de verificación inválido.');
    return respuesta;
  }

  @Post('meta')
  @HttpCode(200)
  recibirMeta(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') firma: string | undefined,
    @Body() cuerpo: unknown,
  ): ResultadoWebhook {
    if (!this.webhook.firmaMetaValida(req.rawBody, firma)) throw new UnauthorizedException(MENSAJE_FIRMA_INVALIDA);
    return this.aplicar(this.webhook.eventosDeMeta(cuerpo));
  }

  @Post('twilio')
  @HttpCode(200)
  recibirTwilio(
    @Headers('x-twilio-signature') firma: string | undefined,
    @Body() cuerpo: Record<string, unknown> | undefined,
  ): ResultadoWebhook {
    const parametros = cuerpo ?? {};
    if (!this.webhook.firmaTwilioValida(parametros, firma)) throw new UnauthorizedException(MENSAJE_FIRMA_INVALIDA);
    const evento = this.webhook.eventoDeTwilio(parametros);
    return this.aplicar(evento ? [evento] : []);
  }

  private aplicar(eventos: ReturnType<WhatsAppWebhookService['eventosDeMeta']>): ResultadoWebhook {
    let actualizados = 0;
    let desconocidos = 0;
    for (const { idMensaje, evento } of eventos) {
      const resultado = this.connector.registrarEventoProveedor(idMensaje, evento);
      if (resultado === 'actualizado') actualizados++;
      if (resultado === 'desconocido') desconocidos++;
    }
    // Siempre 200 con firma válida: un mensaje que no conocemos no se reintenta.
    return { ok: true, recibidos: eventos.length, actualizados, desconocidos };
  }
}

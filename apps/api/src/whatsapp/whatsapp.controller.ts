import { Body, Controller, Post } from '@nestjs/common';
import { WhatsAppConnectorService } from './whatsapp-connector.service';
import { WhatsAppFormatterService } from './whatsapp-formatter.service';
import {
  MensajeAlertaWhatsAppInput,
  WhatsAppEnvioResult,
} from './whatsapp.types';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly connector: WhatsAppConnectorService,
    private readonly formatter: WhatsAppFormatterService,
  ) {}

  @Post('enviar-alerta')
  async enviarAlerta(
    @Body() input: MensajeAlertaWhatsAppInput,
  ): Promise<WhatsAppEnvioResult> {
    return this.connector.enviarMensajeAlerta(input);
  }

  @Post('formatear')
  formatearAlerta(
    @Body() input: MensajeAlertaWhatsAppInput,
  ): { ok: boolean; mensajeFormateado: string } {
    const mensajeFormateado = this.formatter.formatearAlerta(input);
    return {
      ok: true,
      mensajeFormateado,
    };
  }
}

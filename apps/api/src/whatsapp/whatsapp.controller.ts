import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WhatsAppConnectorService } from './whatsapp-connector.service';
import { WhatsAppFormatterService } from './whatsapp-formatter.service';
import { WhatsAppTriggerService } from './whatsapp-trigger.service';
import {
  MensajeAlertaWhatsAppInput,
  RegistroEnvioWhatsApp,
  TriggerAlertaCriticaDto,
  WhatsAppDisparoResult,
  WhatsAppEnvioResult,
} from './whatsapp.types';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly connector: WhatsAppConnectorService,
    private readonly formatter: WhatsAppFormatterService,
    private readonly triggerService: WhatsAppTriggerService,
  ) {}

  @Post('enviar-alerta')
  async enviarAlerta(
    @Body() input: MensajeAlertaWhatsAppInput,
  ): Promise<WhatsAppEnvioResult> {
    const res = await this.connector.enviarMensajeAlerta(input);

    if (!res.ok) {
      const payload = {
        statusCode: res.estadoEntrega === 'no_configurado' ? 503 : 502,
        ok: false,
        estadoEntrega: res.estadoEntrega,
        error: res.error,
        message: res.error,
        telefonoDestino: res.telefonoDestino,
        intentos: res.intentos,
        timestampEnvio: res.timestampEnvio,
      };
      if (res.estadoEntrega === 'no_configurado') {
        throw new ServiceUnavailableException(payload);
      }
      throw new BadGatewayException(payload);
    }

    return res;
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

  @Post('trigger-alerta-critica')
  async triggerAlertaCritica(
    @Body() dto: TriggerAlertaCriticaDto,
  ): Promise<WhatsAppDisparoResult> {
    return this.triggerService.dispararAlertaInmediata(dto);
  }

  @Get('historial')
  getHistorial(
    @Query('alertaId') alertaId?: string,
  ): { total: number; registros: RegistroEnvioWhatsApp[] } {
    const registros = this.connector.getHistorialEnvios(alertaId);
    return {
      total: registros.length,
      registros,
    };
  }
}

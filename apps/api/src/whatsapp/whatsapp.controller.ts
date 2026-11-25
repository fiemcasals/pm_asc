import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Roles } from '../auth/roles.guard';
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

  /**
   * Manda un WhatsApp con el número de la empresa a un teléfono que se elige en el pedido: cada mensaje tiene costo y es spam si lo manda
   * cualquiera. Sólo la Secretaría y el Administrador (HU-11 RF-15); sin sesión responde 401 y con otro rol, 403.
   */
  @Post('enviar-alerta')
  @Roles('secretaria', 'administrador')
  async enviarAlerta(
    @Body() input: MensajeAlertaWhatsAppInput,
  ): Promise<WhatsAppEnvioResult> {
    const res = await this.connector.enviarMensajeAlerta(input);

    if (!res.ok) {
      const statusCode =
        res.estadoEntrega === 'sin_telefono'
          ? 400
          : res.estadoEntrega === 'no_configurado'
            ? 503
            : 502;
      const payload = {
        statusCode,
        ok: false,
        estadoEntrega: res.estadoEntrega,
        error: res.error,
        message: res.error,
        telefonoDestino: res.telefonoDestino,
        intentos: res.intentos,
        timestampEnvio: res.timestampEnvio,
      };
      if (res.estadoEntrega === 'sin_telefono') {
        throw new BadRequestException(payload);
      }
      if (res.estadoEntrega === 'no_configurado') {
        throw new ServiceUnavailableException(payload);
      }
      throw new BadGatewayException(payload);
    }

    return res;
  }

  /** Arma el texto del aviso, sin mandarlo. Misma regla que el envío: la Secretaría y el Administrador. */
  @Post('formatear')
  @Roles('secretaria', 'administrador')
  formatearAlerta(
    @Body() input: MensajeAlertaWhatsAppInput,
  ): { ok: boolean; mensajeFormateado: string } {
    const mensajeFormateado = this.formatter.formatearAlerta(input);
    return {
      ok: true,
      mensajeFormateado,
    };
  }

  /** Dispara el WhatsApp de una alerta crítica a la ECA (con el teléfono de su terna). Sólo la Secretaría y el Administrador. */
  @Post('trigger-alerta-critica')
  @Roles('secretaria', 'administrador')
  async triggerAlertaCritica(
    @Body() dto: TriggerAlertaCriticaDto,
  ): Promise<WhatsAppDisparoResult> {
    return this.triggerService.dispararAlertaInmediata(dto);
  }

  /** Si hay proveedor de WhatsApp y cuál (nunca credenciales): lo usa el cartel de la bandeja de avisos, de la Secretaría y el Administrador. */
  @Get('estado')
  @Roles('secretaria', 'administrador')
  getEstado(): { configurado: boolean; proveedor: 'meta' | 'twilio' | 'custom' | null } {
    return {
      configurado: this.connector.estaConfigurado(),
      proveedor: this.connector.getProveedorActivo(),
    };
  }

  /**
   * El historial de envíos trae teléfonos y textos de los avisos: sólo la Secretaría y el Administrador (HU-11 RF-13).
   * Sin sesión responde 401; con otro rol, 403.
   */
  @Get('historial')
  @Roles('secretaria', 'administrador')
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

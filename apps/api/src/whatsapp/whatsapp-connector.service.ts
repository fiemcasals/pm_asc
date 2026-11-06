import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppFormatterService } from './whatsapp-formatter.service';
import {
  MensajeAlertaWhatsAppInput,
  WhatsAppEnvioResult,
  WhatsAppTransport,
} from './whatsapp.types';

@Injectable()
export class WhatsAppConnectorService {
  private readonly logger = new Logger(WhatsAppConnectorService.name);
  private transport?: WhatsAppTransport;

  constructor(private readonly formatter: WhatsAppFormatterService) {}

  /**
   * Permite inyectar un transporte personalizado para pruebas unitarias o de integración.
   */
  setTransport(customTransport: WhatsAppTransport): void {
    this.transport = customTransport;
  }

  /**
   * Envía el mensaje formal a la API de WhatsApp con manejo de errores y reintentos ante fallas.
   */
  async enviarMensajeAlerta(
    input: MensajeAlertaWhatsAppInput,
    maxReintentos: number = 3,
    demoraInicialMs: number = 50,
  ): Promise<WhatsAppEnvioResult> {
    const inicioMs = Date.now();
    const mensajeFormateado = this.formatter.formatearAlerta(input);
    const telefono = (input.telefonoDestino || '+5491144009988').replace(/[^0-9+]/g, '');

    let intento = 0;
    let ultimoError: Error | null = null;

    while (intento < maxReintentos) {
      intento++;
      try {
        if (this.transport) {
          const res = await this.transport.postMessage(
            'https://api.whatsapp.mock/v1/messages',
            { to: telefono, text: mensajeFormateado },
            { Authorization: 'Bearer mock_whatsapp_token' },
          );

          if (res.status >= 200 && res.status < 300) {
            return {
              ok: true,
              idMensaje: `WA-MSG-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
              telefonoDestino: telefono,
              mensajeFormateado,
              intentos: intento,
              timestampEnvio: new Date().toISOString(),
              tiempoRespuestaMs: Date.now() - inicioMs,
              estadoEntrega: 'entregado',
            };
          }

          throw new Error(`WhatsApp API respondió con código de error HTTP ${res.status}`);
        }

        // Transporte por defecto en desarrollo: simulación resiliente
        await new Promise((resolve) => setTimeout(resolve, 15));

        return {
          ok: true,
          idMensaje: `WA-MSG-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          telefonoDestino: telefono,
          mensajeFormateado,
          intentos: intento,
          timestampEnvio: new Date().toISOString(),
          tiempoRespuestaMs: Date.now() - inicioMs,
          estadoEntrega: 'entregado',
        };
      } catch (err) {
        ultimoError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`Intento ${intento}/${maxReintentos} de envío WhatsApp falló: ${ultimoError.message}`);

        if (intento < maxReintentos) {
          const delay = demoraInicialMs * Math.pow(2, intento - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    // Todos los reintentos fallaron
    return {
      ok: false,
      idMensaje: '',
      telefonoDestino: telefono,
      mensajeFormateado,
      intentos: intento,
      timestampEnvio: new Date().toISOString(),
      tiempoRespuestaMs: Date.now() - inicioMs,
      estadoEntrega: 'fallido',
      error: ultimoError?.message || 'Error desconocido al conectar con API de WhatsApp',
    };
  }
}


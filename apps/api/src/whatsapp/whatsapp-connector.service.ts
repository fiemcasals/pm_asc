import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { WhatsAppFormatterService } from './whatsapp-formatter.service';
import {
  MENSAJE_WHATSAPP_NO_CONFIGURADO,
  MensajeAlertaWhatsAppInput,
  RegistroEnvioWhatsApp,
  WhatsAppEnvioResult,
  WhatsAppTransport,
} from './whatsapp.types';

export interface ContextoEnvioWhatsApp {
  origen?: 'manual' | 'automatico';
  alertaId?: string;
  maquinaId?: string;
  enlaceDirecto?: string;
}

@Injectable()
export class WhatsAppConnectorService {
  private readonly logger = new Logger(WhatsAppConnectorService.name);
  private transport?: WhatsAppTransport;
  private readonly historial: RegistroEnvioWhatsApp[] = [];

  constructor(private readonly formatter: WhatsAppFormatterService) {}

  /**
   * Permite inyectar un transporte personalizado para pruebas o proveedor configurado.
   */
  setTransport(customTransport: WhatsAppTransport | undefined): void {
    this.transport = customTransport;
  }

  /** Indica si existe un proveedor/transporte de mensajería activo. */
  estaConfigurado(): boolean {
    return Boolean(this.transport);
  }

  /** Devuelve el historial de intentos de envío (manuales y automáticos). */
  getHistorialEnvios(alertaId?: string): RegistroEnvioWhatsApp[] {
    const lista = alertaId
      ? this.historial.filter((h) => h.alertaId === alertaId)
      : this.historial;
    return lista.map((h) => structuredClone(h));
  }

  /**
   * Envía el mensaje formal al proveedor de WhatsApp configurado con reintentos ante fallas.
   * Si no hay proveedor configurado, nunca simula entrega: informa el motivo y registra no realizado.
   */
  async enviarMensajeAlerta(
    input: MensajeAlertaWhatsAppInput,
    maxReintentos: number = 3,
    demoraInicialMs: number = 50,
    contexto: ContextoEnvioWhatsApp = {},
  ): Promise<WhatsAppEnvioResult> {
    const inicioMs = Date.now();
    const mensajeFormateado = this.formatter.formatearAlerta(input);
    const telefono = (input.telefonoDestino || '+5491144009988').replace(/[^0-9+]/g, '');

    if (!this.transport) {
      this.logger.warn(
        `Envío WhatsApp cancelado (${contexto.origen ?? 'manual'}): ${MENSAJE_WHATSAPP_NO_CONFIGURADO}`,
      );
      const resultado: WhatsAppEnvioResult = {
        ok: false,
        idMensaje: '',
        telefonoDestino: telefono,
        mensajeFormateado,
        intentos: 0,
        timestampEnvio: new Date().toISOString(),
        tiempoRespuestaMs: Date.now() - inicioMs,
        estadoEntrega: 'no_configurado',
        error: MENSAJE_WHATSAPP_NO_CONFIGURADO,
      };
      this.registrarIntento(resultado, contexto);
      return resultado;
    }

    let intento = 0;
    let ultimoError: Error | null = null;

    while (intento < maxReintentos) {
      intento++;
      try {
        const res = await this.transport.postMessage(
          'https://api.whatsapp.mock/v1/messages',
          { to: telefono, text: mensajeFormateado },
          { Authorization: 'Bearer mock_whatsapp_token' },
        );

        if (res.status >= 200 && res.status < 300) {
          const resultado: WhatsAppEnvioResult = {
            ok: true,
            idMensaje: `WA-MSG-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            telefonoDestino: telefono,
            mensajeFormateado,
            intentos: intento,
            timestampEnvio: new Date().toISOString(),
            tiempoRespuestaMs: Date.now() - inicioMs,
            estadoEntrega: 'entregado',
          };
          this.registrarIntento(resultado, contexto);
          return resultado;
        }

        throw new Error(`WhatsApp API respondió con código de error HTTP ${res.status}`);
      } catch (err) {
        ultimoError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `Intento ${intento}/${maxReintentos} de envío WhatsApp falló: ${ultimoError.message}`,
        );

        if (intento < maxReintentos) {
          const delay = demoraInicialMs * Math.pow(2, intento - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    const fallo: WhatsAppEnvioResult = {
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
    this.registrarIntento(fallo, contexto);
    return fallo;
  }

  private registrarIntento(res: WhatsAppEnvioResult, ctx: ContextoEnvioWhatsApp): void {
    this.historial.push({
      id: `WA-REG-${randomUUID()}`,
      origen: ctx.origen ?? 'manual',
      alertaId: ctx.alertaId,
      maquinaId: ctx.maquinaId,
      telefonoDestino: res.telefonoDestino,
      ok: res.ok,
      envioRealizado: res.ok,
      estado: res.ok ? 'realizado' : 'no_realizado',
      estadoEntrega: res.estadoEntrega,
      idMensaje: res.idMensaje,
      motivo: res.error,
      enlaceDirecto: ctx.enlaceDirecto,
      duracionMs: res.tiempoRespuestaMs,
      timestamp: res.timestampEnvio,
    });
  }
}

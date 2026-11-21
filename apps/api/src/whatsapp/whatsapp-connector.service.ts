import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../config';
import { WhatsAppFormatterService } from './whatsapp-formatter.service';
import { extraerErrorProveedor, WhatsAppProviderTransport } from './whatsapp-provider.transport';
import {
  MENSAJE_TELEFONO_ECA_FALTANTE,
  MENSAJE_WHATSAPP_NO_CONFIGURADO,
  MensajeAlertaWhatsAppInput,
  EventoEstadoProveedor,
  RegistroEnvioWhatsApp,
  ResultadoEventoProveedor,
  WhatsAppEnvioResult,
  WhatsAppTransport,
} from './whatsapp.types';

export interface ContextoEnvioWhatsApp {
  origen?: 'manual' | 'automatico';
  alertaId?: string;
  maquinaId?: string;
  enlaceDirecto?: string;
  /** Quién aprobó el aviso y cuándo (HU-11 RF-05). */
  aprobadoPor?: string | null;
  aprobadoEn?: string | null;
}

/** Lo que se sabe de un mensaje a medida que el proveedor avisa: el estado nunca retrocede. */
const ORDEN_ESTADO: Partial<Record<RegistroEnvioWhatsApp['estadoEntrega'], number>> = {
  aceptado: 0,
  enviado: 1,
  entregado: 2,
  leido: 3,
};

class RechazoProveedorError extends Error {
  constructor(
    message: string,
    readonly reintentable: boolean,
  ) {
    super(message);
  }
}

@Injectable()
export class WhatsAppConnectorService {
  private readonly logger = new Logger(WhatsAppConnectorService.name);
  private transport?: WhatsAppTransport;
  private readonly historial: RegistroEnvioWhatsApp[] = [];

  constructor(
    private readonly formatter: WhatsAppFormatterService,
    @Optional() @Inject(APP_CONFIG) config?: AppConfig,
  ) {
    if (config?.whatsapp) {
      this.transport = new WhatsAppProviderTransport(config.whatsapp);
      this.logger.log(`Proveedor real de WhatsApp inicializado: ${config.whatsapp.proveedor}`);
    }
  }

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

  /** Devuelve el nombre del proveedor activo sin exponer ninguna credencial. */
  getProveedorActivo(): 'meta' | 'twilio' | 'custom' | null {
    if (!this.transport) return null;
    return this.transport.proveedor ?? 'custom';
  }

  /** Devuelve el historial de intentos de envío (manuales y automáticos). */
  getHistorialEnvios(alertaId?: string): RegistroEnvioWhatsApp[] {
    const lista = alertaId
      ? this.historial.filter((h) => h.alertaId === alertaId)
      : this.historial;
    return lista.map((h) => structuredClone(h));
  }

  /**
   * Envía el mensaje formal al proveedor de WhatsApp configurado con reintentos ante fallas transitorias.
   * - Sin teléfono de destino cargado: no realiza el envío e informa el motivo (HU-11 RF-04).
   * - Sin proveedor configurado: nunca simula entrega, informa el motivo y registra no realizado (HU-11 RF-03).
   * - Si el proveedor rechaza el envío: informa el error devuelto por el proveedor y registra como fallido.
   */
  async enviarMensajeAlerta(
    input: MensajeAlertaWhatsAppInput,
    maxReintentos: number = 3,
    demoraInicialMs: number = 50,
    contexto: ContextoEnvioWhatsApp = {},
  ): Promise<WhatsAppEnvioResult> {
    const inicioMs = Date.now();
    const mensajeFormateado = this.formatter.formatearAlerta(input);
    const telefono = (input.telefonoDestino ?? '').replace(/[^0-9+]/g, '').trim();

    if (!telefono) {
      this.logger.warn(
        `Envío WhatsApp cancelado (${contexto.origen ?? 'manual'}): ${MENSAJE_TELEFONO_ECA_FALTANTE}`,
      );
      const resultado: WhatsAppEnvioResult = {
        ok: false,
        idMensaje: '',
        telefonoDestino: '',
        mensajeFormateado,
        intentos: 0,
        timestampEnvio: new Date().toISOString(),
        tiempoRespuestaMs: Date.now() - inicioMs,
        estadoEntrega: 'sin_telefono',
        error: MENSAJE_TELEFONO_ECA_FALTANTE,
      };
      this.registrarIntento(resultado, contexto);
      return resultado;
    }

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

    const proveedor = this.transport.proveedor ?? 'custom';
    let intento = 0;
    let ultimoError: Error | null = null;

    while (intento < maxReintentos) {
      intento++;
      try {
        const res = await this.transport.postMessage(
          'whatsapp-provider://messages',
          { to: telefono, text: mensajeFormateado },
          {},
        );

        if (res.status >= 200 && res.status < 300) {
          const idMensaje =
            res.providerMessageId && res.providerMessageId.trim()
              ? res.providerMessageId.trim()
              : `WA-MSG-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

          const resultado: WhatsAppEnvioResult = {
            ok: true,
            idMensaje,
            telefonoDestino: telefono,
            mensajeFormateado,
            intentos: intento,
            timestampEnvio: new Date().toISOString(),
            tiempoRespuestaMs: Date.now() - inicioMs,
            // El proveedor recibió el pedido: eso todavía no es que el mensaje haya llegado (HU-11 RF-09).
            estadoEntrega: 'aceptado',
            proveedor,
          };
          this.registrarIntento(resultado, contexto);
          return resultado;
        }

        const detalle =
          res.errorDetail ||
          (res.body !== undefined ? extraerErrorProveedor(res.body, typeof res.body === 'string' ? res.body : '') : '');
        const mensajeError = detalle
          ? `Proveedor WhatsApp rechazó el envío (HTTP ${res.status}): ${detalle}`
          : `WhatsApp API respondió con código de error HTTP ${res.status}`;
        // Errores 4xx son rechazos definitivos del proveedor (número no habilitado, credenciales, etc.): no reintentar.
        const reintentable = res.status >= 500 || res.status === 429;
        throw new RechazoProveedorError(mensajeError, reintentable);
      } catch (err) {
        ultimoError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `Intento ${intento}/${maxReintentos} de envío WhatsApp falló: ${ultimoError.message}`,
        );

        if (err instanceof RechazoProveedorError && !err.reintentable) {
          break;
        }

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
      proveedor,
      error: ultimoError?.message || 'Error desconocido al conectar con API de WhatsApp',
    };
    this.registrarIntento(fallo, contexto);
    return fallo;
  }

  /**
   * Aplica un aviso de estado del proveedor al registro con ese id de mensaje (HU-11 RF-09).
   * - El estado nunca retrocede: un `delivered` después de un `read`, o el mismo aviso dos veces, no cambia nada.
   * - `failed` sólo vale mientras el mensaje no se entregó; después de entregado o leído se ignora.
   * - Un id que el sistema no conoce se informa como `desconocido` y no crea nada.
   */
  registrarEventoProveedor(idMensaje: string, evento: EventoEstadoProveedor): ResultadoEventoProveedor {
    const id = idMensaje.trim();
    const registro = id ? this.historial.find((h) => h.idMensaje === id) : undefined;
    if (!registro) return 'desconocido';

    const actual = ORDEN_ESTADO[registro.estadoEntrega];
    if (actual === undefined) return 'sin_cambio'; // fallido o un estado que no es de un envío aceptado

    if (evento.estado === 'fallido') {
      if (actual >= ORDEN_ESTADO.entregado!) return 'sin_cambio';
      const detalle = [evento.codigoError ? `código ${evento.codigoError}` : '', evento.mensajeError ?? ''].filter(Boolean).join(' · ');
      registro.estadoEntrega = 'fallido';
      registro.ok = false;
      registro.envioRealizado = false;
      registro.estado = 'no_realizado';
      registro.motivo = `El proveedor informó que el mensaje no se entregó${detalle ? `: ${detalle}` : ''}`;
      registro.errorProveedor = { codigo: evento.codigoError, mensaje: evento.mensajeError };
    } else {
      if (ORDEN_ESTADO[evento.estado]! <= actual) return 'sin_cambio';
      registro.estadoEntrega = evento.estado;
    }
    registro.estadoActualizadoEn = evento.fecha ?? new Date().toISOString();
    return 'actualizado';
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
      ...(ctx.aprobadoPor ? { aprobadoPor: ctx.aprobadoPor, aprobadoEn: ctx.aprobadoEn ?? undefined } : {}),
      duracionMs: res.tiempoRespuestaMs,
      timestamp: res.timestampEnvio,
    });
  }
}

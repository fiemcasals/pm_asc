import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, AppConfig, WhatsAppWebhookConfig } from '../config';
import { EventoEstadoProveedor } from './whatsapp.types';

/** Compara dos textos en tiempo constante, para no filtrar cuánto de un secreto se acertó. */
function iguales(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'comparar').update(a).digest();
  const hb = createHmac('sha256', 'comparar').update(b).digest();
  return timingSafeEqual(ha, hb);
}

interface EstadoMeta {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: { code?: number | string; title?: string; message?: string; error_data?: { details?: string } }[];
}

function aFechaIso(segundos: string | undefined): string | undefined {
  const n = Number(segundos);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : undefined;
}

/**
 * Valida las firmas de Meta y Twilio y traduce sus avisos de estado a eventos propios (HU-11 RF-09).
 * Los secretos salen sólo de variables de entorno; sin ellos, todo se rechaza.
 */
@Injectable()
export class WhatsAppWebhookService {
  private readonly cfg: WhatsAppWebhookConfig;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.cfg = config.whatsappWebhook;
  }

  /** GET de verificación de Meta: devuelve el desafío sólo si el token coincide. */
  verificarSuscripcionMeta(modo: string | undefined, token: string | undefined, desafio: string | undefined): string | null {
    if (!this.cfg.metaVerifyToken || modo !== 'subscribe' || !token || desafio === undefined) return null;
    return iguales(token, this.cfg.metaVerifyToken) ? desafio : null;
  }

  /** X-Hub-Signature-256: "sha256=" + HMAC-SHA256 del cuerpo sin modificar con el secreto de la app. */
  firmaMetaValida(cuerpoCrudo: Buffer | undefined, cabecera: string | undefined): boolean {
    if (!this.cfg.metaAppSecret || !cuerpoCrudo || !cabecera) return false;
    const esperada = `sha256=${createHmac('sha256', this.cfg.metaAppSecret).update(cuerpoCrudo).digest('hex')}`;
    return iguales(cabecera.trim(), esperada);
  }

  /** X-Twilio-Signature: HMAC-SHA1 en base64 de la URL pública + cada parámetro (ordenado) como clave y valor. */
  firmaTwilioValida(parametros: Record<string, unknown>, cabecera: string | undefined): boolean {
    if (!this.cfg.twilioAuthToken || !cabecera) return false;
    const base = Object.keys(parametros)
      .sort()
      .reduce((acc, k) => acc + k + String(parametros[k] ?? ''), this.cfg.twilioWebhookUrl);
    const esperada = createHmac('sha1', this.cfg.twilioAuthToken).update(base, 'utf8').digest('base64');
    return iguales(cabecera.trim(), esperada);
  }

  /** Los estados que trae un POST de Meta (puede traer varios, de varios mensajes). */
  eventosDeMeta(cuerpo: unknown): { idMensaje: string; evento: EventoEstadoProveedor }[] {
    const salida: { idMensaje: string; evento: EventoEstadoProveedor }[] = [];
    const entradas = (cuerpo as { entry?: unknown[] } | null)?.entry;
    if (!Array.isArray(entradas)) return salida;
    for (const entrada of entradas) {
      const cambios = (entrada as { changes?: unknown[] } | null)?.changes;
      if (!Array.isArray(cambios)) continue;
      for (const cambio of cambios) {
        const estados = (cambio as { value?: { statuses?: EstadoMeta[] } } | null)?.value?.statuses;
        if (!Array.isArray(estados)) continue;
        for (const e of estados) {
          if (!e?.id || !e.status) continue;
          const estado = ({ sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' } as const)[
            e.status as 'sent' | 'delivered' | 'read' | 'failed'
          ];
          if (!estado) continue;
          const error = e.errors?.[0];
          salida.push({
            idMensaje: e.id,
            evento: {
              estado,
              fecha: aFechaIso(e.timestamp),
              ...(estado === 'fallido'
                ? {
                    codigoError: error?.code !== undefined ? String(error.code) : undefined,
                    // Meta suele repetir el mismo texto en title y message: se junta cada uno una sola vez.
                    mensajeError:
                      [...new Set([error?.title, error?.message, error?.error_data?.details].filter(Boolean))].join(' · ') || undefined,
                  }
                : {}),
            },
          });
        }
      }
    }
    return salida;
  }

  /** El estado de un POST de Twilio, o `null` si no cambia nada (en cola, aceptado, enviando...). */
  eventoDeTwilio(parametros: Record<string, unknown>): { idMensaje: string; evento: EventoEstadoProveedor } | null {
    const idMensaje = String(parametros.MessageSid ?? parametros.SmsSid ?? '').trim();
    const estado = ({ sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido', undelivered: 'fallido' } as const)[
      String(parametros.MessageStatus ?? parametros.SmsStatus ?? '') as 'sent' | 'delivered' | 'read' | 'failed' | 'undelivered'
    ];
    if (!idMensaje || !estado) return null;
    return {
      idMensaje,
      evento: {
        estado,
        ...(estado === 'fallido'
          ? {
              codigoError: parametros.ErrorCode ? String(parametros.ErrorCode) : undefined,
              mensajeError: parametros.ErrorMessage ? String(parametros.ErrorMessage) : undefined,
            }
          : {}),
      },
    };
  }
}

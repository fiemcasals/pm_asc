import { WhatsAppProviderConfig } from '../config';
import { WhatsAppTransport, WhatsAppTransportResponse } from './whatsapp.types';

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

/** Extrae el detalle de error estructurado devuelto por Meta Cloud API o Twilio. */
export function extraerErrorProveedor(body: unknown, rawText: string): string {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (obj.error && typeof obj.error === 'object') {
      const err = obj.error as Record<string, unknown>;
      const partes: string[] = [];
      if (typeof err.message === 'string' && err.message.trim()) partes.push(err.message.trim());
      if (err.code !== undefined) partes.push(`código ${String(err.code)}`);
      const data = err.error_data as Record<string, unknown> | undefined;
      if (data && typeof data.details === 'string' && data.details.trim()) {
        partes.push(data.details.trim());
      }
      if (partes.length > 0) return partes.join(' · ');
    }
    if (typeof obj.message === 'string' && obj.message.trim()) {
      const code = obj.code !== undefined ? ` (código ${String(obj.code)})` : '';
      return `${obj.message.trim()}${code}`;
    }
  }
  const limpio = rawText.trim();
  return limpio ? limpio.slice(0, 300) : 'Error sin detalle devuelto por el proveedor';
}

function normalizarNumeroTwilio(numero: string): string {
  const limpio = numero.trim();
  if (limpio.toLowerCase().startsWith('whatsapp:')) return limpio;
  const conMas = limpio.startsWith('+') ? limpio : `+${limpio.replace(/[^0-9]/g, '')}`;
  return `whatsapp:${conMas}`;
}

/**
 * Transporte HTTP real hacia proveedores de WhatsApp (Meta WhatsApp Cloud API o Twilio),
 * tomando siempre las credenciales desde `AppConfig.whatsapp` (variables de entorno).
 */
export class WhatsAppProviderTransport implements WhatsAppTransport {
  readonly proveedor: 'meta' | 'twilio';

  constructor(
    private readonly config: WhatsAppProviderConfig,
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
  ) {
    this.proveedor = config.proveedor;
  }

  async postMessage(
    _url: string,
    payload: unknown,
    _headers: Record<string, string>,
  ): Promise<WhatsAppTransportResponse> {
    const { to, text } = (payload ?? {}) as { to?: string; text?: string };
    const destino = (to ?? '').trim();
    const mensaje = text ?? '';

    if (this.config.proveedor === 'meta') {
      return this.enviarMeta(destino, mensaje);
    }
    return this.enviarTwilio(destino, mensaje);
  }

  private async enviarMeta(destino: string, mensaje: string): Promise<WhatsAppTransportResponse> {
    const cfg = this.config as Extract<WhatsAppProviderConfig, { proveedor: 'meta' }>;
    const endpoint = `${cfg.baseUrl}/${cfg.apiVersion}/${encodeURIComponent(cfg.phoneNumberId)}/messages`;
    // Meta Cloud API espera dígitos en formato E.164 sin el signo '+'.
    const toDigits = destino.replace(/[^0-9]/g, '');

    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toDigits,
        type: 'text',
        text: {
          preview_url: true,
          body: mensaje,
        },
      }),
    });

    const rawText = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = rawText ? JSON.parse(rawText) : undefined;
    } catch {
      parsed = undefined;
    }

    if (res.status >= 200 && res.status < 300) {
      const messages = (parsed as { messages?: Array<{ id?: string }> } | undefined)?.messages;
      const providerMessageId = messages?.[0]?.id;
      return { status: res.status, body: parsed ?? rawText, providerMessageId };
    }

    return {
      status: res.status,
      body: parsed ?? rawText,
      errorDetail: extraerErrorProveedor(parsed, rawText),
    };
  }

  private async enviarTwilio(destino: string, mensaje: string): Promise<WhatsAppTransportResponse> {
    const cfg = this.config as Extract<WhatsAppProviderConfig, { proveedor: 'twilio' }>;
    const endpoint = `${cfg.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`;
    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');

    const params = new URLSearchParams({
      From: normalizarNumeroTwilio(cfg.fromNumber),
      To: normalizarNumeroTwilio(destino),
      Body: mensaje,
    });

    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const rawText = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = rawText ? JSON.parse(rawText) : undefined;
    } catch {
      parsed = undefined;
    }

    if (res.status >= 200 && res.status < 300) {
      const sid = (parsed as { sid?: string } | undefined)?.sid;
      return { status: res.status, body: parsed ?? rawText, providerMessageId: sid };
    }

    return {
      status: res.status,
      body: parsed ?? rawText,
      errorDetail: extraerErrorProveedor(parsed, rawText),
    };
  }
}

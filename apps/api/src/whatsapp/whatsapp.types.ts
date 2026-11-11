export const MENSAJE_WHATSAPP_NO_CONFIGURADO =
  'El envío por WhatsApp no está configurado: no hay proveedor de mensajería activo.';

export type EstadoEntregaWhatsApp = 'entregado' | 'enviado' | 'fallido' | 'no_configurado';

export interface MensajeAlertaWhatsAppInput {
  telefonoDestino?: string;
  nombreEca: string;
  consorcio: string;
  equipo: string;
  estado: string;
  detalle: string;
  remitoUrl?: string;
  fechaDeteccion?: string;
}

export interface WhatsAppEnvioResult {
  ok: boolean;
  idMensaje: string;
  telefonoDestino: string;
  mensajeFormateado: string;
  intentos: number;
  timestampEnvio: string;
  tiempoRespuestaMs: number;
  estadoEntrega: EstadoEntregaWhatsApp;
  error?: string;
}

export interface WhatsAppTransport {
  postMessage(
    url: string,
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<{ status: number; body?: unknown }>;
}

export interface TriggerAlertaCriticaDto {
  alertaId?: string;
  maquinaId?: string;
  telefonoDestino?: string;
  baseUrl?: string;
}

export interface WhatsAppDisparoResult {
  ok: boolean;
  envioRealizado: boolean;
  estado: 'realizado' | 'no_realizado';
  estadoEntrega: EstadoEntregaWhatsApp;
  idMensaje: string;
  telefonoDestino: string;
  duracionMs: number;
  menorA5Segundos: boolean;
  timestampDisparo: string;
  enlaceDirecto: string;
  mensajeFormateado: string;
  motivo?: string;
}

export interface RegistroEnvioWhatsApp {
  id: string;
  origen: 'manual' | 'automatico';
  alertaId?: string;
  maquinaId?: string;
  telefonoDestino: string;
  ok: boolean;
  envioRealizado: boolean;
  estado: 'realizado' | 'no_realizado';
  estadoEntrega: EstadoEntregaWhatsApp;
  idMensaje: string;
  motivo?: string;
  enlaceDirecto?: string;
  duracionMs: number;
  timestamp: string;
}

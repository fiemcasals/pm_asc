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
  estadoEntrega: 'entregado' | 'enviado' | 'fallido';
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
  idMensaje: string;
  telefonoDestino: string;
  duracionMs: number;
  menorA5Segundos: boolean;
  timestampDisparo: string;
  enlaceDirecto: string;
  mensajeFormateado: string;
}

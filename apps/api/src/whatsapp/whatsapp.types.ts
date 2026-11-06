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

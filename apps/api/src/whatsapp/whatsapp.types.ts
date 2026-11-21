export const MENSAJE_WHATSAPP_NO_CONFIGURADO =
  'El envío por WhatsApp no está configurado: no hay proveedor de mensajería activo.';

export const MENSAJE_TELEFONO_ECA_FALTANTE =
  'No se realizó el envío: la ECA responsable del edificio no tiene un teléfono cargado en la terna de roles.';

/**
 * Estado de un envío. `aceptado` es que el proveedor recibió el pedido (respuesta 2xx): todavía no prueba que el
 * mensaje haya llegado. `enviado`, `entregado` y `leido` los confirma el proveedor con sus avisos (HU-11 RF-09).
 */
export type EstadoEntregaWhatsApp =
  | 'aceptado'
  | 'enviado'
  | 'entregado'
  | 'leido'
  | 'fallido'
  | 'no_configurado'
  | 'sin_telefono';

/** Un aviso de estado del proveedor, ya traducido a los estados del sistema. */
export interface EventoEstadoProveedor {
  estado: 'enviado' | 'entregado' | 'leido' | 'fallido';
  /** Cuándo lo informó el proveedor, si lo dice. */
  fecha?: string;
  codigoError?: string;
  mensajeError?: string;
}

export type ResultadoEventoProveedor = 'actualizado' | 'sin_cambio' | 'desconocido';

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
  proveedor?: 'meta' | 'twilio' | 'custom';
  error?: string;
}

export interface WhatsAppTransportResponse {
  status: number;
  body?: unknown;
  /** ID oficial devuelto por el proveedor (wamid de Meta o SID de Twilio), si aplica. */
  providerMessageId?: string;
  /** Mensaje de error devuelto por el proveedor cuando rechaza el envío. */
  errorDetail?: string;
}

export interface WhatsAppTransport {
  readonly proveedor?: 'meta' | 'twilio' | 'custom';
  postMessage(
    url: string,
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WhatsAppTransportResponse>;
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
  /** Quién aprobó el aviso que originó el envío y cuándo (HU-11 RF-05). */
  aprobadoPor?: string;
  aprobadoEn?: string;
  duracionMs: number;
  timestamp: string;
  /** Cuándo cambió el estado por última vez con un aviso del proveedor (HU-11 RF-09). */
  estadoActualizadoEn?: string;
  /** Código y mensaje de error que informó el proveedor cuando el mensaje falló. */
  errorProveedor?: { codigo?: string; mensaje?: string };
}

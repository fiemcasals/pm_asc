// HU-19 RF-06 — el chat dice cuándo un mensaje no se envió y muestra el estado real de la conexión.

/** El estado de la conexión del chat: sale del resultado de la última actualización del hilo. */
export type EstadoConexion = 'conectando' | 'conectado' | 'sin_conexion';

/** Lo que dice la cabecera del chat. Antes decía «Equipo conectado» o «En línea» siempre, aunque no hubiera red. */
export function textoDeConexion(estado: EstadoConexion): string {
  if (estado === 'conectado') return 'Conectado';
  if (estado === 'sin_conexion') return 'Sin conexión, reintentando…';
  return 'Conectando…';
}

/** ¿El resultado de una actualización del hilo cuenta como «sin conexión»? Sin red (no hubo respuesta) o un error del servidor (5xx). */
export function actualizacionFallida(status: number | null): boolean {
  return status === null || status >= 500;
}

/** Por qué no se envió un mensaje: sin red, un error del servidor, o un rechazo del servidor con su motivo (400). */
export type FalloDeEnvio = { tipo: 'red' } | { tipo: 'servidor'; status: number } | { tipo: 'rechazo'; motivo: string };

export interface AvisoDeEnvio {
  texto: string;
  /** Si tiene sentido ofrecer «Reintentar»: sin red o con un error del servidor, sí; si el servidor rechazó el mensaje, reenviarlo igual no sirve. */
  reintentar: boolean;
}

export function avisoDeEnvio(fallo: FalloDeEnvio): AvisoDeEnvio {
  if (fallo.tipo === 'red') return { texto: 'No se pudo enviar el mensaje: no hay conexión. Tu mensaje sigue en la caja.', reintentar: true };
  if (fallo.tipo === 'servidor') return { texto: 'No se pudo enviar el mensaje: el servidor tuvo un problema. Tu mensaje sigue en la caja.', reintentar: true };
  return { texto: `No se envió el mensaje: ${fallo.motivo}`, reintentar: false };
}

/** El motivo que manda la API en un 400 (`message` puede ser un texto o una lista), en lenguaje claro. Si no viene, uno genérico. */
export function motivoDelRechazo(cuerpo: unknown): string {
  const m = cuerpo && typeof cuerpo === 'object' ? (cuerpo as { message?: unknown }).message : undefined;
  const texto = Array.isArray(m) ? m.filter((x) => typeof x === 'string').join(' ') : typeof m === 'string' ? m : '';
  return texto.trim() || 'el servidor no lo aceptó. Revisá el texto o la foto e intentá de nuevo.';
}

/** Traduce la respuesta del envío (o su ausencia, sin red) al fallo correspondiente; null si salió bien. */
export async function falloDeRespuesta(res: Response | null): Promise<FalloDeEnvio | null> {
  if (!res) return { tipo: 'red' };
  if (res.ok) return null;
  if (res.status >= 500) return { tipo: 'servidor', status: res.status };
  let cuerpo: unknown = null;
  try {
    cuerpo = await res.json();
  } catch {
    cuerpo = null;
  }
  return { tipo: 'rechazo', motivo: motivoDelRechazo(cuerpo) };
}

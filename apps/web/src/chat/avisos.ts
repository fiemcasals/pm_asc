// HU-19 RF-10 — avisos del navegador cuando llega un mensaje nuevo del chat: cuándo avisar, cómo se arma el aviso, el permiso y la preferencia de cada dispositivo.
// Funcionan mientras la aplicación esté abierta en el navegador (la pestaña puede estar en segundo plano); con la aplicación cerrada no llega nada.

/** Lo que hace falta de un mensaje sin leer para avisar de él (lo que devuelve GET /api/chat/no-leidos). */
export interface ResumenMensajeNoLeido {
  id: string;
  emisorNombre: string;
  contenido: string;
  conFoto: boolean;
  creadoEn: string;
}

/** Una conversación con mensajes sin leer y el último que le llegó a la persona, de otra. */
export interface ConversacionNoLeida {
  sala: string;
  noLeidos: number;
  ultimoMensaje: ResumenMensajeNoLeido;
}

export interface RespuestaNoLeidos {
  total: number;
  conversaciones?: ConversacionNoLeida[];
}

/** El estado de los avisos en este dispositivo: activados, desactivados (se pueden activar), bloqueados por el navegador o no disponibles en él. */
export type EstadoAvisos = 'no-disponibles' | 'bloqueados' | 'desactivados' | 'activados';

/** Lo más largo que puede ser el comienzo del mensaje en el aviso. */
export const MAX_TEXTO_AVISO = 100;

/** Dónde se recuerda, en este dispositivo, si la persona activó los avisos (una clave por usuario). */
export const CLAVE_PREFERENCIA_AVISOS = 'mant_asc_chat_avisos';

export function textoDeEstado(estado: EstadoAvisos): string {
  switch (estado) {
    case 'activados':
      return 'Avisos del chat activados';
    case 'bloqueados':
      return 'Avisos del chat bloqueados';
    case 'no-disponibles':
      return 'Avisos del chat no disponibles';
    default:
      return 'Avisos del chat desactivados';
  }
}

export function ayudaDeEstado(estado: EstadoAvisos): string {
  switch (estado) {
    case 'bloqueados':
      return 'El navegador los bloqueó. Permitilos desde los ajustes del sitio para recibirlos. El chat y los contadores funcionan igual.';
    case 'no-disponibles':
      return 'Este navegador no admite avisos. El chat y los contadores funcionan igual.';
    case 'activados':
      return 'Te avisamos de los mensajes nuevos mientras la aplicación esté abierta.';
    default:
      return 'Para enterarte de los mensajes nuevos aunque estés en otra pestaña.';
  }
}

/** El comienzo de un texto para el aviso: una sola línea y como mucho `max` caracteres (con «…» si se cortó). */
export function recortarTexto(texto: string, max = MAX_TEXTO_AVISO): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

export interface Aviso {
  sala: string;
  titulo: string;
  cuerpo: string;
}

/** El aviso de una conversación: quién escribió y el comienzo de su mensaje (si era una foto, el texto que la acompaña; nunca la foto). */
export function armarAviso(conversacion: ConversacionNoLeida): Aviso {
  const { sala, ultimoMensaje } = conversacion;
  const nombre = ultimoMensaje.emisorNombre.trim() || 'Mensaje nuevo';
  return {
    sala,
    titulo: sala === 'global' ? `${nombre} · Grupo General` : nombre,
    cuerpo: recortarTexto(ultimoMensaje.contenido) || (ultimoMensaje.conFoto ? '📷 Foto' : 'Mensaje nuevo'),
  };
}

export interface ContextoDeAvisos {
  /** ¿La pestaña de la aplicación está a la vista? */
  visible: boolean;
  /** La conversación que la pantalla del chat tiene abierta, si la hay. */
  conversacionVista: string | null;
}

/**
 * Decide de qué conversaciones avisar. `previo` es lo que ya se conocía (el último mensaje de cada conversación con algo sin leer), o `null` la primera
 * vez: lo que ya estaba sin leer al abrir la aplicación se toma como base y no genera avisos, solo los mensajes que llegan después.
 * No se avisa de una conversación que se está mirando con la pestaña a la vista. Devuelve también la base nueva para la próxima vez.
 */
export function decidirAvisos(
  previo: Record<string, string> | null,
  conversaciones: ConversacionNoLeida[],
  contexto: ContextoDeAvisos,
): { avisos: ConversacionNoLeida[]; siguiente: Record<string, string> } {
  const siguiente: Record<string, string> = {};
  const avisos: ConversacionNoLeida[] = [];
  for (const c of conversaciones) {
    siguiente[c.sala] = c.ultimoMensaje.id;
    if (previo === null) continue;
    if (previo[c.sala] === c.ultimoMensaje.id) continue;
    if (contexto.visible && contexto.conversacionVista === c.sala) continue;
    avisos.push(c);
  }
  return { avisos, siguiente };
}

// --- La preferencia de este dispositivo (se recuerda por usuario)

export function leerPreferencia(usuarioId: string): boolean {
  try {
    return window.localStorage.getItem(`${CLAVE_PREFERENCIA_AVISOS}:${usuarioId}`) === '1';
  } catch {
    return false;
  }
}

export function guardarPreferencia(usuarioId: string, activa: boolean): void {
  try {
    const clave = `${CLAVE_PREFERENCIA_AVISOS}:${usuarioId}`;
    if (activa) window.localStorage.setItem(clave, '1');
    else window.localStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento (navegación privada): la preferencia vale hasta cerrar la pestaña
  }
}

// --- El navegador

function permisoDelNavegador(): NotificationPermission | null {
  return typeof Notification === 'undefined' ? null : Notification.permission;
}

/** El estado de los avisos de este usuario en este dispositivo, mirando lo que permite el navegador y lo que la persona eligió. */
export function estadoDeAvisos(usuarioId: string): EstadoAvisos {
  const permiso = permisoDelNavegador();
  if (permiso === null) return 'no-disponibles';
  if (permiso === 'denied') return 'bloqueados';
  return permiso === 'granted' && leerPreferencia(usuarioId) ? 'activados' : 'desactivados';
}

/**
 * Activa los avisos. SOLO se llama cuando la persona toca el botón: ahí recién se le pide permiso al navegador (si hace falta); nunca al cargar la página.
 */
export async function activarAvisos(usuarioId: string): Promise<EstadoAvisos> {
  if (permisoDelNavegador() === null) return 'no-disponibles';
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      // Un navegador viejo puede pedirlo con una función de retorno: se vuelve a mirar el permiso
    }
  }
  if (Notification.permission === 'denied') return 'bloqueados';
  if (Notification.permission !== 'granted') return 'desactivados';
  guardarPreferencia(usuarioId, true);
  return 'activados';
}

/** Desactiva los avisos de este usuario en este dispositivo (el permiso del navegador no se toca). */
export function desactivarAvisos(usuarioId: string): EstadoAvisos {
  guardarPreferencia(usuarioId, false);
  return estadoDeAvisos(usuarioId);
}

/**
 * Muestra el aviso. Si la aplicación tiene service worker lo muestra por ahí (en Chrome de Android no hay otra forma, y al tocarlo el service worker
 * abre la conversación); si no, con el aviso de la página. Una conversación tiene un solo aviso: el siguiente reemplaza al anterior (mismo `tag`).
 */
export async function mostrarAviso(aviso: Aviso, alTocar: (sala: string) => void): Promise<void> {
  const opciones = {
    body: aviso.cuerpo,
    tag: `chat-${aviso.sala}`,
    renotify: true,
    lang: 'es-AR',
    data: { tipo: 'chat', sala: aviso.sala },
  } as NotificationOptions;
  try {
    const registro = typeof navigator !== 'undefined' && navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registro && registro.active) {
      await registro.showNotification(aviso.titulo, opciones);
      return;
    }
  } catch {
    // Se prueba con el aviso de la página
  }
  try {
    const n = new Notification(aviso.titulo, opciones);
    n.onclick = () => {
      window.focus();
      alTocar(aviso.sala);
      n.close();
    };
  } catch {
    // El navegador no deja crear avisos desde la página: no se avisa y todo lo demás sigue igual
  }
}

/** La conversación pedida en la dirección (`/?chat=<sala>`), que es como la abre el service worker cuando la aplicación estaba cerrada. */
export function salaDeLaDireccion(busqueda: string): string | null {
  const sala = new URLSearchParams(busqueda).get('chat');
  return sala !== null && (sala === 'global' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sala)) ? sala.toLowerCase() : null;
}

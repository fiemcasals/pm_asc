// HU-19 RF-09 — lo no leído del chat: cómo se muestra el contador, cómo queda el título de la pestaña del navegador y cómo se ordena la lista.

/** Cada cuántos milisegundos se pregunta cuántos mensajes sin leer hay en total (el menú y el título de la pestaña). */
export const INTERVALO_NO_LEIDOS_MS = 8000;

/** Cada cuántos milisegundos se actualiza la lista de conversaciones con la pantalla del chat abierta. */
export const INTERVALO_CANALES_MS = 5000;

/** Desde cuántos mensajes el contador dice «99+» en vez del número. */
export const MAX_CONTADOR = 99;

/** El evento con el que la pantalla del chat avisa que cambió lo leído, para que el menú y el título se actualicen enseguida. */
export const EVENTO_LECTURAS = 'chat:lecturas';

/** Lo que dice un contador: vacío si no hay nada sin leer, el número hasta 99 y «99+» desde ahí. */
export function textoContador(cantidad: number): string {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return '';
  return cantidad > MAX_CONTADOR ? `${MAX_CONTADOR}+` : String(Math.floor(cantidad));
}

/** El título de la pestaña del navegador con el total sin leer por delante: «(3) mant_asc · …». Sin nada sin leer, el título solo. */
export function tituloConNoLeidos(titulo: string, total: number): string {
  const contador = textoContador(total);
  return contador ? `(${contador}) ${titulo}` : titulo;
}

/** El título sin el contador, para volver a ponérselo con el total nuevo. */
export function tituloBase(titulo: string): string {
  return titulo.replace(/^\(\d+\+?\)\s/, '');
}

/** Pone primero la conversación con el mensaje más reciente; las que todavía no tienen mensajes quedan al final, en su orden de siempre. */
export function ordenarCanales<T extends { ultimoMensajeHora?: string | null }>(canales: T[]): T[] {
  const conMensajes = canales.filter((c) => !!c.ultimoMensajeHora);
  const sinMensajes = canales.filter((c) => !c.ultimoMensajeHora);
  return [...conMensajes].sort((a, b) => (a.ultimoMensajeHora! < b.ultimoMensajeHora! ? 1 : a.ultimoMensajeHora! > b.ultimoMensajeHora! ? -1 : 0)).concat(sinMensajes);
}

/** Avisa a toda la aplicación que cambió lo leído (la pantalla del chat marcó una conversación). */
export function avisarCambioDeLecturas(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_LECTURAS));
}

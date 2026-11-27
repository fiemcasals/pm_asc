import type { MensajeChat } from './ChatOperativoView';

// HU-19 RF-02 — el hilo de una conversación: cómo se juntan los mensajes que llegan con los que ya se ven, y cuándo se está «al final».

/** Hasta cuántos píxeles antes del final se considera que la persona está al final del hilo (y no leyendo mensajes anteriores). */
export const MARGEN_AL_FINAL = 80;

/** ¿La persona está al final del hilo? Se usa para decidir si un mensaje nuevo la lleva abajo o solo le avisa. */
export function estaAlFinal(scrollTop: number, clientHeight: number, scrollHeight: number, margen = MARGEN_AL_FINAL): boolean {
  return scrollHeight - scrollTop - clientHeight <= margen;
}

/**
 * Junta lo que ya se ve con la ventana de los mensajes más nuevos que trae la actualización automática.
 * - La ventana manda para lo reciente; lo anterior a ella que ya se había cargado («Ver mensajes anteriores») se conserva.
 * - Si no cambió nada devuelve la MISMA lista (para no volver a dibujar ni mover el hilo).
 * - `nuevos` son los mensajes de la ventana que antes no se veían.
 */
export function fusionarVentana(actuales: MensajeChat[], ventana: MensajeChat[]): { lista: MensajeChat[]; nuevos: MensajeChat[] } {
  if (ventana.length === 0) return { lista: actuales, nuevos: [] };
  const enVentana = new Set(ventana.map((m) => m.id));
  const vistos = new Set(actuales.map((m) => m.id));
  const primero = ventana[0].creadoEn;
  const anteriores = actuales.filter((m) => !enVentana.has(m.id) && m.creadoEn <= primero);
  const lista = [...anteriores, ...ventana];
  const nuevos = ventana.filter((m) => !vistos.has(m.id));
  const igual = lista.length === actuales.length && lista.every((m, i) => m.id === actuales[i].id);
  return { lista: igual ? actuales : lista, nuevos };
}

/** Agrega al principio los mensajes anteriores que se pidieron, sin repetir ninguno de los que ya se ven. */
export function sumarAnteriores(actuales: MensajeChat[], anteriores: MensajeChat[]): MensajeChat[] {
  const vistos = new Set(actuales.map((m) => m.id));
  const faltan = anteriores.filter((m) => !vistos.has(m.id));
  return faltan.length === 0 ? actuales : [...faltan, ...actuales];
}

/** Suma un mensaje propio recién enviado, salvo que la actualización automática ya lo haya traído. */
export function sumarPropio(actuales: MensajeChat[], propio: MensajeChat): MensajeChat[] {
  return actuales.some((m) => m.id === propio.id) ? actuales : [...actuales, propio];
}

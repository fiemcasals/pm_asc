// HU-19 RF-07 — la etiqueta de edificio de un mensaje del chat: se elige para cada mensaje y la ve todo el que lo lee.

/** Lo más larga que puede ser la referencia de la máquina. Es el mismo número que valida la API (LIMITE_MAQUINA en api/src/chat/chat.types.ts). */
export const MAX_CARACTERES_MAQUINA = 40;

/** Lo que dice la etiqueta de un mensaje: «📍 edificio» y, si se indicó, «· Ascensor M1». Sin edificio, no hay etiqueta. */
export function textoDeEtiqueta(edificioNombre: string | null | undefined, maquinaRef: string | null | undefined): string | null {
  const edificio = edificioNombre?.trim();
  if (!edificio) return null;
  const maquina = maquinaRef?.trim();
  return maquina ? `📍 ${edificio} · Ascensor ${maquina}` : `📍 ${edificio}`;
}

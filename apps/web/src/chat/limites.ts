// Lo más largo que puede ser el texto de un mensaje del chat. Es el mismo número que valida la API (LIMITE_CONTENIDO en api/src/chat/chat.types.ts):
// la caja de texto no deja escribir más, para que nadie pierda un mensaje largo por un rechazo del servidor. HU-19 RF-04.
export const MAX_CARACTERES_MENSAJE = 2000;

// HU-19 RF-05 — las fotos del chat se reducen en el dispositivo antes de enviarlas.
/** El lado mayor de una foto enviada, en píxeles: lo que saca un celular (4000 × 3000) se envía a 1600 × 1200. */
export const LADO_MAXIMO_FOTO = 1600;
/** Lo que se busca que pese la foto enviada: menos de 500 KB. Si con la mejor calidad pesa más, se prueba con una calidad menor. */
export const OBJETIVO_FOTO_BYTES = 500 * 1000;
/** Lo más que puede pesar la foto, ya reducida: 600 KB. Es el mismo número que valida la API (LIMITE_FOTO_BYTES en api/src/chat/chat.types.ts). */
export const LIMITE_FOTO_BYTES = 600 * 1024;

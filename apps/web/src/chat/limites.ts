// Lo más largo que puede ser el texto de un mensaje del chat. Es el mismo número que valida la API (LIMITE_CONTENIDO en api/src/chat/chat.types.ts):
// la caja de texto no deja escribir más, para que nadie pierda un mensaje largo por un rechazo del servidor. HU-19 RF-04.
export const MAX_CARACTERES_MENSAJE = 2000;

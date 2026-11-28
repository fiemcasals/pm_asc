import { BadRequestException } from '@nestjs/common';
import { CrearMensajeDto, LIMITE_CONTENIDO, LIMITE_FOTO_BYTES, LIMITE_MAQUINA } from './chat.types';

// HU-19 RF-04 — lo que entra por la API del chat se valida en la puerta: lo que no corresponde se rechaza con 400 y un mensaje que lo explica,
// en vez de llegar a la base (y fallar con un 500) o guardarse tal cual. Las reglas que dependen de los datos (¿existe el destinatario?,
// ¿es contacto?, ¿existe el edificio?) las aplica ChatService.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Solo imágenes en base64 de los formatos que el navegador sabe mostrar. Un SVG podría llevar scripts; `javascript:` o `http://` no son imágenes guardadas.
const IMAGEN = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID.test(valor);

/** Cuántos bytes ocupa la imagen de un `data:...;base64,...` una vez decodificada (HU-19 RF-05). */
export function bytesDeImagen(dataUrl: string): number {
  const datos = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const relleno = datos.endsWith('==') ? 2 : datos.endsWith('=') ? 1 : 0;
  return Math.floor((datos.length * 3) / 4) - relleno;
}

/** Separa un `data:image/...;base64,...` guardado en el tipo de imagen y sus bytes, para servirlo como archivo (HU-19 RF-05). */
export function decodificarImagen(dataUrl: string): { tipo: string; datos: Buffer } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/s.exec(dataUrl);
  return m ? { tipo: m[1], datos: Buffer.from(m[2], 'base64') } : null;
}

const sinValor = (valor: unknown): boolean => valor === undefined || valor === null || valor === '';

/** La conversación que se pide: «global» o el identificador del compañero con quien se habla. */
export function validarSala(sala: unknown): string {
  if (sala === undefined || sala === null || sala === '') return 'global';
  if (typeof sala === 'string' && (sala === 'global' || esUuid(sala))) return sala;
  throw new BadRequestException('La conversación pedida no es válida: tiene que ser «global» o el identificador de un compañero.');
}

/** Un mensaje que llega para enviar, con sus campos en el tipo y el formato correctos. */
export function validarMensaje(cuerpo: unknown): CrearMensajeDto {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new BadRequestException('El mensaje tiene que ser un objeto con el tipo de sala y el contenido.');
  }
  const c = cuerpo as Record<string, unknown>;

  if (c.tipoSala !== 'global' && c.tipoSala !== 'directo') {
    throw new BadRequestException('El tipo de sala tiene que ser «global» o «directo».');
  }

  let contenido = '';
  if (c.contenido !== undefined && c.contenido !== null) {
    if (typeof c.contenido !== 'string') throw new BadRequestException('El contenido del mensaje tiene que ser texto.');
    if (c.contenido.trim().length > LIMITE_CONTENIDO) {
      throw new BadRequestException(`El mensaje no puede superar los ${LIMITE_CONTENIDO} caracteres.`);
    }
    contenido = c.contenido;
  }

  // Si falta el destinatario de un privado lo dice ChatService («debes seleccionar un destinatario»); acá solo se exige que, si viene, sea un identificador.
  let destinatarioId: string | null = null;
  if (c.tipoSala === 'directo' && !sinValor(c.destinatarioId)) {
    if (!esUuid(c.destinatarioId)) throw new BadRequestException('El destinatario no es un identificador válido.');
    destinatarioId = c.destinatarioId;
  }

  let adjuntoUrl: string | null = null;
  if (!sinValor(c.adjuntoUrl)) {
    if (typeof c.adjuntoUrl !== 'string' || !IMAGEN.test(c.adjuntoUrl)) {
      throw new BadRequestException('El adjunto tiene que ser una imagen PNG, JPEG o WEBP.');
    }
    // HU-19 RF-05: la foto ya llega reducida desde la pantalla; si aun así pesa más que el tope, no se guarda.
    if (bytesDeImagen(c.adjuntoUrl) > LIMITE_FOTO_BYTES) {
      throw new BadRequestException(`La foto es demasiado pesada: puede pesar hasta ${Math.round(LIMITE_FOTO_BYTES / 1024)} KB.`);
    }
    adjuntoUrl = c.adjuntoUrl;
  }

  let consorcioId: string | null = null;
  if (!sinValor(c.consorcioId)) {
    if (!esUuid(c.consorcioId)) throw new BadRequestException('El edificio elegido no es válido.');
    consorcioId = c.consorcioId;
  }

  let maquinaRef: string | null = null;
  if (!sinValor(c.maquinaRef)) {
    if (typeof c.maquinaRef !== 'string' || c.maquinaRef.length > LIMITE_MAQUINA) {
      throw new BadRequestException(`La referencia de la máquina tiene que ser un texto de hasta ${LIMITE_MAQUINA} caracteres.`);
    }
    maquinaRef = c.maquinaRef;
  }

  return { tipoSala: c.tipoSala, destinatarioId, contenido, adjuntoUrl, consorcioId, maquinaRef };
}

/** Una lectura: la conversación (`global` o el identificador de un compañero, nunca vacía) y el mensaje hasta el que se leyó. HU-19 RF-09. */
export function validarLectura(cuerpo: unknown): { sala: string; hasta: string } {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new BadRequestException('La lectura tiene que ser un objeto con la conversación y el mensaje leído.');
  }
  const c = cuerpo as Record<string, unknown>;
  if (c.sala === undefined || c.sala === null || c.sala === '') throw new BadRequestException('Falta indicar la conversación leída.');
  const sala = validarSala(c.sala);
  if (!esUuid(c.hasta)) throw new BadRequestException('El mensaje leído no es un identificador válido.');
  return { sala, hasta: c.hasta };
}

import { ArgumentsHost, BadRequestException, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * Códigos SQLSTATE de PostgreSQL que significan "el texto que mandó el cliente no se puede
 * guardar", y que por lo tanto son un 400 y no un 500:
 * - 22021 character_not_in_repertoire: el byte 0x00 (carácter NUL) o una secuencia UTF-8 inválida.
 * - 22P05 untranslatable_character: un carácter que la codificación de la base no puede representar.
 *
 * La lista es corta a propósito. Otros errores de datos (por ejemplo 22003, número fuera de rango)
 * pueden ser un error de programación nuestro: convertirlos en 400 lo escondería.
 */
export const SQLSTATE_TEXTO_INVALIDO: ReadonlySet<string> = new Set(['22021', '22P05']);

export const MENSAJE_TEXTO_INVALIDO =
  'El contenido enviado incluye caracteres que no se pueden guardar, como el carácter nulo (U+0000). ' +
  'Revisá los textos y volvé a enviar.';

export function esErrorDeTextoInvalido(error: unknown): error is { code: string; message: string } {
  if (error instanceof HttpException) return false;
  if (typeof error !== 'object' || error === null) return false;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' && SQLSTATE_TEXTO_INVALIDO.has(code);
}

/**
 * Filtro global: traduce a 400 los errores de PostgreSQL por texto con codificación inválida,
 * en cualquier endpoint. Todo lo demás sigue el camino de siempre (los HttpException con su
 * código y cualquier otro error como 500).
 *
 * El texto del error de PostgreSQL va al log y nunca a la respuesta. El cuerpo tiene el mismo
 * formato que el resto de las validaciones: `{ message: 'Datos inválidos', errores: [...] }`.
 */
@Catch()
export class TextoInvalidoFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(TextoInvalidoFilter.name);

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (!esErrorDeTextoInvalido(exception)) {
      super.catch(exception, host);
      return;
    }
    this.logger.warn(
      `Texto con codificación inválida rechazado (SQLSTATE ${exception.code}): ${exception.message}`,
    );
    super.catch(
      new BadRequestException({ message: 'Datos inválidos', errores: [MENSAJE_TEXTO_INVALIDO] }),
      host,
    );
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { MensajeAlertaWhatsAppInput } from './whatsapp.types';

/** Largo máximo de un parámetro de plantilla. */
export const LARGO_MAXIMO_PARAMETRO = 1024;

/** Deja un valor listo para ser parámetro de una plantilla: Meta rechaza saltos de línea, tabulaciones y más de 4 espacios seguidos (HU-11 RF-08). */
export function limpiarParametroPlantilla(valor: string): string {
  return valor
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {5,}/g, ' ')
    .trim()
    .slice(0, LARGO_MAXIMO_PARAMETRO)
    .trim();
}

@Injectable()
export class WhatsAppFormatterService {
  /**
   * Los 5 valores de la plantilla del aviso, en este orden: edificio, equipo, estado, detalle y enlace del
   * informe. Valida lo mismo que el texto formal. Sin enlace, la variable lleva un guion: Meta no admite vacías.
   */
  parametrosPlantilla(input: MensajeAlertaWhatsAppInput): string[] {
    this.formatearAlerta(input);
    return [
      input.consorcio,
      input.equipo,
      input.estado,
      input.detalle,
      input.remitoUrl && input.remitoUrl.trim() ? input.remitoUrl : '-',
    ].map(limpiarParametroPlantilla);
  }

  /**
   * Formatea un mensaje formal de alerta crítica con plantilla institucional MAICON S.R.L.
   * Requiere estrictamente: nombreEca, consorcio, estado, equipo y detalle.
   */
  formatearAlerta(input: MensajeAlertaWhatsAppInput): string {
    if (!input) {
      throw new BadRequestException('El cuerpo del mensaje no puede ser nulo o vacío');
    }
    if (!input.nombreEca || input.nombreEca.trim() === '') {
      throw new BadRequestException('El nombre de la ECA es obligatorio');
    }
    if (!input.consorcio || input.consorcio.trim() === '') {
      throw new BadRequestException('El consorcio o edificio es obligatorio');
    }
    if (!input.estado || input.estado.trim() === '') {
      throw new BadRequestException('El estado operativo del equipo es obligatorio');
    }
    if (!input.equipo || input.equipo.trim() === '') {
      throw new BadRequestException('La identificación del equipo es obligatoria');
    }
    if (!input.detalle || input.detalle.trim() === '') {
      throw new BadRequestException('El detalle de la anomalía técnica es obligatorio');
    }

    const fecha = input.fechaDeteccion
      ? new Date(input.fechaDeteccion).toLocaleString('es-AR')
      : new Date().toLocaleString('es-AR');

    const remitoSeccion = input.remitoUrl
      ? `\n🔗 *Informe y Fotos:* ${input.remitoUrl}`
      : '';

    return [
      `🚨 *NOTIFICACIÓN DE ALERTA CRÍTICA - MAICON S.R.L.* 🚨`,
      `--------------------------------------------------`,
      `🏢 *Empresa Conservadora (ECA):* ${input.nombreEca.trim()}`,
      `📍 *Consorcio / Edificio:* ${input.consorcio.trim()}`,
      `🛗 *Equipo:* ${input.equipo.trim()}`,
      `⚠️ *Estado:* ${input.estado.trim().toUpperCase()}`,
      `--------------------------------------------------`,
      `📝 *Detalle:*`,
      `${input.detalle.trim()}${remitoSeccion}`,
      `⏱️ *Fecha/Hora:* ${fecha}`,
      `--------------------------------------------------`,
      `_Aviso legal automático generado conforme ordenanza AGC._`,
    ].join('\n');
  }
}


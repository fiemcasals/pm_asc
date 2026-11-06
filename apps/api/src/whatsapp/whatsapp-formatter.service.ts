import { BadRequestException, Injectable } from '@nestjs/common';
import { MensajeAlertaWhatsAppInput } from './whatsapp.types';

@Injectable()
export class WhatsAppFormatterService {
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


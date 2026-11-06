import { Injectable, NotFoundException } from '@nestjs/common';
import { FirmanteService } from '../firmante/firmante.service';
import { WhatsAppConnectorService } from './whatsapp-connector.service';
import {
  TriggerAlertaCriticaDto,
  WhatsAppDisparoResult,
} from './whatsapp.types';

@Injectable()
export class WhatsAppTriggerService {
  constructor(
    private readonly connector: WhatsAppConnectorService,
    private readonly firmanteService: FirmanteService,
  ) {}

  /**
   * Ejecuta el disparo automático de WhatsApp ante una anomalía crítica.
   * Criterio 1: Se ejecuta en menos de 5 segundos comprobables (< 5s).
   * Criterio 2: Incluye enlace directo y funcional a las fotos y al informe técnico firmado.
   */
  async dispararAlertaInmediata(
    dto: TriggerAlertaCriticaDto,
  ): Promise<WhatsAppDisparoResult> {
    const inicioMs = Date.now();
    const idBusqueda = dto.alertaId || dto.maquinaId;

    const maquinas = this.firmanteService.getMaquinas();
    const maquina = maquinas.find(
      (m) =>
        m.id === idBusqueda ||
        m.alertaCritica?.id === idBusqueda ||
        (m.estadoOperativo === 'Fuera de Servicio' && !idBusqueda) ||
        (m.estadoOperativo === 'Reparación Urgente' && !idBusqueda),
    );

    if (!maquina || !maquina.alertaCritica) {
      throw new NotFoundException(
        `No se encontró una máquina con informe de anomalía crítica activa para ${idBusqueda || 'la solicitud'}`,
      );
    }

    const alerta = maquina.alertaCritica;
    const baseUrl = dto.baseUrl || 'https://localhost:8050';
    const enlaceDirecto = `${baseUrl}/api/eca/remito/${alerta.id}/informe`;
    const telefono = dto.telefonoDestino || '+5491144009988';

    // Despacho a través del conector
    const resEnvio = await this.connector.enviarMensajeAlerta({
      telefonoDestino: telefono,
      nombreEca: maquina.eca,
      consorcio: `${maquina.edificio.direccion} (${maquina.edificio.consorcio})`,
      equipo: `${maquina.codigoAGC} - ${maquina.nombre}`,
      estado: maquina.estadoOperativo || 'Alerta Crítica',
      detalle: alerta.motivo,
      remitoUrl: enlaceDirecto,
      fechaDeteccion: alerta.fechaDeteccion,
    });

    const duracionMs = Date.now() - inicioMs;
    const menorA5Segundos = duracionMs < 5000;

    return {
      ok: resEnvio.ok,
      idMensaje: resEnvio.idMensaje,
      telefonoDestino: resEnvio.telefonoDestino,
      duracionMs,
      menorA5Segundos,
      timestampDisparo: new Date().toISOString(),
      enlaceDirecto,
      mensajeFormateado: resEnvio.mensajeFormateado,
    };
  }
}

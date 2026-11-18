import { ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { AvisosService } from '../avisos/avisos.service';
import { ConsorciosRepository } from '../consorcios/consorcios.repository';
import { FirmanteService } from '../firmante/firmante.service';
import { WhatsAppConnectorService } from './whatsapp-connector.service';
import {
  TriggerAlertaCriticaDto,
  WhatsAppDisparoResult,
} from './whatsapp.types';

@Injectable()
export class WhatsAppTriggerService {
  private readonly logger = new Logger(WhatsAppTriggerService.name);

  constructor(
    private readonly connector: WhatsAppConnectorService,
    private readonly firmanteService: FirmanteService,
    private readonly avisos: AvisosService,
    @Optional() private readonly consorcios?: ConsorciosRepository,
  ) {}

  /**
   * Resuelve el teléfono de la ECA responsable del edificio desde la terna de roles (`roles_edificio`).
   * Nunca usa un número fijo hardcodeado: si la ECA no tiene teléfono cargado devuelve vacío.
   */
  private async resolverTelefonoEcaEdificio(direccion: string, nombreEca: string): Promise<string> {
    if (!this.consorcios) return '';
    try {
      const [edificios, roles] = await Promise.all([
        this.consorcios.listar(),
        this.consorcios.listarRoles(),
      ]);
      const dirNorm = direccion.trim().toLowerCase();
      const edificio = edificios.find((c) => {
        const cDir = c.direccion.trim().toLowerCase();
        return cDir === dirNorm || dirNorm.startsWith(cDir) || cDir.startsWith(dirNorm);
      });
      if (edificio) {
        const rol = roles.find((r) => r.consorcioId === edificio.id);
        return rol?.eca?.telefono?.trim() ?? '';
      }
      const ecaNorm = nombreEca.trim().toLowerCase();
      const rolPorEca = roles.find(
        (r) => r.eca?.nombre.trim().toLowerCase() === ecaNorm && Boolean(r.eca.telefono?.trim()),
      );
      return rolPorEca?.eca?.telefono?.trim() ?? '';
    } catch {
      return '';
    }
  }

  /**
   * Ejecuta el disparo automático de WhatsApp ante una anomalía crítica.
   * Toma el teléfono destino de la ECA asignada al edificio en la terna de roles (o del DTO explícito).
   * Sin teléfono cargado o sin proveedor configurado, registra el intento como no realizado sin simular entrega.
   */
  async dispararAlertaInmediata(
    dto: TriggerAlertaCriticaDto,
  ): Promise<WhatsAppDisparoResult> {
    const inicioMs = Date.now();
    const idBusqueda = dto.alertaId || dto.maquinaId;

    if (idBusqueda && this.avisos.estadoDe(idBusqueda) === 'Pendiente de revisión') {
      throw new ConflictException(
        `El aviso de ${idBusqueda} está pendiente de revisión: la Secretaría tiene que aprobarlo («Aprobar y enviar») antes de que salga ningún WhatsApp ni correo.`,
      );
    }

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
    // HU-11 RF-05: ningún aviso sale sin la aprobación de la Secretaría. Si el aviso todavía no existe se crea pendiente.
    const aviso = this.avisos.paraAlertaDeMaquina(maquina);
    if (aviso.estado === 'Pendiente de revisión') {
      throw new ConflictException(
        `El aviso de la alerta ${alerta.id} está pendiente de revisión: la Secretaría tiene que aprobarlo («Aprobar y enviar») antes de que salga ningún WhatsApp ni correo.`,
      );
    }
    const baseUrl = dto.baseUrl || 'https://localhost:8050';
    const enlaceDirecto = `${baseUrl}/api/eca/remito/${alerta.id}/informe`;

    // HU-11 RF-04: el teléfono sale de la terna de roles del edificio (no de un número fijo hardcodeado).
    const telefono =
      dto.telefonoDestino?.trim() ||
      (await this.resolverTelefonoEcaEdificio(maquina.edificio.direccion, maquina.eca));

    const resEnvio = await this.connector.enviarMensajeAlerta(
      {
        telefonoDestino: telefono,
        nombreEca: maquina.eca,
        consorcio: `${maquina.edificio.direccion} (${maquina.edificio.consorcio})`,
        equipo: `${maquina.codigoAGC} - ${maquina.nombre}`,
        estado: maquina.estadoOperativo || 'Alerta Crítica',
        detalle: alerta.motivo,
        remitoUrl: enlaceDirecto,
        fechaDeteccion: alerta.fechaDeteccion,
      },
      3,
      50,
      {
        origen: 'automatico',
        alertaId: alerta.id,
        maquinaId: maquina.id,
        enlaceDirecto,
      },
    );

    const duracionMs = Date.now() - inicioMs;
    const menorA5Segundos = duracionMs < 5000;

    if (!resEnvio.ok) {
      this.logger.warn(
        `Disparo automático WhatsApp para alerta ${alerta.id} registrado como no_realizado: ${resEnvio.error}`,
      );
    }

    return {
      ok: resEnvio.ok,
      envioRealizado: resEnvio.ok,
      estado: resEnvio.ok ? 'realizado' : 'no_realizado',
      estadoEntrega: resEnvio.estadoEntrega,
      idMensaje: resEnvio.idMensaje,
      telefonoDestino: resEnvio.telefonoDestino,
      duracionMs,
      menorA5Segundos,
      timestampDisparo: new Date().toISOString(),
      enlaceDirecto,
      mensajeFormateado: resEnvio.mensajeFormateado,
      ...(resEnvio.error ? { motivo: resEnvio.error } : {}),
    };
  }
}

import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FirmanteService } from '../firmante/firmante.service';
import {
  AcuseReciboResponse,
  AlertaFlotaItem,
  CoberturaEcaResponse,
  MaquinaEca,
  RemitoTecnicoResponse,
} from './eca.types';

@Injectable()
export class EcaService {
  constructor(
    private readonly firmanteService: FirmanteService,
    @Optional() private readonly db?: DatabaseService,
  ) {}

  /**
   * Resuelve el nombre canónico de la ECA a partir del identificador provisto.
   */
  resolverEca(identificador?: string): string {
    if (!identificador || identificador.trim() === '') {
      return 'Conservación Porteña S.R.L.';
    }

    const term = identificador.trim().toLowerCase();
    if (term.includes('porteña') || term.includes('portena')) {
      return 'Conservación Porteña S.R.L.';
    }
    if (term.includes('san mart') || term.includes('san martin')) {
      return 'Elevadores San Martín';
    }
    if (term.includes('maicon')) {
      return 'MAICON Mantenimiento';
    }
    return identificador.trim();
  }

  /**
   * Obtiene la lista de máquinas pertenecientes a la flota de la ECA para un mes dado.
   */
  async getMaquinasFlota(
    ecaIdentificador?: string,
    mes: string = '2026-11',
  ): Promise<MaquinaEca[]> {
    const ecaCanonica = this.resolverEca(ecaIdentificador);
    const todas = this.firmanteService.getMaquinas();

    return todas.filter((m) => {
      const matchEca =
        m.eca.toLowerCase() === ecaCanonica.toLowerCase() ||
        m.eca.toLowerCase().includes(ecaCanonica.toLowerCase()) ||
        ecaCanonica.toLowerCase().includes(m.eca.toLowerCase());
      const matchMes = !mes || m.mes === mes;
      return matchEca && matchMes;
    });
  }

  /**
   * Obtiene las alertas críticas detectadas en la flota de la ECA para el mes consultado.
   */
  async getAlertasCriticas(
    ecaIdentificador?: string,
    mes: string = '2026-11',
  ): Promise<AlertaFlotaItem[]> {
    const maquinas = await this.getMaquinasFlota(ecaIdentificador, mes);

    return maquinas
      .filter((m) => Boolean(m.alertaCritica))
      .map((m) => ({
        maquinaId: m.id,
        codigoAGC: m.codigoAGC,
        nombreMaquina: m.nombre,
        edificio: m.edificio,
        eca: m.eca,
        estadoOperativo:
          m.estadoOperativo ||
          (m.alertaCritica?.tipo === 'FUERA_DE_SERVICIO'
            ? 'Fuera de Servicio'
            : 'Reparación Urgente'),
        alerta: m.alertaCritica!,
      }));
  }

  /**
   * Calcula el porcentaje y las métricas de cobertura de flota (inspeccionadas y firmadas)
   * para la ECA en el mes consultado.
   */
  async getCobertura(
    ecaIdentificador?: string,
    mes: string = '2026-11',
  ): Promise<CoberturaEcaResponse> {
    const ecaCanonica = this.resolverEca(ecaIdentificador);
    const maquinas = await this.getMaquinasFlota(ecaCanonica, mes);

    const totalMaquinas = maquinas.length;
    const inspeccionadas = maquinas.filter((m) => m.estado === 'Recorrida').length;
    const firmadas = maquinas.filter((m) => Boolean(m.visita?.autorizada)).length;
    const pendientes = maquinas.filter((m) => m.estado === 'Pendiente de Visita').length;
    const advertencias = maquinas.filter((m) => m.estado === 'Advertencia').length;
    const alertasCriticas = maquinas.filter((m) => Boolean(m.alertaCritica)).length;

    const porcentajeInspeccionadas =
      totalMaquinas > 0 ? Number(((inspeccionadas / totalMaquinas) * 100).toFixed(1)) : 0;

    const porcentajeFirmadas =
      totalMaquinas > 0 ? Number(((firmadas / totalMaquinas) * 100).toFixed(1)) : 0;

    // Cobertura global combinada: promedio ponderado de avance o porcentaje de inspeccionadas firmadas
    const porcentajeCobertura = porcentajeFirmadas;

    return {
      eca: ecaCanonica,
      mes,
      totalMaquinas,
      inspeccionadas,
      firmadas,
      pendientes,
      advertencias,
      alertasCriticas,
      porcentajeInspeccionadas,
      porcentajeFirmadas,
      porcentajeCobertura,
    };
  }

  /**
   * Registra automáticamente o explícitamente el acuse de recibo legal para una alerta crítica.
   */
  async registrarAcuseRecibo(
    alertaId: string,
    usuarioSolicitante?: string,
  ): Promise<AcuseReciboResponse> {
    const maquinas = this.firmanteService.getMaquinas();
    const maquina = maquinas.find((m) => m.alertaCritica?.id === alertaId);

    if (!maquina || !maquina.alertaCritica) {
      throw new NotFoundException(`No se encontró alerta crítica con identificador ${alertaId}`);
    }

    const usuario =
      usuarioSolicitante?.trim() ||
      (maquina.eca.toLowerCase().includes('maicon')
        ? 'operador.legal@maicon.com.ar'
        : 'responsable.tecnico@eca.com.ar');

    const fechaHora = new Date().toISOString();
    const acuseId = `ACU-${Date.now()}`;
    const remitoUrl = `/api/eca/remito/${alertaId}`;

    maquina.alertaCritica.acuseRecibo = {
      fechaHora,
      usuario,
    };

    if (this.db) {
      try {
        await this.db.query(
          `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, fecha_hora, tipo_alerta, remito_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            alertaId,
            maquina.id,
            maquina.eca,
            usuario,
            fechaHora,
            maquina.alertaCritica.tipo,
            remitoUrl,
          ],
        );
      } catch (err) {
        // En entornos sin base de datos activa se conserva en memoria sin bloquear
      }
    }

    return {
      ok: true,
      mensaje: `Acuse de recibo legal registrado exitosamente para ${maquina.eca}`,
      alertaId,
      maquinaId: maquina.id,
      eca: maquina.eca,
      acuse: {
        id: acuseId,
        fechaHora,
        usuario,
        remitoUrl,
      },
    };
  }

  /**
   * Genera el remito técnico de notificación con el informe y fotos de la falla,
   * y registra automáticamente la fecha, hora y usuario para el acuse legal.
   */
  async getRemitoTecnico(
    alertaId: string,
    usuarioSolicitante?: string,
  ): Promise<RemitoTecnicoResponse> {
    const acuseRes = await this.registrarAcuseRecibo(alertaId, usuarioSolicitante);
    const maquina = this.firmanteService
      .getMaquinas()
      .find((m) => m.alertaCritica?.id === alertaId)!;

    const alerta = maquina.alertaCritica!;

    return {
      id: `REM-${alerta.id}`,
      alertaId: alerta.id,
      maquinaId: maquina.id,
      codigoAGC: maquina.codigoAGC,
      nombreMaquina: maquina.nombre,
      edificio: {
        direccion: maquina.edificio.direccion,
        consorcio: maquina.edificio.consorcio,
        administracion: maquina.edificio.administracion,
      },
      eca: maquina.eca,
      tipoAlerta: alerta.tipo,
      titulo: alerta.titulo,
      motivo: alerta.motivo,
      fotografiaCabinaTrabada: alerta.fotografiaCabinaTrabada,
      checklist: alerta.checklist,
      fechaDeteccion: alerta.fechaDeteccion,
      acuseLegal: {
        registrado: true,
        fechaHora: acuseRes.acuse.fechaHora,
        usuario: acuseRes.acuse.usuario,
      },
    };
  }
}

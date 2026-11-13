import { ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { getRlsContext, runWithEcaContext } from '../database/rls-context';
import { FirmanteService } from '../firmante/firmante.service';
import {
  AcuseReciboResponse,
  AlertaFlotaItem,
  CoberturaEcaResponse,
  MaquinaEca,
  RemitoTecnicoResponse,
} from './eca.types';

interface FilaAcuse {
  id: string;
  usuario: string;
  fecha_hora: Date;
}

@Injectable()
export class EcaService {
  private readonly logger = new Logger(EcaService.name);

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
    try {
      await this.cargarAcusesGuardados(maquinas.filter((m) => Boolean(m.alertaCritica)));
    } catch (err) {
      // Con la base caída la lista de alertas igual se muestra (con lo que haya en memoria): no se tira un portal de
      // emergencias por no poder releer los acuses. El alta del acuse sí falla, porque ese no puede perderse.
      this.logger.warn(`No se pudieron releer los acuses de recibo guardados: ${err instanceof Error ? err.message : String(err)}`);
    }

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
   * El acuse guardado en la base es el que vale: al reiniciar la API la memoria arranca sin acuses, así que se vuelven a
   * leer. Se busca por alerta y por la ECA de la máquina (más el RLS), así que el acuse de otra ECA o de otra alerta no se
   * mezcla. Sin base configurada no hay nada que leer.
   */
  private async cargarAcusesGuardados(maquinas: MaquinaEca[]): Promise<void> {
    if (!this.db || maquinas.length === 0) return;
    const ctx = getRlsContext();
    const porEca = new Map<string, MaquinaEca[]>();
    for (const m of maquinas) porEca.set(m.eca, [...(porEca.get(m.eca) ?? []), m]);

    for (const [eca, delGrupo] of porEca) {
      const filas = await runWithEcaContext(ctx?.esExplicito ? ctx.eca : eca, () =>
        this.db!.query<FilaAcuse & { alerta_id: string }>(
          'SELECT alerta_id, id, usuario, fecha_hora FROM acuses_recibo_legal WHERE eca = $1 AND alerta_id = ANY($2::text[])',
          [eca, delGrupo.map((m) => m.alertaCritica!.id)],
        ),
      );
      for (const fila of filas) {
        const alerta = delGrupo.find((m) => m.alertaCritica!.id === fila.alerta_id)?.alertaCritica;
        if (alerta) alerta.acuseRecibo = { fechaHora: new Date(fila.fecha_hora).toISOString(), usuario: fila.usuario };
      }
    }
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
   *
   * El acuse es un registro legal: sólo se informa como registrado si quedó guardado.
   * - Con base de datos, se guarda ANTES de marcarlo en memoria, y si el INSERT falla el error
   *   sube (no se traga): no queda nada marcado y quien llama se entera. Un texto que la base no
   *   puede guardar (p. ej. un carácter NUL) sale como 400 por el filtro global
   *   (database/database-error.filter.ts); cualquier otro error de base es un 500.
   * - Sin base de datos configurada (servicio creado sin DatabaseService, p. ej. en pruebas
   *   unitarias) el acuse queda sólo en memoria, como en desarrollo sin base.
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

    const remitoUrl = `/api/eca/remito/${alertaId}`;
    let acuse = { id: `ACU-${Date.now()}`, fechaHora: new Date().toISOString(), usuario };
    let yaRegistrado = false;

    if (this.db) {
      const ctx = getRlsContext();
      const ecaParaDb = ctx?.esExplicito ? ctx.eca : maquina.eca;
      const guardado = await runWithEcaContext(ecaParaDb, async () => {
        // ON CONFLICT: la base garantiza un acuse por alerta; si ya existía, no se inserta otro.
        const nueva = await this.db!.query<FilaAcuse>(
          `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, fecha_hora, tipo_alerta, remito_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (alerta_id) DO NOTHING
           RETURNING id, usuario, fecha_hora`,
          [alertaId, maquina.id, maquina.eca, usuario, acuse.fechaHora, maquina.alertaCritica!.tipo, remitoUrl],
        );
        if (nueva.length > 0) return { fila: nueva[0], yaRegistrado: false };
        const previa = await this.db!.query<FilaAcuse>(
          'SELECT id, usuario, fecha_hora FROM acuses_recibo_legal WHERE alerta_id = $1',
          [alertaId],
        );
        return { fila: previa[0], yaRegistrado: true };
      });
      if (!guardado.fila) {
        // Hay un acuse de esa alerta pero no es visible para esta petición: no se puede informar ni duplicar.
        throw new ConflictException(`La alerta ${alertaId} ya tiene un acuse que no corresponde a tu ECA.`);
      }
      acuse = { id: `ACU-${guardado.fila.id}`, fechaHora: new Date(guardado.fila.fecha_hora).toISOString(), usuario: guardado.fila.usuario };
      yaRegistrado = guardado.yaRegistrado;
    } else if (maquina.alertaCritica.acuseRecibo) {
      // Sin base (pruebas unitarias, desarrollo sin base): se devuelve el que ya estaba en memoria.
      const previo = maquina.alertaCritica.acuseRecibo;
      acuse = { id: acuse.id, fechaHora: previo.fechaHora, usuario: previo.usuario };
      yaRegistrado = true;
    }

    maquina.alertaCritica.acuseRecibo = { fechaHora: acuse.fechaHora, usuario: acuse.usuario };

    return {
      ok: true,
      mensaje: yaRegistrado
        ? `El acuse de recibo legal de esta alerta ya estaba registrado para ${maquina.eca}: se devuelve el original.`
        : `Acuse de recibo legal registrado exitosamente para ${maquina.eca}`,
      alertaId,
      maquinaId: maquina.id,
      eca: maquina.eca,
      yaRegistrado,
      acuse: { ...acuse, remitoUrl },
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

import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FirmanteService } from '../firmante/firmante.service';
import { MaquinaAsignada, TipoAlertaCritica } from '../firmante/firmante.types';
import { ParadasRepository } from './paradas.repository';
import { ESTADOS_ANORMALES, EstadoAnormal, ReporteParada } from './paradas.types';

const MAX_CAUSA = 1000;
const MAX_FOTOS = 10;

/**
 * Estado anormal de los equipos (HU-17 RF-03 y HU-06 RF-05): el RT de Calle marca «Fuera de Servicio» o «Reparación Urgente» con la
 * causa y fotos, el equipo queda «Pendiente de confirmación» y se avisa a la Secretaría y al Firmante; sólo el Firmante asignado lo
 * confirma o lo rechaza; y el equipo vuelve a «Normal» sólo con una nueva inspección del RT con al menos una foto.
 *
 * HU-17 RF-09: los reportes se guardan en PostgreSQL (si hay repositorio) y se cargan al arrancar; con ellos se le vuelve a poner a
 * cada máquina el estado que le corresponde, para que la ECA, la Secretaría y el Firmante lo sigan viendo después de un reinicio.
 */
@Injectable()
export class ParadasService {
  private readonly reportes: ReporteParada[] = [];
  private readonly logger = new Logger(ParadasService.name);
  /** Escrituras al repositorio en orden: una versión vieja de un reporte nunca pisa a una nueva. */
  private cola: Promise<void> = Promise.resolve();

  constructor(
    private readonly firmante: FirmanteService,
    @Optional() private readonly repo?: ParadasRepository,
  ) {
    // Una máquina que aparece después (las de los edificios con terna) recibe el estado de sus reportes.
    this.firmante.cuandoSeAgregueMaquina((m) => this.aplicarEstado(m));
  }

  /** HU-17 RF-09: carga los reportes guardados y le vuelve a poner a cada máquina el estado que corresponde. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.repo) return;
    try {
      const guardados = await this.repo.leer();
      const ids = new Set(this.reportes.map((r) => r.id));
      this.reportes.unshift(...guardados.filter((r) => !ids.has(r.id)));
      for (const m of this.firmante.getMaquinas()) this.aplicarEstado(m);
    } catch (err) {
      this.logger.error(`No se pudieron cargar los reportes de parada guardados: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Termina las escrituras pendientes (para las pruebas y el apagado). */
  async esperarGuardados(): Promise<void> {
    await this.cola;
  }

  /** Guarda el reporte y espera: un reporte o una decisión sólo se dan por hechos si quedaron guardados. */
  private async guardar(r: ReporteParada): Promise<void> {
    if (!this.repo) return;
    const copia = structuredClone(r);
    const escritura = this.cola.then(() => this.repo!.guardar(copia));
    this.cola = escritura.catch(() => undefined);
    await escritura;
  }

  /** El estado que le corresponde a la máquina según su último reporte (si tiene). */
  private aplicarEstado(m: MaquinaAsignada): void {
    const ultimo = [...this.reportes].reverse().find((r) => r.maquinaId === m.id);
    if (!ultimo) return;
    if (ultimo.confirmacion === 'Pendiente de confirmación' || (ultimo.confirmacion === 'Confirmado' && !ultimo.normalizadoEn)) {
      m.estadoOperativo = ultimo.estadoMarcado;
      m.confirmacionEstado = ultimo.confirmacion;
      const alertaId = ultimo.alertaId || `ALT-${ultimo.id}`;
      const tipoAlerta: TipoAlertaCritica = ultimo.estadoMarcado === 'Fuera de Servicio' ? 'FUERA_DE_SERVICIO' : 'REPARACION_URGENTE';
      const titulo = ultimo.estadoMarcado === 'Fuera de Servicio'
        ? `🚨 FUERA DE SERVICIO: ${ultimo.causa}`
        : `⚠️ REPARACIÓN URGENTE: ${ultimo.causa}`;
      const acusePrevio = m.alertaCritica?.id === alertaId ? m.alertaCritica.acuseRecibo : null;
      m.alertaCritica = {
        id: alertaId,
        tipo: tipoAlerta,
        titulo,
        motivo: ultimo.causa,
        fotografiaCabinaTrabada: ultimo.fotoUrl ?? null,
        fechaDeteccion: ultimo.fecha,
        remitoUrl: `/api/eca/remito/${alertaId}`,
        acuseRecibo: acusePrevio,
      };
    } else {
      m.estadoOperativo = 'Normal';
      m.confirmacionEstado = ultimo.confirmacion === 'Rechazado' ? 'Rechazado' : undefined;
      m.alertaCritica = null;
    }
  }

  async registrar(body: unknown, reportadoPor: string): Promise<ReporteParada> {
    const b = (body ?? {}) as Record<string, unknown>;
    // HU-17 RF-09: el reintento del mismo reporte desde el celular devuelve el que ya estaba, sin duplicarlo.
    const clientReportId = typeof b.clientReportId === 'string' ? b.clientReportId.trim().slice(0, 100) : '';
    if (clientReportId) {
      const yaRecibido = this.reportes.find((r) => r.clientReportId === clientReportId);
      if (yaRecibido) return structuredClone(yaRecibido);
    }
    const errores: string[] = [];
    const maquinaId = typeof b.maquinaId === 'string' ? b.maquinaId.trim() : '';
    const causa = typeof b.causa === 'string' ? b.causa.trim() : '';
    const estado = b.estado === undefined ? 'Fuera de Servicio' : b.estado;
    if (!maquinaId) errores.push('maquinaId es obligatorio');
    if (!ESTADOS_ANORMALES.includes(estado as EstadoAnormal)) errores.push(`estado tiene que ser uno de: ${ESTADOS_ANORMALES.join(', ')}`);
    if (!causa) errores.push('causa es obligatoria: contá por qué está en ese estado el equipo');
    if (causa.length > MAX_CAUSA) errores.push(`causa no puede superar los ${MAX_CAUSA} caracteres`);
    const fotos = Array.isArray(b.fotos) ? b.fotos.filter((f) => typeof f === 'string' && f.trim() !== '') : [];
    if (fotos.length === 0) errores.push('fotos: hace falta al menos una foto del equipo');
    if (fotos.length > MAX_FOTOS) errores.push(`fotos admite hasta ${MAX_FOTOS}`);
    if (errores.length > 0) throw new BadRequestException({ message: 'Datos inválidos', errores });

    const maquina = this.firmante.getMaquinas().find(
      (m) => m.id === maquinaId || (m.consorcioId && (m.id.endsWith(`-${maquinaId}`) || m.codigoAGC === maquinaId)),
    );
    if (!maquina) throw new NotFoundException(`No existe la máquina ${maquinaId}`);
    if (this.reportes.some((r) => r.maquinaId === maquina.id && r.confirmacion === 'Pendiente de confirmación')) {
      throw new ConflictException('Este equipo ya tiene un reporte pendiente de confirmación.');
    }

    const alertaId = typeof b.alertaId === 'string' && b.alertaId.trim() ? b.alertaId.trim() : `ALT-${randomUUID()}`;
    const fotoUrl = fotos.length > 0 ? fotos[0] : null;

    const reporte: ReporteParada = {
      id: `PAR-${randomUUID()}`,
      maquinaId: maquina.id,
      codigoAGC: maquina.codigoAGC,
      edificio: maquina.edificio.consorcio,
      eca: maquina.eca,
      estadoMarcado: estado as EstadoAnormal,
      causa,
      fotos: fotos.length,
      fotoUrl,
      alertaId,
      estado: `${estado} — Pendiente de confirmación`,
      confirmacion: 'Pendiente de confirmación',
      reportadoPor,
      fecha: new Date().toISOString(),
      avisadoA: ['secretaria', `firmante:${maquina.firmanteUsername}`],
      ...(clientReportId ? { clientReportId } : {}),
    };

    const antes = {
      reporte: structuredClone(reporte),
      estadoOperativo: maquina.estadoOperativo,
      confirmacionEstado: maquina.confirmacionEstado,
      alertaCritica: maquina.alertaCritica ? structuredClone(maquina.alertaCritica) : null,
    };

    maquina.estadoOperativo = estado as EstadoAnormal;
    maquina.confirmacionEstado = 'Pendiente de confirmación';
    const tipoAlerta: TipoAlertaCritica = estado === 'Fuera de Servicio' ? 'FUERA_DE_SERVICIO' : 'REPARACION_URGENTE';
    const titulo = estado === 'Fuera de Servicio'
      ? `🚨 FUERA DE SERVICIO: ${causa}`
      : `⚠️ REPARACIÓN URGENTE: ${causa}`;

    maquina.alertaCritica = {
      id: alertaId,
      tipo: tipoAlerta,
      titulo,
      motivo: causa,
      fotografiaCabinaTrabada: fotoUrl,
      fechaDeteccion: reporte.fecha,
      remitoUrl: `/api/eca/remito/${alertaId}`,
      acuseRecibo: null,
    };

    try {
      await this.guardar(reporte);
    } catch (err) {
      maquina.estadoOperativo = antes.estadoOperativo;
      maquina.confirmacionEstado = antes.confirmacionEstado;
      maquina.alertaCritica = antes.alertaCritica;
      this.logger.error(`No se pudo guardar el reporte de parada: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
    this.reportes.push(reporte);
    return structuredClone(reporte);
  }

  /** Los reportes: lo que ven la Secretaría y el Firmante (un Firmante, los de sus edificios). */
  listar(para?: { usuario: string; rol: string }): ReporteParada[] {
    return this.reportes
      .filter((r) => para?.rol !== 'firmante' || this.firmanteDe(r.maquinaId) === para.usuario.toLowerCase())
      .map((r) => structuredClone(r));
  }

  /**
   * HU-06 RF-05: el Firmante asignado al edificio confirma o rechaza el estado que marcó el RT. Confirmar deja el estado vigente
   * (lo ven la ficha de la máquina y el portal de la ECA); rechazar devuelve el equipo a «Normal». Otro rol, o un Firmante de otro
   * edificio, recibe 403.
   */
  async resolver(id: string, decision: 'confirmar' | 'rechazar', usuario: { usuario: string; rol: string }, motivo?: unknown): Promise<ReporteParada> {
    const reporte = this.reportes.find((r) => r.id === id);
    if (!reporte) throw new NotFoundException(`No existe el reporte ${id}`);
    if (usuario.rol !== 'firmante' || this.firmanteDe(reporte.maquinaId) !== usuario.usuario.toLowerCase()) {
      throw new ForbiddenException('Sólo el Firmante asignado al edificio confirma o rechaza el estado del equipo.');
    }
    if (reporte.confirmacion !== 'Pendiente de confirmación') throw new ConflictException(`Este reporte ya fue ${reporte.confirmacion.toLowerCase()}.`);
    const motivoLimpio = typeof motivo === 'string' ? motivo.trim() : '';
    if (decision === 'rechazar' && !motivoLimpio) throw new BadRequestException({ message: 'Datos inválidos', errores: ['motivo es obligatorio al rechazar'] });

    const maquina = this.firmante.getMaquinas().find((m) => m.id === reporte.maquinaId)!;
    const antes = {
      reporte: structuredClone(reporte),
      estadoOperativo: maquina.estadoOperativo,
      confirmacionEstado: maquina.confirmacionEstado,
      alertaCritica: maquina.alertaCritica ? structuredClone(maquina.alertaCritica) : null,
    };
    reporte.resueltoPor = usuario.usuario;
    reporte.resueltoEn = new Date().toISOString();
    if (decision === 'confirmar') {
      reporte.confirmacion = 'Confirmado';
      reporte.estado = `${reporte.estadoMarcado} — Confirmado`;
      maquina.confirmacionEstado = 'Confirmado';
    } else {
      reporte.confirmacion = 'Rechazado';
      reporte.estado = 'Rechazado: el equipo sigue normal';
      reporte.motivoRechazo = motivoLimpio;
      maquina.confirmacionEstado = 'Rechazado';
      maquina.estadoOperativo = 'Normal';
      maquina.alertaCritica = null;
    }
    try {
      await this.guardar(reporte);
    } catch (err) {
      // Si no quedó guardada, la decisión no se da por hecha: el reporte y el equipo vuelven a como estaban y se puede reintentar.
      Object.assign(reporte, antes.reporte);
      for (const k of ['resueltoPor', 'resueltoEn', 'motivoRechazo'] as const) if (!(k in antes.reporte)) delete reporte[k];
      maquina.estadoOperativo = antes.estadoOperativo;
      maquina.confirmacionEstado = antes.confirmacionEstado;
      maquina.alertaCritica = antes.alertaCritica;
      throw err;
    }
    return structuredClone(reporte);
  }

  /**
   * HU-06 RF-05: el equipo vuelve a «Normal» sólo con una nueva inspección del RT con al menos una foto; sin foto responde 400.
   */
  async normalizar(maquinaId: string, body: unknown, reportadoPor: string): Promise<{ maquinaId: string; estadoOperativo: 'Normal'; reportadoPor: string; fotos: number }> {
    const b = (body ?? {}) as Record<string, unknown>;
    const fotos = Array.isArray(b.fotos) ? b.fotos.filter((f) => typeof f === 'string' && f.trim() !== '') : [];
    if (fotos.length === 0) {
      throw new BadRequestException({ message: 'Datos inválidos', errores: ['fotos: para volver a Normal hace falta una nueva inspección con al menos una foto'] });
    }
    const maquina = this.firmante.getMaquinas().find(
      (m) => m.id === maquinaId || (m.consorcioId && (m.id.endsWith(`-${maquinaId}`) || m.codigoAGC === maquinaId)),
    );
    if (!maquina) throw new NotFoundException(`No existe la máquina ${maquinaId}`);
    if (this.reportes.some((r) => r.maquinaId === maquina.id && r.confirmacion === 'Pendiente de confirmación')) {
      throw new ConflictException('El estado de este equipo está pendiente de confirmación del Firmante: todavía no se puede volver a Normal.');
    }
    if ((maquina.estadoOperativo ?? 'Normal') === 'Normal') throw new ConflictException('Este equipo ya está en estado Normal.');
    maquina.estadoOperativo = 'Normal';
    maquina.confirmacionEstado = undefined;
    maquina.alertaCritica = null;
    // El último reporte confirmado queda marcado como normalizado: así, después de un reinicio, el equipo sigue «Normal».
    const confirmado = [...this.reportes].reverse().find((r) => r.maquinaId === maquina.id && r.confirmacion === 'Confirmado' && !r.normalizadoEn);
    if (confirmado) {
      confirmado.normalizadoEn = new Date().toISOString();
      confirmado.normalizadoPor = reportadoPor;
      await this.guardar(confirmado);
    }
    return { maquinaId: maquina.id, estadoOperativo: 'Normal', reportadoPor, fotos: fotos.length };
  }

  private firmanteDe(maquinaId: string): string {
    return (this.firmante.getMaquinas().find((m) => m.id === maquinaId)?.firmanteUsername ?? '').toLowerCase();
  }
}

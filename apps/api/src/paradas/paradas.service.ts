import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FirmanteService } from '../firmante/firmante.service';
import { ESTADOS_ANORMALES, EstadoAnormal, ReporteParada } from './paradas.types';

const MAX_CAUSA = 1000;
const MAX_FOTOS = 10;

/**
 * Estado anormal de los equipos (HU-17 RF-03 y HU-06 RF-05): el RT de Calle marca «Fuera de Servicio» o «Reparación Urgente» con la
 * causa y fotos, el equipo queda «Pendiente de confirmación» y se avisa a la Secretaría y al Firmante; sólo el Firmante asignado lo
 * confirma o lo rechaza; y el equipo vuelve a «Normal» sólo con una nueva inspección del RT con al menos una foto. Quedan en memoria,
 * igual que las máquinas de FirmanteService de las que cuelgan.
 */
@Injectable()
export class ParadasService {
  private readonly reportes: ReporteParada[] = [];

  constructor(private readonly firmante: FirmanteService) {}

  registrar(body: unknown, reportadoPor: string): ReporteParada {
    const b = (body ?? {}) as Record<string, unknown>;
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

    const maquina = this.firmante.getMaquinas().find((m) => m.id === maquinaId);
    if (!maquina) throw new NotFoundException(`No existe la máquina ${maquinaId}`);
    if (this.reportes.some((r) => r.maquinaId === maquinaId && r.confirmacion === 'Pendiente de confirmación')) {
      throw new ConflictException('Este equipo ya tiene un reporte pendiente de confirmación.');
    }

    maquina.estadoOperativo = estado as EstadoAnormal;
    maquina.confirmacionEstado = 'Pendiente de confirmación';
    const reporte: ReporteParada = {
      id: `PAR-${randomUUID()}`,
      maquinaId,
      codigoAGC: maquina.codigoAGC,
      edificio: maquina.edificio.consorcio,
      eca: maquina.eca,
      estadoMarcado: estado as EstadoAnormal,
      causa,
      fotos: fotos.length,
      estado: `${estado} — Pendiente de confirmación`,
      confirmacion: 'Pendiente de confirmación',
      reportadoPor,
      fecha: new Date().toISOString(),
      avisadoA: ['secretaria', `firmante:${maquina.firmanteUsername}`],
    };
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
  resolver(id: string, decision: 'confirmar' | 'rechazar', usuario: { usuario: string; rol: string }, motivo?: unknown): ReporteParada {
    const reporte = this.reportes.find((r) => r.id === id);
    if (!reporte) throw new NotFoundException(`No existe el reporte ${id}`);
    if (usuario.rol !== 'firmante' || this.firmanteDe(reporte.maquinaId) !== usuario.usuario.toLowerCase()) {
      throw new ForbiddenException('Sólo el Firmante asignado al edificio confirma o rechaza el estado del equipo.');
    }
    if (reporte.confirmacion !== 'Pendiente de confirmación') throw new ConflictException(`Este reporte ya fue ${reporte.confirmacion.toLowerCase()}.`);
    const motivoLimpio = typeof motivo === 'string' ? motivo.trim() : '';
    if (decision === 'rechazar' && !motivoLimpio) throw new BadRequestException({ message: 'Datos inválidos', errores: ['motivo es obligatorio al rechazar'] });

    const maquina = this.firmante.getMaquinas().find((m) => m.id === reporte.maquinaId)!;
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
    }
    return structuredClone(reporte);
  }

  /**
   * HU-06 RF-05: el equipo vuelve a «Normal» sólo con una nueva inspección del RT con al menos una foto; sin foto responde 400.
   */
  normalizar(maquinaId: string, body: unknown, reportadoPor: string): { maquinaId: string; estadoOperativo: 'Normal'; reportadoPor: string; fotos: number } {
    const b = (body ?? {}) as Record<string, unknown>;
    const fotos = Array.isArray(b.fotos) ? b.fotos.filter((f) => typeof f === 'string' && f.trim() !== '') : [];
    if (fotos.length === 0) {
      throw new BadRequestException({ message: 'Datos inválidos', errores: ['fotos: para volver a Normal hace falta una nueva inspección con al menos una foto'] });
    }
    const maquina = this.firmante.getMaquinas().find((m) => m.id === maquinaId);
    if (!maquina) throw new NotFoundException(`No existe la máquina ${maquinaId}`);
    if (this.reportes.some((r) => r.maquinaId === maquinaId && r.confirmacion === 'Pendiente de confirmación')) {
      throw new ConflictException('El estado de este equipo está pendiente de confirmación del Firmante: todavía no se puede volver a Normal.');
    }
    if ((maquina.estadoOperativo ?? 'Normal') === 'Normal') throw new ConflictException('Este equipo ya está en estado Normal.');
    maquina.estadoOperativo = 'Normal';
    maquina.confirmacionEstado = undefined;
    return { maquinaId, estadoOperativo: 'Normal', reportadoPor, fotos: fotos.length };
  }

  private firmanteDe(maquinaId: string): string {
    return (this.firmante.getMaquinas().find((m) => m.id === maquinaId)?.firmanteUsername ?? '').toLowerCase();
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FirmanteService } from '../firmante/firmante.service';
import { ReporteParada } from './paradas.types';

const MAX_CAUSA = 1000;
const MAX_FOTOS = 10;

/**
 * Reportes de parada de equipos fuera de servicio (HU-17 RF-03). Quedan en memoria, igual que las máquinas de FirmanteService de las
 * que cuelgan. Al guardar, el equipo pasa a «Fuera de Servicio — Pendiente de confirmación» y se avisa a la Secretaría y al Firmante;
 * la confirmación del Firmante es HU-06 RF-05.
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
    if (!maquinaId) errores.push('maquinaId es obligatorio');
    if (!causa) errores.push('causa es obligatoria: contá por qué está parado el equipo');
    if (causa.length > MAX_CAUSA) errores.push(`causa no puede superar los ${MAX_CAUSA} caracteres`);
    const fotos = Array.isArray(b.fotos) ? b.fotos.filter((f) => typeof f === 'string' && f.trim() !== '') : [];
    if (fotos.length === 0) errores.push('fotos: hace falta al menos una foto del equipo');
    if (fotos.length > MAX_FOTOS) errores.push(`fotos admite hasta ${MAX_FOTOS}`);
    if (errores.length > 0) throw new BadRequestException({ message: 'Datos inválidos', errores });

    const maquina = this.firmante.getMaquinas().find((m) => m.id === maquinaId);
    if (!maquina) throw new NotFoundException(`No existe la máquina ${maquinaId}`);
    if (this.reportes.some((r) => r.maquinaId === maquinaId && !this.resuelto(r))) {
      throw new ConflictException('Este equipo ya tiene un reporte de parada pendiente de confirmación.');
    }

    maquina.estadoOperativo = 'Fuera de Servicio';
    const reporte: ReporteParada = {
      id: `PAR-${randomUUID()}`,
      maquinaId,
      codigoAGC: maquina.codigoAGC,
      edificio: maquina.edificio.consorcio,
      eca: maquina.eca,
      causa,
      fotos: fotos.length,
      estado: 'Fuera de Servicio — Pendiente de confirmación',
      reportadoPor,
      fecha: new Date().toISOString(),
      avisadoA: ['secretaria', `firmante:${maquina.firmanteUsername}`],
    };
    this.reportes.push(reporte);
    return structuredClone(reporte);
  }

  /** Los reportes pendientes: lo que ven la Secretaría y el Firmante. */
  listar(): ReporteParada[] {
    return this.reportes.map((r) => structuredClone(r));
  }

  private resuelto(_r: ReporteParada): boolean {
    return false; // la confirmación o el rechazo del Firmante llegan con HU-06 RF-05
  }
}

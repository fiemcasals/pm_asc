import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import {
  CHECKLIST_VERSION,
  ChecklistMotorConfig,
  EstadoEquipoUso,
  obtenerChecklistParaTipo,
  TipoMaquinaChecklist,
} from './checklist.config';

export interface InspeccionChecklist {
  id: string;
  consorcioId: string;
  maquinaId: string;
  referenciaAgc: string;
  tipoMaquina: TipoMaquinaChecklist;
  estadoEquipo: EstadoEquipoUso;
  versionChecklist: string;
  datos: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const TIPOS_VALIDOS = new Set<TipoMaquinaChecklist>(['traccion', 'hidraulico', 'montavehiculos']);
const ESTADOS_VALIDOS = new Set<EstadoEquipoUso>(['en_uso', 'fuera_de_servicio']);

@Injectable()
export class ChecklistService {
  private readonly memoria = new Map<string, InspeccionChecklist>();

  constructor(@Optional() private readonly db?: DatabaseService) {}

  obtenerConfig(tipo?: string): ChecklistMotorConfig {
    if (!tipo) return obtenerChecklistParaTipo('traccion');
    if (!TIPOS_VALIDOS.has(tipo as TipoMaquinaChecklist)) {
      throw new BadRequestException('Tipo de máquina inválido. Use: traccion, hidraulico o montavehiculos');
    }
    return obtenerChecklistParaTipo(tipo as TipoMaquinaChecklist);
  }

  async crearInspeccion(body: unknown): Promise<InspeccionChecklist> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException({ message: 'Datos inválidos', errores: ['El cuerpo debe ser un objeto JSON'] });
    }
    const raw = body as Record<string, unknown>;
    const errores: string[] = [];
    const consorcioId = typeof raw.consorcioId === 'string' ? raw.consorcioId.trim() : '';
    const maquinaId = typeof raw.maquinaId === 'string' ? raw.maquinaId.trim() : '';
    const referenciaAgc = typeof raw.referenciaAgc === 'string' ? raw.referenciaAgc.trim().toUpperCase() : '';
    const tipoMaquina = (typeof raw.tipoMaquina === 'string' ? raw.tipoMaquina : 'traccion') as TipoMaquinaChecklist;
    const estadoEquipo = (typeof raw.estadoEquipo === 'string' ? raw.estadoEquipo : 'en_uso') as EstadoEquipoUso;

    if (!consorcioId) errores.push('consorcioId es obligatorio');
    if (!maquinaId) errores.push('maquinaId es obligatorio');
    if (!referenciaAgc) errores.push('referenciaAgc es obligatorio');
    if (!TIPOS_VALIDOS.has(tipoMaquina)) errores.push('tipoMaquina inválido');
    if (!ESTADOS_VALIDOS.has(estadoEquipo)) errores.push('estadoEquipo inválido');
    if (errores.length > 0) {
      throw new BadRequestException({ message: 'Datos inválidos', errores });
    }

    const ahora = new Date().toISOString();
    const id = randomUUID();
    const registro: InspeccionChecklist = {
      id,
      consorcioId,
      maquinaId,
      referenciaAgc,
      tipoMaquina,
      estadoEquipo,
      versionChecklist: CHECKLIST_VERSION,
      datos: typeof raw.datos === 'object' && raw.datos !== null && !Array.isArray(raw.datos)
        ? (raw.datos as Record<string, unknown>)
        : {},
      createdAt: ahora,
      updatedAt: ahora,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO inspecciones_checklist (
           id, consorcio_id, maquina_id, referencia_agc, tipo_maquina, estado_equipo, version_checklist, datos, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
        [
          registro.id,
          registro.consorcioId,
          registro.maquinaId,
          registro.referenciaAgc,
          registro.tipoMaquina,
          registro.estadoEquipo,
          registro.versionChecklist,
          JSON.stringify(registro.datos),
          registro.createdAt,
          registro.updatedAt,
        ],
      );
    }
    this.memoria.set(id, registro);
    return structuredClone(registro);
  }

  async obtenerInspeccion(id: string): Promise<InspeccionChecklist> {
    if (this.db) {
      const filas = await this.db.query<{
        id: string;
        consorcio_id: string;
        maquina_id: string;
        referencia_agc: string;
        tipo_maquina: TipoMaquinaChecklist;
        estado_equipo: EstadoEquipoUso;
        version_checklist: string;
        datos: Record<string, unknown>;
        created_at: Date;
        updated_at: Date;
      }>('SELECT * FROM inspecciones_checklist WHERE id = $1', [id]).catch(() => []);
      if (filas.length > 0) {
        const f = filas[0];
        return {
          id: f.id,
          consorcioId: f.consorcio_id,
          maquinaId: f.maquina_id,
          referenciaAgc: f.referencia_agc,
          tipoMaquina: f.tipo_maquina,
          estadoEquipo: f.estado_equipo,
          versionChecklist: f.version_checklist,
          datos: f.datos,
          createdAt: f.created_at.toISOString(),
          updatedAt: f.updated_at.toISOString(),
        };
      }
    }

    const mem = this.memoria.get(id);
    if (!mem) throw new NotFoundException('Inspección no encontrada');
    return structuredClone(mem);
  }
}

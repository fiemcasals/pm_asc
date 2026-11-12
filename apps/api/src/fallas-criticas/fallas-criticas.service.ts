import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, Subject } from 'rxjs';
import { FirmanteService } from '../firmante/firmante.service';
import {
  EventoFallaCritica,
  FallaCritica,
  InformeFalla,
  InformeFallaInput,
  RegistrarInformeResponse,
} from './fallas-criticas.types';

const MAX_OBSERVACIONES = 2000;
const MAX_FOTOGRAFIAS = 10;

/**
 * Recibe los informes que carga el RT de calle y, si traen una falla crítica (cables
 * desgastados o limitador de velocidad anulado), emite un evento en tiempo real para el panel
 * de Secretaría.
 *
 * Los informes quedan en memoria, igual que las máquinas de FirmanteService de las que cuelgan:
 * se pierden al reiniciar la API. No modifica la alerta crítica de la máquina (eso alimenta el
 * Portal ECA y el despacho legal, que son otros Requerimientos).
 */
@Injectable()
export class FallasCriticasService {
  private readonly informes = new Map<string, InformeFalla>();
  private readonly informesPorClientId = new Map<string, InformeFalla>();
  private readonly eventos = new Subject<EventoFallaCritica>();

  constructor(private readonly firmanteService: FirmanteService) {}

  /** Flujo de eventos de falla crítica. Cada suscriptor recibe sólo los posteriores a suscribirse. */
  eventos$(): Observable<EventoFallaCritica> {
    return this.eventos.asObservable();
  }

  /** Lista eventos críticos ya emitidos (en orden cronológico) para Secretaría y Firmante al abrir su panel. */
  listarEventosCriticos(): EventoFallaCritica[] {
    const lista: EventoFallaCritica[] = [];
    for (const informe of this.informes.values()) {
      if (informe.fallasCriticas.length > 0) {
        lista.push(aEventoFalla(informe));
      }
    }
    return lista;
  }

  registrarInforme(body: unknown): RegistrarInformeResponse {
    const input = validarInforme(body);

    if (input.clientReportId && this.informesPorClientId.has(input.clientReportId)) {
      const existente = this.informesPorClientId.get(input.clientReportId)!;
      return { informe: structuredClone(existente), eventoEmitido: false };
    }

    const maquina = this.firmanteService.getMaquinas().find((m) => m.id === input.maquinaId);
    if (!maquina) {
      throw new NotFoundException(`No existe la máquina ${input.maquinaId}`);
    }

    const fallasCriticas: FallaCritica[] = [];
    if (input.cablesDesgastados) fallasCriticas.push('CABLES_DESGASTADOS');
    if (input.limitadorAnulado) fallasCriticas.push('LIMITADOR_ANULADO');
    for (const codigo of input.fallasCriticas ?? []) {
      if (!fallasCriticas.includes(codigo)) {
        fallasCriticas.push(codigo);
      }
    }

    const id = `INF-${randomUUID()}`;
    const informe: InformeFalla = {
      id,
      ...(input.clientReportId ? { clientReportId: input.clientReportId } : {}),
      maquinaId: maquina.id,
      codigoAGC: maquina.codigoAGC,
      nombreMaquina: maquina.nombre,
      edificio: {
        direccion: maquina.edificio.direccion,
        consorcio: maquina.edificio.consorcio,
      },
      eca: maquina.eca,
      inspector: input.inspector,
      cablesDesgastados: input.cablesDesgastados || fallasCriticas.includes('CABLES_DESGASTADOS'),
      limitadorAnulado: input.limitadorAnulado || fallasCriticas.includes('LIMITADOR_ANULADO'),
      observaciones: input.observaciones ?? '',
      fotografias: input.fotografias ?? [],
      fallasCriticas,
      registradoEn: new Date().toISOString(),
      enlaceInforme: `/api/fallas-criticas/informes/${id}`,
    };
    this.informes.set(id, informe);
    if (input.clientReportId) {
      this.informesPorClientId.set(input.clientReportId, informe);
    }

    const eventoEmitido = fallasCriticas.length > 0;
    if (eventoEmitido) {
      this.eventos.next(aEventoFalla(informe));
    }

    return { informe: structuredClone(informe), eventoEmitido };
  }

  obtenerInforme(id: string): InformeFalla {
    const informe = this.informes.get(id);
    if (!informe) {
      throw new NotFoundException(`No existe el informe ${id}`);
    }
    return structuredClone(informe);
  }
}

function aEventoFalla(informe: InformeFalla): EventoFallaCritica {
  return {
    tipo: 'falla-critica',
    informeId: informe.id,
    maquinaId: informe.maquinaId,
    codigoAGC: informe.codigoAGC,
    nombreMaquina: informe.nombreMaquina,
    direccion: informe.edificio.direccion,
    consorcio: informe.edificio.consorcio,
    eca: informe.eca,
    inspector: informe.inspector,
    fallas: [...informe.fallasCriticas],
    registradoEn: informe.registradoEn,
    enlaceInforme: informe.enlaceInforme,
  };
}

function esTextualDataImage(v: string): boolean {
  return /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(v) && v.length <= 750_000;
}

function esUrlFotoValida(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (esTextualDataImage(v)) return true;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function esTextoNoVacio(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** Valida el cuerpo del informe y devuelve 400 nombrando cada campo que está mal. */
export function validarInforme(body: unknown): InformeFallaInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('El cuerpo del informe tiene que ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;
  const errores: string[] = [];

  if (!esTextoNoVacio(b.maquinaId)) errores.push('maquinaId es obligatorio');
  if (!esTextoNoVacio(b.inspector)) errores.push('inspector es obligatorio');

  const tieneListaFallas = b.fallasCriticas !== undefined;
  if (tieneListaFallas && (!Array.isArray(b.fallasCriticas) || !b.fallasCriticas.every(esTextoNoVacio))) {
    errores.push('fallasCriticas tiene que ser una lista de códigos válidos');
  }

  const cables = b.cablesDesgastados ?? (tieneListaFallas ? false : undefined);
  const limitador = b.limitadorAnulado ?? (tieneListaFallas ? false : undefined);

  if (typeof cables !== 'boolean') {
    errores.push('cablesDesgastados tiene que ser true o false');
  }
  if (typeof limitador !== 'boolean') {
    errores.push('limitadorAnulado tiene que ser true o false');
  }
  if (b.observaciones !== undefined) {
    if (typeof b.observaciones !== 'string') {
      errores.push('observaciones tiene que ser texto');
    } else if (b.observaciones.length > MAX_OBSERVACIONES) {
      errores.push(`observaciones admite hasta ${MAX_OBSERVACIONES} caracteres`);
    }
  }
  if (b.fotografias !== undefined) {
    if (!Array.isArray(b.fotografias) || !b.fotografias.every(esUrlFotoValida)) {
      errores.push('fotografias tiene que ser una lista de URLs http(s)');
    } else if (b.fotografias.length > MAX_FOTOGRAFIAS) {
      errores.push(`fotografias admite hasta ${MAX_FOTOGRAFIAS} URLs`);
    }
  }

  if (errores.length > 0) {
    throw new BadRequestException(errores);
  }

  return {
    ...(esTextoNoVacio(b.clientReportId) ? { clientReportId: b.clientReportId.trim() } : {}),
    maquinaId: (b.maquinaId as string).trim(),
    inspector: (b.inspector as string).trim(),
    cablesDesgastados: cables as boolean,
    limitadorAnulado: limitador as boolean,
    ...(tieneListaFallas
      ? { fallasCriticas: (b.fallasCriticas as string[]).map((c) => c.trim()) }
      : {}),
    observaciones: (b.observaciones as string | undefined)?.trim(),
    fotografias: b.fotografias as string[] | undefined,
  };
}

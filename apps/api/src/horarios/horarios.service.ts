import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { FERIADOS_PROVISORIOS } from './feriados';
import { estadoDeApertura } from './horarios.logic';
import { HorariosRepository } from './horarios.repository';
import { EstadoApertura, FRANJAS_POR_DEFECTO, HorariosEdificio } from './horarios.types';
import { validarHorarios } from './horarios.logic';

/** Horarios de atención por edificio y si está abierto en un momento dado (HU-01 RF-04). */
@Injectable()
export class HorariosService {
  private readonly feriados: ReadonlySet<string>;

  constructor(
    private readonly repo: HorariosRepository,
    @Optional() @Inject(APP_CONFIG) config?: AppConfig,
  ) {
    this.feriados = new Set(config?.feriados ?? FERIADOS_PROVISORIOS);
  }

  getFeriados(): string[] {
    return [...this.feriados].sort();
  }

  /** Los horarios del edificio; si nadie los editó, el horario con el que arranca todo edificio nuevo. */
  async obtener(consorcioId: string): Promise<HorariosEdificio> {
    const r = await this.repo.obtener(consorcioId);
    if (!r) throw new NotFoundException('Edificio no encontrado');
    if (!r.horarios) {
      return { consorcioId, aCoordinar: false, franjas: structuredClone(FRANJAS_POR_DEFECTO), porDefecto: true, actualizadoEn: null, actualizadoPor: null };
    }
    return { consorcioId, ...r.horarios, porDefecto: false };
  }

  /** Edita las franjas (hasta 2 por día) o marca el edificio «A coordinar». Un horario inválido se rechaza con 400 y el motivo. */
  async guardar(consorcioId: string, cuerpo: unknown, usuario: string): Promise<HorariosEdificio> {
    const v = validarHorarios(cuerpo);
    if (!v.ok) throw new BadRequestException({ message: 'Horarios inválidos', errores: v.errores });
    const guardado = await this.repo.guardar(consorcioId, v.horarios, usuario);
    if (!guardado) throw new NotFoundException('Edificio no encontrado');
    return { consorcioId, ...guardado, porDefecto: false };
  }

  /** ¿Está abierto el edificio en `en` (por defecto, ahora)? Los feriados cuentan como cerrado. */
  async estaAbierto(consorcioId: string, en?: string): Promise<EstadoApertura> {
    let instante = new Date();
    if (en !== undefined && en !== '') {
      instante = new Date(en);
      if (Number.isNaN(instante.getTime())) throw new BadRequestException('El parámetro «en» tiene que ser una fecha y hora válida (ISO 8601, por ejemplo 2026-11-17T10:00:00-03:00).');
    }
    const h = await this.obtener(consorcioId);
    return estadoDeApertura(consorcioId, h, this.feriados, instante);
  }
}

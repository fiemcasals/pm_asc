import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { RELOJ, Reloj } from '../auth/auth.types';
import {
  calcularEdificio,
  colorDelTramo,
  fechaEnZona,
  formatearFecha,
  formatearMes,
  ordenarPorUrgencia,
  parsearFecha,
} from './semaforo.logic';
import { SemaforoRepository } from './semaforo.repository';
import { ColorSemaforo, FechaCalendario, SemaforoResponse } from './semaforo.types';

@Injectable()
export class SemaforoService {
  constructor(
    private readonly repositorio: SemaforoRepository,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  /** `fecha` (AAAA-MM-DD) es opcional: sin ella se usa el día de hoy en hora de Buenos Aires. */
  async obtener(fecha?: unknown): Promise<SemaforoResponse> {
    const dia = this.resolverFecha(fecha);
    const base = await this.repositorio.leerEdificios(dia);
    const edificios = ordenarPorUrgencia(base.map((b) => calcularEdificio(b, dia)));

    const totales: Record<ColorSemaforo, number> = { verde: 0, amarillo: 0, rojo: 0 };
    for (const e of edificios) totales[e.color] += 1;

    return {
      fecha: formatearFecha(dia),
      mes: formatearMes(dia),
      tramoDelDia: colorDelTramo(dia.dia),
      totales,
      edificios,
    };
  }

  private resolverFecha(fecha: unknown): FechaCalendario {
    if (fecha === undefined) return fechaEnZona(this.reloj.ahora());
    const parseada = typeof fecha === 'string' ? parsearFecha(fecha) : null;
    if (!parseada) {
      throw new BadRequestException({
        message: 'Datos inválidos',
        errores: ['fecha tiene que ser AAAA-MM-DD y un día que exista en el calendario (por ejemplo 2026-11-12)'],
      });
    }
    return parseada;
  }
}

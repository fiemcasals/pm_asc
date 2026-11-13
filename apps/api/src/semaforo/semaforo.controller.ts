import { Controller, Get, Query } from '@nestjs/common';
import { SemaforoService } from './semaforo.service';
import { SemaforoResponse } from './semaforo.types';

@Controller('semaforo')
export class SemaforoController {
  constructor(private readonly semaforo: SemaforoService) {}

  /**
   * Semáforo mensual de edificios (HU-04 RF-01): por edificio, su color, el día de la última inspección del
   * mes y el RT de Calle asignado. `?fecha=AAAA-MM-DD` calcula el semáforo "a ese día"; sin ella, hoy.
   */
  @Get()
  obtener(@Query('fecha') fecha?: unknown): Promise<SemaforoResponse> {
    return this.semaforo.obtener(fecha);
  }
}

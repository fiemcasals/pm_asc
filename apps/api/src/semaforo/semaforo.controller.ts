import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { UsuarioAutenticado } from '../auth/auth.types';
import { RegistroReasignacion, SugerenciaReasignacion } from './reasignacion.types';
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

  /** A qué RT de Calle reasignar un edificio en rojo (el de menos pendientes del mes). Sólo sugiere: no cambia nada. */
  @Get(':consorcioId/reasignacion/sugerencia')
  @Roles('secretaria', 'administrador')
  sugerir(@Param('consorcioId') consorcioId: string, @Query('fecha') fecha?: unknown): Promise<SugerenciaReasignacion> {
    return this.semaforo.sugerirReasignacion(consorcioId, fecha);
  }

  /** Aplica la reasignación que la Secretaría confirmó y la registra con su usuario. */
  @Post(':consorcioId/reasignacion')
  @HttpCode(201)
  @Roles('secretaria', 'administrador')
  reasignar(
    @Param('consorcioId') consorcioId: string,
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<RegistroReasignacion> {
    return this.semaforo.reasignar(consorcioId, cuerpo, usuario.usuario);
  }

  /** El registro de reasignaciones del edificio, la más reciente primero. */
  @Get(':consorcioId/reasignaciones')
  @Roles('secretaria', 'administrador')
  historial(@Param('consorcioId') consorcioId: string): Promise<RegistroReasignacion[]> {
    return this.semaforo.historial(consorcioId);
  }
}

import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { HorariosService } from './horarios.service';
import { EstadoApertura, HorariosEdificio } from './horarios.types';

/** Horarios de atención por edificio (HU-01 RF-04). */
@Controller()
export class HorariosController {
  constructor(private readonly service: HorariosService) {}

  /** Los feriados que se consideran cerrado. */
  @Get('feriados')
  @Roles()
  feriados(): { feriados: string[] } {
    return { feriados: this.service.getFeriados() };
  }

  @Get('consorcios/:consorcioId/horarios')
  @Roles('secretaria', 'administrador', 'rt_calle', 'firmante')
  obtener(@Param('consorcioId') consorcioId: string): Promise<HorariosEdificio> {
    return this.service.obtener(consorcioId);
  }

  /** Sólo la Secretaría y el Administrador editan. Cuerpo: `{ franjas: { lunes: [{desde, hasta}, …], … } }` o `{ aCoordinar: true }`. */
  @Put('consorcios/:consorcioId/horarios')
  @Roles('secretaria', 'administrador')
  guardar(@Param('consorcioId') consorcioId: string, @Body() cuerpo: unknown, @UsuarioActual() usuario: UsuarioAutenticado): Promise<HorariosEdificio> {
    return this.service.guardar(consorcioId, cuerpo, usuario.usuario);
  }

  /** ¿Está abierto ahora (o en `?en=` ISO 8601)? Los feriados cuentan como cerrado; «A coordinar» no está abierto. */
  @Get('consorcios/:consorcioId/horarios/abierto')
  @Roles('secretaria', 'administrador', 'rt_calle', 'firmante')
  abierto(@Param('consorcioId') consorcioId: string, @Query('en') en?: string): Promise<EstadoApertura> {
    return this.service.estaAbierto(consorcioId, en);
  }
}

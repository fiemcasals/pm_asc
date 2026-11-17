import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { BackofficeService } from './backoffice.service';
import { PaginaMonitoreo, RemitoEca } from './backoffice.types';

/** Monitoreo del backoffice: sólo la Secretaría y el Administrador (HU-05 RF-01). */
@Controller('backoffice')
@Roles('secretaria', 'administrador')
export class BackofficeController {
  constructor(private readonly service: BackofficeService) {}

  /** Listado paginado de visitas por equipo. Filtros: `direccion`, `eca`, `inspector`, `estado`; paginación: `pagina`, `porPagina`. */
  @Get('monitoreo')
  monitoreo(@Query() query: Record<string, unknown>): Promise<PaginaMonitoreo> {
    return this.service.monitoreo(query);
  }

  /** Registra el envío del remito digital de una visita a la empresa conservadora. */
  @Post('remito-eca')
  remitoEca(@Body() cuerpo: unknown, @UsuarioActual() usuario: UsuarioAutenticado): Promise<RemitoEca> {
    return this.service.enviarRemito(cuerpo, usuario.usuario);
  }
}

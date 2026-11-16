import { Body, Controller, Get, Post } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { ParadasService } from './paradas.service';
import { ReporteParada } from './paradas.types';

@Controller('paradas')
export class ParadasController {
  constructor(private readonly service: ParadasService) {}

  /** El RT de Calle reporta un equipo parado: causa y al menos una foto. Avisa a la Secretaría y al Firmante. */
  @Post()
  @Roles('rt_calle', 'secretaria', 'administrador')
  registrar(@Body() body: unknown, @UsuarioActual() usuario: UsuarioAutenticado): ReporteParada {
    return this.service.registrar(body, usuario.usuario);
  }

  /** Los reportes de parada pendientes de confirmación. */
  @Get()
  @Roles('secretaria', 'administrador', 'firmante')
  listar(): ReporteParada[] {
    return this.service.listar();
  }
}

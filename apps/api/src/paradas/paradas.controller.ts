import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { ParadasService } from './paradas.service';
import { ReporteParada } from './paradas.types';

@Controller('paradas')
export class ParadasController {
  constructor(private readonly service: ParadasService) {}

  /** El RT de Calle marca un equipo «Fuera de Servicio» o «Reparación Urgente» (por defecto, fuera de servicio): causa y al menos una foto. */
  @Post()
  @Roles('rt_calle', 'secretaria', 'administrador')
  registrar(@Body() body: unknown, @UsuarioActual() usuario: UsuarioAutenticado): ReporteParada {
    return this.service.registrar(body, usuario.usuario);
  }

  /** Los reportes: la Secretaría y el Administrador ven todos; un Firmante, los de sus edificios. */
  @Get()
  @Roles('secretaria', 'administrador', 'firmante')
  listar(@UsuarioActual() usuario: UsuarioAutenticado): ReporteParada[] {
    return this.service.listar(usuario);
  }

  /** HU-06 RF-05: el Firmante asignado confirma el estado que marcó el RT. */
  @Post(':id/confirmar')
  @HttpCode(200)
  @Roles('rt_calle', 'secretaria', 'administrador', 'firmante', 'eca')
  confirmar(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado): ReporteParada {
    return this.service.resolver(id, 'confirmar', usuario);
  }

  /** HU-06 RF-05: el Firmante asignado rechaza el estado (con motivo): el equipo sigue normal. */
  @Post(':id/rechazar')
  @HttpCode(200)
  @Roles('rt_calle', 'secretaria', 'administrador', 'firmante', 'eca')
  rechazar(@Param('id') id: string, @Body() body: { motivo?: unknown } | undefined, @UsuarioActual() usuario: UsuarioAutenticado): ReporteParada {
    return this.service.resolver(id, 'rechazar', usuario, body?.motivo);
  }

  /** HU-06 RF-05: el RT vuelve el equipo a «Normal» con una nueva inspección y al menos una foto. */
  @Post('maquinas/:maquinaId/normalizar')
  @HttpCode(200)
  @Roles('rt_calle')
  normalizar(@Param('maquinaId') maquinaId: string, @Body() body: unknown, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.service.normalizar(maquinaId, body, usuario.usuario);
  }
}

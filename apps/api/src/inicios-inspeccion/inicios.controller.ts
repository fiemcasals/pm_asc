import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { IniciosService } from './inicios.service';
import { InicioInspeccion } from './inicios.types';

/** Inicio de la inspección en el edificio, con validación de presencia a 30 m (HU-16 RF-02). */
@Controller('inicios-inspeccion')
export class IniciosController {
  constructor(private readonly service: IniciosService) {}

  /** El RT de Calle inicia la inspección de un edificio que tiene asignado. El usuario sale de la sesión, no del cuerpo. */
  @Post()
  @Roles('rt_calle')
  iniciar(@Body() cuerpo: unknown, @UsuarioActual() usuario: UsuarioAutenticado): Promise<InicioInspeccion> {
    return this.service.iniciar(cuerpo, usuario.usuario);
  }

  /** Para la Secretaría: los inicios con `?revision=pendiente` son las visitas «Sin buena señal GPS» por revisar. */
  @Get()
  @Roles('secretaria', 'administrador')
  listar(@Query('revision') revision?: string): Promise<InicioInspeccion[]> {
    return this.service.listar(revision);
  }

  @Post(':id/revisar')
  @Roles('secretaria', 'administrador')
  revisar(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado): Promise<InicioInspeccion> {
    return this.service.revisar(id, usuario.usuario);
  }
}

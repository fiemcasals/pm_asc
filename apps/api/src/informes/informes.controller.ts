import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { InformesService } from './informes.service';
import { InformeVisita, ResumenInforme } from './informes.types';

/** Informes de la visita: los cierra el RT de Calle; los ven la Secretaría, el Administrador y el Firmante del edificio. */
@Controller('informes-visita')
export class InformesController {
  constructor(private readonly service: InformesService) {}

  /** Cierra el informe con la firma del encargado o «Sin firma». El usuario sale de la sesión, no del cuerpo. */
  @Post()
  @Roles('rt_calle')
  crear(@Body() cuerpo: unknown, @UsuarioActual() usuario: UsuarioAutenticado): Promise<InformeVisita> {
    return this.service.crear(cuerpo, usuario.usuario);
  }

  /** `?sinFirma=true`: los informes cerrados «Sin firma», que la Secretaría y el Firmante tienen que ver. */
  @Get()
  @Roles('secretaria', 'administrador', 'firmante')
  listar(@Query('sinFirma') sinFirma?: string): Promise<ResumenInforme[]> {
    return this.service.listar(sinFirma);
  }

  @Get(':id')
  @Roles('secretaria', 'administrador', 'firmante')
  obtener(@Param('id') id: string): Promise<InformeVisita> {
    return this.service.obtener(id);
  }
}

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { AvisosService } from './avisos.service';
import { AvisoFalla, DestinosAviso } from './avisos.types';

/** Bandeja de avisos de falla crítica de la Secretaría (HU-11 RF-05). */
@Controller('avisos')
@Roles('secretaria', 'administrador')
export class AvisosController {
  constructor(private readonly service: AvisosService) {}

  /** La bandeja. `?estado=Pendiente de revisión` trae sólo los que esperan revisión. */
  @Get()
  listar(@Query('estado') estado?: string): AvisoFalla[] {
    return this.service.listar(estado);
  }

  @Get(':id')
  obtener(@Param('id') id: string): AvisoFalla {
    return this.service.obtener(id);
  }

  /** «Aprobar y enviar»: WhatsApp a la ECA y al Firmante y correo a la ECA, a nombre de quien aprueba. */
  @Post(':id/aprobar')
  aprobar(@Param('id') id: string, @Body() destinos: DestinosAviso, @UsuarioActual() usuario: UsuarioAutenticado): Promise<AvisoFalla> {
    return this.service.aprobar(id, { usuario: usuario.usuario }, destinos ?? {});
  }
}

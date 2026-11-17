import { Controller, Get } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { RtMapaService } from './rt-mapa.service';
import { MapaRt } from './rt-mapa.types';

/** El mapa de la pantalla inicial del RT de Calle (HU-16 RF-01). */
@Controller('rt')
export class RtMapaController {
  constructor(private readonly service: RtMapaService) {}

  @Get('mapa')
  @Roles('rt_calle')
  mapa(@UsuarioActual() usuario: UsuarioAutenticado): Promise<MapaRt> {
    return this.service.obtener(usuario);
  }
}

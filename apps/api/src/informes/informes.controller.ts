import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { InformesService } from './informes.service';
import { AuditoriaInforme, InformeVisita, ResumenInforme, VerificacionInforme } from './informes.types';

/** Informes de la visita: los cierra el RT de Calle; los ven la Secretaría, el Administrador y el Firmante del edificio. */
@Controller('informes-visita')
export class InformesController {
  constructor(private readonly service: InformesService) {}

  /**
   * Cierra el informe con la firma del encargado o «Sin firma» y lo sella con un hash. El usuario sale de la sesión, no del cuerpo.
   * **201** si se creó; **200** con el informe original si ya existía uno con el mismo `clientReportId` (reenvío desde la cola del celular).
   */
  @Post()
  @Roles('rt_calle')
  async crear(@Body() cuerpo: unknown, @UsuarioActual() usuario: UsuarioAutenticado, @Res({ passthrough: true }) res: Response): Promise<InformeVisita> {
    const r = await this.service.crearIdempotente(cuerpo, usuario.usuario);
    res.status(r.creado ? 201 : 200);
    return r.informe;
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

  /** Verifica que el hash del informe sigue coincidiendo con su contenido y lo deja asentado en la auditoría. */
  @Post(':id/verificar')
  @Roles('secretaria', 'administrador')
  verificar(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado): Promise<VerificacionInforme> {
    return this.service.verificar(id, usuario);
  }

  /** Las verificaciones del sello y los intentos de modificar el informe. */
  @Get(':id/auditoria')
  @Roles('secretaria', 'administrador')
  auditoria(@Param('id') id: string): Promise<AuditoriaInforme> {
    return this.service.auditoria(id);
  }

  // Un informe cerrado no se modifica ni se borra, para ningún rol: 409 y queda registrado (HU-18 RNF-01).
  @Put(':id')
  @Roles()
  reemplazar(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado): Promise<never> {
    return this.service.rechazarModificacion(id, usuario, 'PUT');
  }

  @Patch(':id')
  @Roles()
  modificar(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado): Promise<never> {
    return this.service.rechazarModificacion(id, usuario, 'PATCH');
  }

  @Delete(':id')
  @Roles()
  borrar(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado): Promise<never> {
    return this.service.rechazarModificacion(id, usuario, 'DELETE');
  }
}

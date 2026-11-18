import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.guard';
import { ChecklistMotorConfig } from './checklist.config';
import { ChecklistService, InspeccionChecklist } from './checklist.service';

@Controller('checklist')
export class ChecklistController {
  constructor(private readonly checklist: ChecklistService) {}

  /** Devuelve el motor de checklist versionado, filtrado opcionalmente por tipo de equipo. */
  @Get('config')
  @Roles('rt_calle', 'secretaria', 'administrador', 'firmante')
  obtenerConfig(@Query('tipo') tipo?: string): ChecklistMotorConfig {
    return this.checklist.obtenerConfig(tipo);
  }

  /** Registra una inspección de checklist fijando automáticamente la versión del motor usada. */
  @Post('inspecciones')
  @Roles('rt_calle')
  @HttpCode(201)
  crearInspeccion(@Body() body: unknown): Promise<InspeccionChecklist> {
    return this.checklist.crearInspeccion(body);
  }

  @Get('inspecciones/:id')
  @Roles('rt_calle', 'secretaria', 'administrador', 'firmante')
  obtenerInspeccion(@Param('id') id: string): Promise<InspeccionChecklist> {
    return this.checklist.obtenerInspeccion(id);
  }
}

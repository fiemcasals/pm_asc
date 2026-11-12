import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ChecklistMotorConfig } from './checklist.config';
import { ChecklistService, InspeccionChecklist } from './checklist.service';

@Controller('checklist')
export class ChecklistController {
  constructor(private readonly checklist: ChecklistService) {}

  /** Devuelve el motor de checklist versionado, filtrado opcionalmente por tipo de equipo. */
  @Get('config')
  obtenerConfig(@Query('tipo') tipo?: string): ChecklistMotorConfig {
    return this.checklist.obtenerConfig(tipo);
  }

  /** Registra una inspección de checklist fijando automáticamente la versión del motor usada. */
  @Post('inspecciones')
  @HttpCode(201)
  crearInspeccion(@Body() body: unknown): Promise<InspeccionChecklist> {
    return this.checklist.crearInspeccion(body);
  }

  @Get('inspecciones/:id')
  obtenerInspeccion(@Param('id') id: string): Promise<InspeccionChecklist> {
    return this.checklist.obtenerInspeccion(id);
  }
}

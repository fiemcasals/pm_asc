import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.guard';
import { DatabaseService, RlsDiagnostico } from './database.service';

@Controller('seguridad')
export class SeguridadRlsController {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Devuelve diagnóstico en vivo de RLS: rol runtime, ausencia de BYPASSRLS y políticas activas. Es información de cómo está armada la
   * base: sólo el Administrador (HU-11 RF-15).
   */
  @Get('rls')
  @Roles('administrador')
  obtenerEstadoRls(): Promise<RlsDiagnostico> {
    return this.database.inspeccionarRls();
  }
}
